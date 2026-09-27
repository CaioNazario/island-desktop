import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export interface BatterySource {
  /** Sem bateria (desktop) → o botão some. */
  readonly available: boolean;
  readonly percentage: number;
  readonly charging: boolean;
  onChange(callback: () => void): () => void;
}

// Proxy do `DisplayDevice` que o `PowerToggle` do Shell 50.4 cria
// (js/ui/status/system.js): `makeProxyWrapper` expõe as propriedades D-Bus
// como getters, `null` até a inicialização assíncrona terminar.
interface DisplayDeviceProxy extends Gio.DBusProxy {
  readonly IsPresent: boolean | null;
  readonly Percentage: number | null;
  readonly State: number | null;
}

interface ShellPowerToggle extends GObject.Object {
  readonly _proxy: DisplayDeviceProxy;
}

// `Main.panel.statusArea.quickSettings._system` nasce dentro de
// `_setupIndicators()`, que é assíncrono (panel.js): no `enable()` do startup
// ele pode ainda não existir.
function shellPowerToggle(): ShellPowerToggle | null {
  const quickSettings = Main.panel.statusArea.quickSettings as unknown as {
    _system?: { _systemItem?: { powerToggle?: ShellPowerToggle } };
  };
  return quickSettings._system?._systemItem?.powerToggle ?? null;
}

const ATTACH_RETRY_MS = 500;
const ATTACH_MAX_TRIES = 20;

// "Carregando" (specs/11-bateria.md), incluindo `PendingCharge`: na tomada,
// parado pelo limite de carga. Valores de `UpDeviceState` (UPowerGlib).
const CHARGING_STATES: ReadonlySet<number> = new Set([
  1, // CHARGING
  4, // FULLY_CHARGED
  5, // PENDING_CHARGE
]);

// Bateria via o proxy UPower que o Shell já usa (specs/11-bateria.md).
export class SystemBattery implements BatterySource {
  private toggle: ShellPowerToggle | null = null;
  private retryId: number | null = null;
  private readonly listeners = new Set<() => void>();

  constructor() {
    if (this.attach()) return;
    let tries = 0;
    this.retryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ATTACH_RETRY_MS, () => {
      tries++;
      if (!this.attach() && tries < ATTACH_MAX_TRIES) return GLib.SOURCE_CONTINUE;
      this.retryId = null;
      return GLib.SOURCE_REMOVE;
    });
  }

  get available(): boolean {
    return this.proxy?.IsPresent === true;
  }

  get percentage(): number {
    return this.proxy?.Percentage ?? 0;
  }

  get charging(): boolean {
    const state = this.proxy?.State;
    return state !== null && state !== undefined && CHARGING_STATES.has(state);
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    if (this.retryId !== null) {
      GLib.Source.remove(this.retryId);
      this.retryId = null;
    }
    this.toggle?._proxy.disconnectObject(this);
    this.toggle?.disconnectObject(this);
    this.toggle = null;
    this.listeners.clear();
  }

  private get proxy(): DisplayDeviceProxy | null {
    return this.toggle?._proxy ?? null;
  }

  private attach(): boolean {
    const toggle = shellPowerToggle();
    if (!toggle) return false;
    this.toggle = toggle;
    toggle._proxy.connectObject('g-properties-changed', () => this.notify(), this);
    // O Shell não emite nada quando o proxy termina de inicializar, mas
    // sincroniza o toggle nesse momento: `visible` = `IsPresent`, `title` = %.
    toggle.connectObject(
      'notify::visible',
      () => this.notify(),
      'notify::title',
      () => this.notify(),
      this,
    );
    this.notify();
    return true;
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }
}
