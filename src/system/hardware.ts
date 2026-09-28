import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
  busyFromIdleResidency,
  cpuUsage,
  hardwareBlocks,
  netRates,
  parseCpuTimes,
  parseMeminfo,
  parseNetDev,
  type CpuTimes,
  type HardwareBlock,
  type Memory,
  type NetBytes,
} from '../core/hardware.js';

export interface HardwareSource {
  /** Vazio até a segunda amostra: CPU e rede precisam de delta. */
  readonly blocks: readonly HardwareBlock[];
  onChange(callback: () => void): () => void;
}

const SAMPLE_SECONDS = 1;

// `busy`: o arquivo já é o %; `idle`: residência em ms, vira % por delta.
interface GpuSource {
  kind: 'busy' | 'idle';
  path: string;
}

// Ordem da spec 10: amdgpu → i915 → xe, a primeira que existir em qualquer card.
const GPU_CANDIDATES: readonly { kind: GpuSource['kind']; file: string }[] = [
  { kind: 'busy', file: 'device/gpu_busy_percent' },
  { kind: 'idle', file: 'power/rc6_residency_ms' },
  { kind: 'idle', file: 'device/tile0/gt0/gtidle/idle_residency_ms' },
];

// Ordem da spec 10: coretemp → k10temp → thermal zone `x86_pkg_temp`.
const HWMON_SENSORS: readonly { name: string; label: string }[] = [
  { name: 'coretemp', label: 'Package id 0' },
  { name: 'k10temp', label: 'Tctl' },
];

interface Counters {
  atUs: number;
  cpu: CpuTimes;
  net: NetBytes;
  gpuIdleMs: number | null;
}

interface Snapshot {
  counters: Counters;
  memory: Memory;
  gpuValue: number | null;
  tempMilli: number | null;
}

const decoder = new TextDecoder();

