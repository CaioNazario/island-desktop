import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// `Main.brightnessManager` é o mecanismo de brilho do Shell 50.x
// (js/misc/brightnessManager.js): `globalScale` é nulo sem monitor com
// backlight controlável (specs/08-controles-rapidos.md).
export class SystemBrightness {
  private readonly listeners = new Set<() => void>();

  constructor() {
    Main.brightnessManager.connectObject(
      'changed',
      () => this.notify(),
      'user-update',
      () => this.notify(),
      this,
    );
  }

  get available(): boolean {
    return Main.brightnessManager.globalScale !== null;
  }

  get percent(): number {
    return Math.round((Main.brightnessManager.globalScale?.value ?? 0) * 100);
  }

  setPercent(percent: number): void {
    const scale = Main.brightnessManager.globalScale;
    if (!scale) return;
    scale.value = Math.max(0, Math.min(100, percent)) / 100;
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    Main.brightnessManager.disconnectObject(this);
    this.listeners.clear();
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }
}
