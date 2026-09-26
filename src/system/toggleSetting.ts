import Gio from 'gi://Gio';

export interface ToggleSource {
  readonly on: boolean;
  toggle(): void;
  onChange(callback: () => void): () => void;
}

// Wrapper genérico pra um boolean de GSettings usado como toggle (specs/08:
// modo noturno e não perturbe). `invert` cobre `show-banners`, cujo sentido é
// oposto ao do tile "Não perturbe".
export class GSettingsToggle implements ToggleSource {
  private readonly settings: Gio.Settings;
  private readonly key: string;
  private readonly invert: boolean;
  private readonly listeners = new Set<() => void>();

  constructor(schemaId: string, key: string, invert = false) {
    this.settings = new Gio.Settings({ schema_id: schemaId });
    this.key = key;
    this.invert = invert;
    this.settings.connectObject(`changed::${key}`, () => this.notify(), this);
  }

  get on(): boolean {
    const value = this.settings.get_boolean(this.key);
    return this.invert ? !value : value;
  }

  toggle(): void {
    this.settings.set_boolean(this.key, !this.settings.get_boolean(this.key));
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.settings.disconnectObject(this);
    this.listeners.clear();
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }
}
