import Gvc from 'gi://Gvc';
import { getMixerControl } from 'resource:///org/gnome/shell/ui/status/volume.js';

// Reaproveita o `Gvc.MixerControl` do próprio Shell (specs/08-controles-rapidos.md)
// em vez de abrir uma segunda conexão com o PulseAudio.
export class SystemVolume {
  private readonly control: Gvc.MixerControl;
  private stream: Gvc.MixerStream | null = null;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.control = getMixerControl();
    this.control.connectObject(
      'state-changed',
      () => this.syncStream(),
      'default-sink-changed',
      () => this.syncStream(),
      this,
    );
    this.syncStream();
  }

  get percent(): number {
    if (!this.stream) return 0;
    return Math.round((this.stream.volume / this.control.get_vol_max_norm()) * 100);
  }

  get muted(): boolean {
    return this.stream?.is_muted ?? true;
  }

  setPercent(percent: number): void {
    if (!this.stream) return;
    const clamped = Math.max(0, Math.min(100, percent));
    this.stream.set_volume(Math.round((clamped / 100) * this.control.get_vol_max_norm()));
    this.stream.push_volume();
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.control.disconnectObject(this);
    this.stream?.disconnectObject(this);
    this.listeners.clear();
  }

  private syncStream(): void {
    this.stream?.disconnectObject(this);
    this.stream =
      this.control.get_state() === Gvc.MixerControlState.READY
        ? this.control.get_default_sink()
        : null;
    this.stream?.connectObject(
      'notify::volume',
      () => this.notify(),
      'notify::is-muted',
      () => this.notify(),
      this,
    );
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }
}
