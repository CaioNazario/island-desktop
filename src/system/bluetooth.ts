import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GnomeBluetooth from 'gi://GnomeBluetooth';

import {
  buildDeviceLists,
  type BtDeviceInfo,
  type BtDeviceLists,
  type BtOperation,
  type BtOperationKind,
  type DeviceKind,
} from '../core/bluetooth.js';
import { launchSettingsPanel } from './settingsPanel.js';

export type PairResult = 'paired' | 'needs-pin' | 'failed';

const PAIR_TIMEOUT_MS = 30_000;

// Sem agente registrado, o BlueZ recusa o que precisa de PIN/código com um
// destes (specs/08-controles-rapidos.md, "Parear").
const PIN_ERRORS = new Set([
  'org.bluez.Error.AuthenticationFailed',
  'org.bluez.Error.AuthenticationRejected',
  'org.bluez.Error.AuthenticationCanceled',
]);

const DEVICE_PROPS = [
  'alias',
  'name',
  'paired',
  'connected',
  'type',
  'battery-percentage',
  'battery-type',
];

function kindOf(type: GnomeBluetooth.Type): DeviceKind {
  switch (type) {
    case GnomeBluetooth.Type.HEADSET:
    case GnomeBluetooth.Type.HEADPHONES:
      return 'headphones';
    case GnomeBluetooth.Type.MOUSE:
      return 'mouse';
    case GnomeBluetooth.Type.KEYBOARD:
      return 'keyboard';
    case GnomeBluetooth.Type.SPEAKERS:
    case GnomeBluetooth.Type.OTHER_AUDIO:
      return 'speaker';
    case GnomeBluetooth.Type.PHONE:
      return 'phone';
    case GnomeBluetooth.Type.COMPUTER:
      return 'computer';
    case GnomeBluetooth.Type.JOYPAD:
      return 'gamepad';
    default:
      return 'other';
  }
}

function infoOf(device: GnomeBluetooth.Device): BtDeviceInfo {
  return {
    path: device.get_object_path(),
    name: device.alias || device.name || device.address,
    hasName: Boolean(device.name),
    kind: kindOf(device.type),
    paired: device.paired,
    connected: device.connected,
    // COARSE é um nível aproximado (baixo/normal/cheio), não porcentagem.
    battery:
      device.battery_type === GnomeBluetooth.BatteryType.PERCENTAGE
        ? Math.round(device.battery_percentage)
        : null,
  };
}

// Bluetooth via `GnomeBluetooth.Client` (specs/08-controles-rapidos.md, modo
// `bt`). Um cliente próprio, igual ao indicador do Shell: o dele é privado.
export class SystemBluetooth {
  private readonly client: GnomeBluetooth.Client;
  private readonly devices = new Set<GnomeBluetooth.Device>();
  private readonly cancellable = new Gio.Cancellable();
  private lists: BtDeviceLists = { paired: [], nearby: [] };
  private operation: BtOperation | null = null;
  private discoveryHolds = 0;
  private discovering = false;
  private readonly listeners = new Set<() => void>();

  constructor() {
    Gio._promisify(GnomeBluetooth.Client.prototype, 'connect_service');
    Gio._promisify(Gio.DBusProxy.prototype, 'call');
    Gio._promisify(Gio.DBusConnection.prototype, 'call');

    this.client = new GnomeBluetooth.Client();
    this.client.connectObject(
      'notify::default-adapter',
      () => this.syncAdapter(),
      'notify::default-adapter-powered',
      () => this.syncAdapter(),
      this,
    );
    this.client.get_devices().connectObject('items-changed', () => this.syncDevices(), this);
    this.syncDevices();
  }

  /** Há adaptador. Sem ele, o tile e o modo somem. */
  get available(): boolean {
    return Boolean(this.client.default_adapter);
  }

  get radioOn(): boolean {
    return this.available && this.client.default_adapter_powered;
  }

  get paired(): BtDeviceLists['paired'] {
    return this.lists.paired;
  }

  get nearby(): BtDeviceLists['nearby'] {
    return this.lists.nearby;
  }

  get connectedCount(): number {
    return this.lists.paired.filter((device) => device.connected).length;
  }

  get busy(): boolean {
    return this.operation !== null;
  }

  setRadio(on: boolean): void {
    if (this.available) this.client.default_adapter_powered = on;
  }

