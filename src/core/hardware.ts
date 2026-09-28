// Grupo de hardware da pílula direita (specs/10-hardware.md; design/logic.js
// `hw`, ~286): leitura de /proc, contas por delta, limiares e formatação.

export type HardwareBlockId = 'cpu' | 'ram' | 'gpu' | 'temp' | 'net';

/** `busy`: CPU ≥60% (`accent-300`); `hot`: TEMP ≥70° (vermelho de alerta). */
export type HardwareTone = 'normal' | 'busy' | 'hot';

export interface HardwareBlock {
  id: HardwareBlockId;
  label: string;
  value: string;
  tone: HardwareTone;
}

/** Valor mais largo de cada bloco, usado para fixar a largura (dígitos tabulares). */
export const WIDEST_VALUE: Record<HardwareBlockId, string> = {
  cpu: '100%',
  ram: '99.9G',
  gpu: '100%',
  temp: '100°',
  net: '↓99.9',
};

const CPU_BUSY = 60;
const TEMP_HOT = 70;
const GIB = 1024 ** 3;
const MB = 1000 ** 2;

export interface CpuTimes {
  idle: number;
  total: number;
}

/**
 * Linha `cpu` de /proc/stat. O total soma user…steal; `guest`/`guest_nice`
 * já estão contados em user/nice. Idle inclui `iowait`.
 */
export function parseCpuTimes(stat: string): CpuTimes | null {
  const line = stat.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const fields = line.trim().split(/\s+/).slice(1, 9).map(Number);
  if (fields.length < 5 || fields.some((n) => !Number.isFinite(n))) return null;
  const [, , , idle = 0, iowait = 0] = fields;
  return { idle: idle + iowait, total: fields.reduce((a, b) => a + b, 0) };
}

/** `1 − Δidle/Δtotal`, em %. Sem avanço dos contadores, 0. */
export function cpuUsage(prev: CpuTimes, cur: CpuTimes): number {
  const total = cur.total - prev.total;
  if (total <= 0) return 0;
  return clampPercent((1 - (cur.idle - prev.idle) / total) * 100);
}

export interface Memory {
  totalBytes: number;
  usedBytes: number;
}

/** /proc/meminfo: usada = `MemTotal − MemAvailable`. */
export function parseMeminfo(meminfo: string): Memory | null {
  const kib = (key: string): number | null => {
    const match = new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, 'm').exec(meminfo);
    return match ? Number(match[1]) * 1024 : null;
  };
  const total = kib('MemTotal');
  const available = kib('MemAvailable');
  if (total === null || available === null) return null;
  return { totalBytes: total, usedBytes: Math.max(0, total - available) };
}

/** `100 − Δidle_ms/Δt_ms × 100` (RC6 do i915, `idle_residency_ms` do xe). */
export function busyFromIdleResidency(prevMs: number, curMs: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return clampPercent(100 - ((curMs - prevMs) / elapsedMs) * 100);
}

const VIRTUAL_INTERFACE = /^(lo|docker|veth|br-|virbr|tun|wg)/;

export function isPhysicalInterface(name: string): boolean {
  return !VIRTUAL_INTERFACE.test(name);
}

export interface NetBytes {
  rx: number;
  tx: number;
}

/** /proc/net/dev: soma rx/tx em bytes das interfaces físicas. */
export function parseNetDev(netDev: string): NetBytes {
  const sum = { rx: 0, tx: 0 };
  for (const line of netDev.split('\n')) {
    const counters = parseNetDevLine(line);
    if (!counters) continue;
    sum.rx += counters.rx;
    sum.tx += counters.tx;
  }
  return sum;
}

// `iface: rx_bytes … (8 campos de recepção) tx_bytes …`; cabeçalho e
// interface virtual dão `null`.
function parseNetDevLine(line: string): NetBytes | null {
  const colon = line.indexOf(':');
  if (colon < 0 || !isPhysicalInterface(line.slice(0, colon).trim())) return null;
  const fields = line
    .slice(colon + 1)
    .trim()
    .split(/\s+/)
    .map(Number);
  const [rx, tx] = [fields[0], fields[8]];
  if (rx === undefined || tx === undefined) return null;
  return Number.isFinite(rx) && Number.isFinite(tx) ? { rx, tx } : null;
}

export interface NetRates {
  downBytesPerSecond: number;
  upBytesPerSecond: number;
}

/** Contador que volta (interface recriada) conta como 0, não negativo. */
export function netRates(prev: NetBytes, cur: NetBytes, elapsedMs: number): NetRates {
  if (elapsedMs <= 0) return { downBytesPerSecond: 0, upBytesPerSecond: 0 };
  const perSecond = (delta: number): number => (Math.max(0, delta) * 1000) / elapsedMs;
  return {
    downBytesPerSecond: perSecond(cur.rx - prev.rx),
    upBytesPerSecond: perSecond(cur.tx - prev.tx),
  };
}

export interface HardwareReading {
  cpu: number;
  memory: Memory;
  /** `null`: nenhuma GPU reconhecida, o bloco some. */
  gpu: number | null;
  /** °C; `null`: nenhum sensor, o bloco some. */
  temp: number | null;
  net: NetRates;
}

export function hardwareBlocks(reading: HardwareReading): HardwareBlock[] {
  return [
    cpuBlock(reading.cpu),
    ramBlock(reading.memory),
    reading.gpu === null ? null : gpuBlock(reading.gpu),
    reading.temp === null ? null : tempBlock(reading.temp),
    netBlock(reading.net),
  ].filter((block) => block !== null);
}

function cpuBlock(percent: number): HardwareBlock {
  const cpu = Math.round(clampPercent(percent));
  const tone = cpu >= CPU_BUSY ? 'busy' : 'normal';
  return { id: 'cpu', label: 'CPU', value: `${cpu}%`, tone };
}

function ramBlock(memory: Memory): HardwareBlock {
  const used = oneDecimal(memory.usedBytes / GIB);
  return { id: 'ram', label: 'RAM', value: `${used}G`, tone: 'normal' };
}

function gpuBlock(percent: number): HardwareBlock {
  const gpu = Math.round(clampPercent(percent));
  return { id: 'gpu', label: 'GPU', value: `${gpu}%`, tone: 'normal' };
}

function tempBlock(celsius: number): HardwareBlock {
  const temp = Math.round(celsius);
  const tone = temp >= TEMP_HOT ? 'hot' : 'normal';
  return { id: 'temp', label: 'TEMP', value: `${temp}°`, tone };
}

function netBlock(net: NetRates): HardwareBlock {
  const down = megabytes(net.downBytesPerSecond);
  return { id: 'net', label: 'NET', value: `↓${down}`, tone: 'normal' };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function oneDecimal(value: number): string {
  return value.toFixed(1);
}

/** MB/s com 1 casa; ≥100 sem casa. Decide pelo valor arredondado: 99.96 vira `100`, não `100.0`. */
function megabytes(bytesPerSecond: number): string {
  const tenths = Math.round((bytesPerSecond / MB) * 10) / 10;
  return tenths >= 100 ? tenths.toFixed(0) : tenths.toFixed(1);
}
