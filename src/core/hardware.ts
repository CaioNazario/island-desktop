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
  tooltip: string;
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
const KB = 1000;

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
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim();
    if (!isPhysicalInterface(name)) continue;
    const fields = line
      .slice(colon + 1)
      .trim()
      .split(/\s+/)
      .map(Number);
    const rx = fields[0];
    const tx = fields[8];
    if (rx === undefined || tx === undefined || !Number.isFinite(rx) || !Number.isFinite(tx)) {
      continue;
    }
    sum.rx += rx;
    sum.tx += tx;
  }
  return sum;
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
  const cpu = Math.round(clampPercent(reading.cpu));
  const blocks: HardwareBlock[] = [
    {
      id: 'cpu',
      label: 'CPU',
      value: `${cpu}%`,
      tone: cpu >= CPU_BUSY ? 'busy' : 'normal',
      tooltip: `CPU ${cpu}%`,
    },
    {
      id: 'ram',
      label: 'RAM',
      value: `${oneDecimal(reading.memory.usedBytes / GIB)}G`,
      tone: 'normal',
      tooltip: `RAM ${oneDecimal(reading.memory.usedBytes / GIB)} / ${oneDecimal(
        reading.memory.totalBytes / GIB,
      )} GB`,
    },
  ];
  if (reading.gpu !== null) {
    const gpu = Math.round(clampPercent(reading.gpu));
    blocks.push({
      id: 'gpu',
      label: 'GPU',
      value: `${gpu}%`,
      tone: 'normal',
      tooltip: `GPU ${gpu}%`,
    });
  }
  if (reading.temp !== null) {
    const temp = Math.round(reading.temp);
    blocks.push({
      id: 'temp',
      label: 'TEMP',
      value: `${temp}°`,
      tone: temp >= TEMP_HOT ? 'hot' : 'normal',
      tooltip: `Temperatura ${temp}°C`,
    });
  }
  const down = megabytes(reading.net.downBytesPerSecond);
  const up = Math.round(reading.net.upBytesPerSecond / KB);
  blocks.push({
    id: 'net',
    label: 'NET',
    value: `↓${down}`,
    tone: 'normal',
    tooltip: `Rede ↓${down} MB/s ↑${up} KB/s`,
  });
  return blocks;
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