  /**
   * A busca roda só enquanto `bt` está aberto. Contada: na troca de monitor,
   * a ilha nova pode abrir `bt` antes de a antiga fechar.
   */
  holdDiscovery(): () => void {
    this.discoveryHolds++;
    this.syncDiscovery();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.discoveryHolds--;
      this.syncDiscovery();
    };
  }

  connect(path: string): void {
    void this.run(path, 'connecting', () => this.connectService(path, true));
  }

  disconnect(path: string): void {
    void this.run(path, 'disconnecting', () => this.connectService(path, false));
  }

  /**
   * Pareia e conecta. Resolve `needs-pin` quando o dispositivo pediu PIN ou
   * código, que só as Configurações sabem pedir.
   */
  pair(path: string): Promise<PairResult> {
    return this.run(path, 'pairing', () => this.pairAndConnect(path)).then(
      (result) => result ?? 'failed',
    );
  }

  openSettings(): void {
    launchSettingsPanel('bluetooth');
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    // `disable()` roda a cada bloqueio de tela: a busca não pode ficar ligada.
    if (this.discovering) this.client.default_adapter_setup_mode = false;
    // Um `Pair()` sem resposta fica pendente no BlueZ.
    if (this.operation?.kind === 'pairing') {
      this.deviceAt(this.operation.path)
        ?.proxy.call('CancelPairing', null, Gio.DBusCallFlags.NONE, -1, null)
        .catch(() => {});
    }
    this.cancellable.cancel();
    this.devices.forEach((device) => device.disconnectObject(this));
    this.devices.clear();
    this.client.get_devices().disconnectObject(this);
    this.client.disconnectObject(this);
    this.listeners.clear();
  }

  private async run<T>(
    path: string,
    kind: BtOperationKind,
    operation: () => Promise<T>,
  ): Promise<T | null> {
    if (this.operation) return null;
    this.operation = { path, kind };
    this.rebuild();
    try {
      return await operation();
    } catch (error) {
      if (!this.cancellable.is_cancelled())
        console.error(`Island: Bluetooth ${kind} failed for ${path}: ${(error as Error).message}`);
      return null;
    } finally {
      if (!this.cancellable.is_cancelled()) {
        this.operation = null;
        this.rebuild();
      }
    }
  }

  private async connectService(path: string, connect: boolean): Promise<void> {
    await this.client.connect_service(path, connect, this.cancellable);
  }

  // O `GnomeBluetooth.Client` não tem método de parear: `Pair()` direto no
  // `org.bluez.Device1`, sem agente (validado no spike S3).
  private async pairAndConnect(path: string): Promise<PairResult> {
    const proxy = this.deviceAt(path)?.proxy;
    if (!proxy) return 'failed';

    try {
      await proxy.call('Pair', null, Gio.DBusCallFlags.NONE, PAIR_TIMEOUT_MS, this.cancellable);
    } catch (error) {
      if (!(error instanceof GLib.Error)) throw error;
      // Fora do modo de pareamento o `Pair()` não falha, fica pendente.
      if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.TIMED_OUT)) {
        proxy.call('CancelPairing', null, Gio.DBusCallFlags.NONE, -1, null).catch(() => {});
        return 'failed';
      }
      if (PIN_ERRORS.has(Gio.DBusError.get_remote_error(error) ?? '')) return 'needs-pin';
      throw error;
    }

    await proxy
      .get_connection()
      .call(
        proxy.get_name(),
        path,
        'org.freedesktop.DBus.Properties',
        'Set',
        new GLib.Variant('(ssv)', ['org.bluez.Device1', 'Trusted', GLib.Variant.new_boolean(true)]),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        this.cancellable,
      );
    await this.connectService(path, true);
    return 'paired';
  }

  private deviceAt(path: string): GnomeBluetooth.Device | null {
    for (const device of this.devices) if (device.get_object_path() === path) return device;
    return null;
  }

  private syncAdapter(): void {
    this.syncDiscovery();
    this.rebuild();
  }

  // Só escreve quando o estado desejado muda: não desliga uma busca que as
  // Configurações ligaram. Rádio religado com `bt` aberto: a busca volta.
  private syncDiscovery(): void {
    const on = this.discoveryHolds > 0 && this.radioOn;
    if (on === this.discovering) return;
    this.discovering = on;
    this.client.default_adapter_setup_mode = on;
  }

  private syncDevices(): void {
    const store = this.client.get_devices();
    const current = new Set<GnomeBluetooth.Device>();
    for (let i = 0; i < store.get_n_items(); i++) {
      const device = store.get_item(i) as GnomeBluetooth.Device | null;
      if (device) current.add(device);
    }

    for (const device of this.devices) {
      if (current.has(device)) continue;
      device.disconnectObject(this);
      this.devices.delete(device);
    }
    for (const device of current) {
      if (this.devices.has(device)) continue;
      this.devices.add(device);
      for (const prop of DEVICE_PROPS)
        device.connectObject(`notify::${prop}`, () => this.rebuild(), this);
    }
    this.rebuild();
  }

  private rebuild(): void {
    const infos = this.radioOn ? [...this.devices].map(infoOf) : [];
    this.lists = buildDeviceLists(infos, this.operation);
    this.listeners.forEach((callback) => callback());
  }
}
