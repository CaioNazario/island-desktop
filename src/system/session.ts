import type GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

export type PowerAction = 'suspend' | 'restart' | 'power-off' | 'logout' | 'lock';

// `SystemActions` do Shell 50.4 (js/misc/systemActions.js, tag 50.4): o
// @girs (50.0.4) não declara os `activate*` nem os signals `notify::can-*`.
interface ShellSystemActions extends GObject.Object {
  readonly canSuspend: boolean;
  readonly canRestart: boolean;
  readonly canPowerOff: boolean;
  readonly canLogout: boolean;
  readonly canLockScreen: boolean;
  activateSuspend(): void;
  activateRestart(): void;
  activatePowerOff(): void;
  activateLogout(): void;
  activateLockScreen(): void;
}

const SETTINGS_APP_ID = 'org.gnome.Settings.desktop';

// Configurações e ações de energia (specs/09-sessao-energia.md) pelas mesmas
// chamadas do menu de sistema nativo: Reiniciar, Desligar e Sair passam pelo
// gnome-session, que mostra o `EndSessionDialog`; Suspender e Bloquear agem
// direto.
export class SystemSession {
  private readonly actions: ShellSystemActions;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.actions = SystemActions.getDefault() as unknown as ShellSystemActions;
    this.actions.connectObject(
      'notify::can-suspend',
      () => this.notify(),
      'notify::can-restart',
      () => this.notify(),
      'notify::can-power-off',
      () => this.notify(),
      'notify::can-logout',
      () => this.notify(),
      'notify::can-lock-screen',
      () => this.notify(),
      this,
    );
    Main.sessionMode.connectObject('updated', () => this.notify(), this);
  }

  /** Como o `SettingsItem` nativo (js/ui/status/system.js): some sem o app ou com a sessão bloqueando. */
  get settingsAvailable(): boolean {
    return this.settingsApp() !== null && Boolean(Main.sessionMode.allowSettings);
  }

  openSettings(): void {
    Main.overview.hide();
    this.settingsApp()?.activate();
  }

  canRun(action: PowerAction): boolean {
    switch (action) {
      case 'suspend':
        return this.actions.canSuspend;
      case 'restart':
        return this.actions.canRestart;
      case 'power-off':
        return this.actions.canPowerOff;
      case 'logout':
        return this.actions.canLogout;
      case 'lock':
        return this.actions.canLockScreen;
    }
  }

  run(action: PowerAction): void {
    if (!this.canRun(action)) return;
    switch (action) {
      case 'suspend':
        return this.actions.activateSuspend();
      case 'restart':
        return this.actions.activateRestart();
      case 'power-off':
        return this.actions.activatePowerOff();
      case 'logout':
        return this.actions.activateLogout();
      case 'lock':
        return this.actions.activateLockScreen();
    }
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.actions.disconnectObject(this);
    Main.sessionMode.disconnectObject(this);
    this.listeners.clear();
  }

  private settingsApp(): Shell.App | null {
    return Shell.AppSystem.get_default().lookup_app(SETTINGS_APP_ID);
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }
}