// Qualquer erro (arquivo ausente, permissão, cancelamento) vira `null`: a
// descoberta testa caminhos que podem não existir.
async function readText(path: string, cancellable: Gio.Cancellable): Promise<string | null> {
  try {
    const [bytes] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

async function readNumber(path: string, cancellable: Gio.Cancellable): Promise<number | null> {
  const text = (await readText(path, cancellable))?.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

async function listDir(path: string, cancellable: Gio.Cancellable): Promise<string[]> {
  try {
    const enumerator = await Gio.File.new_for_path(path).enumerate_children_async(
      'standard::name',
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_DEFAULT,
      cancellable,
    );
    const names: string[] = [];
    for (;;) {
      const infos = await enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, cancellable);
      if (infos.length === 0) break;
      names.push(...infos.map((info) => info.get_name()));
    }
    await enumerator.close_async(GLib.PRIORITY_DEFAULT, null);
    return names.sort();
  } catch {
    return [];
  }
}

async function findGpu(cancellable: Gio.Cancellable): Promise<GpuSource | null> {
  const cards = (await listDir('/sys/class/drm', cancellable)).filter((name) =>
    /^card\d+$/.test(name),
  );
  const candidates = GPU_CANDIDATES.flatMap(({ kind, file }) =>
    cards.map((card) => ({ kind, path: `/sys/class/drm/${card}/${file}` })),
  );
  for (const candidate of candidates) {
    if ((await readNumber(candidate.path, cancellable)) !== null) return candidate;
  }
  return null;
}

async function findTemp(cancellable: Gio.Cancellable): Promise<string | null> {
  const hwmons = await listDir('/sys/class/hwmon', cancellable);
  const names = await Promise.all(
    hwmons.map(async (hwmon) =>
      (await readText(`/sys/class/hwmon/${hwmon}/name`, cancellable))?.trim(),
    ),
  );
  for (const sensor of HWMON_SENSORS) {
    const dirs = hwmons
      .filter((_, index) => names[index] === sensor.name)
      .map((hwmon) => `/sys/class/hwmon/${hwmon}`);
    const input = await findLabeledInput(dirs, sensor.label, cancellable);
    if (input) return input;
  }
  return findThermalZone('x86_pkg_temp', cancellable);
}

// `tempN_label` com o rótulo pedido → `tempN_input`.
async function findLabeledInput(
  dirs: string[],
  label: string,
  cancellable: Gio.Cancellable,
): Promise<string | null> {
  const listings = await Promise.all(
    dirs.map(async (dir) => (await listDir(dir, cancellable)).map((file) => `${dir}/${file}`)),
  );
  const labelFiles = listings.flat().filter((path) => /\/temp\d+_label$/.test(path));
  for (const path of labelFiles) {
    const text = (await readText(path, cancellable))?.trim();
    if (text === label) return path.replace(/_label$/, '_input');
  }
  return null;
}

async function findThermalZone(type: string, cancellable: Gio.Cancellable): Promise<string | null> {
  const zones = (await listDir('/sys/class/thermal', cancellable)).filter((name) =>
    name.startsWith('thermal_zone'),
  );
  for (const zone of zones) {
    const text = (await readText(`/sys/class/thermal/${zone}/type`, cancellable))?.trim();
    if (text === type) return `/sys/class/thermal/${zone}/temp`;
  }
  return null;
}

// Grupo de hardware (specs/10-hardware.md): descobre GPU e sensor uma vez e
// amostra a cada 1s, tudo por Gio assíncrono (nenhuma leitura síncrona no
// main loop).
export class SystemHardware implements HardwareSource {
  private readonly cancellable = new Gio.Cancellable();
  private gpu: GpuSource | null = null;
  private tempPath: string | null = null;
  private timerId: number | null = null;
  private sampling = false;
  private previous: Counters | null = null;
  // Última leitura boa: uma falha pontual não pode sumir com o bloco.
  private gpuPercent = 0;
  private tempCelsius = 0;
  private current: HardwareBlock[] = [];
  private readonly listeners = new Set<() => void>();

  constructor() {
    Gio._promisify(Gio.File.prototype, 'load_contents_async');
    Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
    Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
    Gio._promisify(Gio.FileEnumerator.prototype, 'close_async');
    void this.start();
  }

  get blocks(): readonly HardwareBlock[] {
    return this.current;
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.cancellable.cancel();
    if (this.timerId !== null) {
      GLib.Source.remove(this.timerId);
      this.timerId = null;
    }
    this.listeners.clear();
  }

  private async start(): Promise<void> {
    const [gpu, tempPath] = await Promise.all([
      findGpu(this.cancellable),
      findTemp(this.cancellable),
    ]);
    if (this.cancellable.is_cancelled()) return;
    this.gpu = gpu;
    this.tempPath = tempPath;
    void this.sample();
    this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, SAMPLE_SECONDS, () => {
      void this.sample();
      return GLib.SOURCE_CONTINUE;
    });
  }

  private async sample(): Promise<void> {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const snapshot = await this.readSnapshot();
      if (snapshot === null || this.cancellable.is_cancelled()) return;
      const previous = this.previous;
      this.previous = snapshot.counters;
      if (previous === null) return;
      this.current = this.blocksSince(previous, snapshot);
      this.listeners.forEach((callback) => callback());
    } finally {
      this.sampling = false;
    }
  }

  private async readSnapshot(): Promise<Snapshot | null> {
    const cancellable = this.cancellable;
    const [stat, meminfo, netDev, gpuValue, tempMilli] = await Promise.all([
      readText('/proc/stat', cancellable),
      readText('/proc/meminfo', cancellable),
      readText('/proc/net/dev', cancellable),
      this.gpu ? readNumber(this.gpu.path, cancellable) : null,
      this.tempPath ? readNumber(this.tempPath, cancellable) : null,
    ]);
    const cpu = stat === null ? null : parseCpuTimes(stat);
    const memory = meminfo === null ? null : parseMeminfo(meminfo);
    if (cpu === null || memory === null || netDev === null) return null;
    const atUs = GLib.get_monotonic_time();
    const gpuIdleMs = this.gpu?.kind === 'idle' ? gpuValue : null;
    const counters = { atUs, cpu, net: parseNetDev(netDev), gpuIdleMs };
    return { counters, memory, gpuValue, tempMilli };
  }

  private blocksSince(previous: Counters, snapshot: Snapshot): HardwareBlock[] {
    const { counters, gpuValue, tempMilli } = snapshot;
    const elapsedMs = (counters.atUs - previous.atUs) / 1000;
    if (this.gpu?.kind === 'busy' && gpuValue !== null) this.gpuPercent = gpuValue;
    if (counters.gpuIdleMs !== null && previous.gpuIdleMs !== null) {
      this.gpuPercent = busyFromIdleResidency(previous.gpuIdleMs, counters.gpuIdleMs, elapsedMs);
    }
    if (tempMilli !== null) this.tempCelsius = tempMilli / 1000;
    return hardwareBlocks({
      cpu: cpuUsage(previous.cpu, counters.cpu),
      memory: snapshot.memory,
      gpu: this.gpu ? this.gpuPercent : null,
      temp: this.tempPath ? this.tempCelsius : null,
      net: netRates(previous.net, counters.net, elapsedMs),
    });
  }
}
