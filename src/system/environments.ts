import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
  sanitizeEnvironments,
  sanitizeIndex,
  stepIndex,
  toStored,
  type Environment,
  type StoredEnvironment,
} from '../core/environments.js';

/** +1 para frente, −1 para trás: o sentido da animação da troca (specs/15-ambientes.md). */
export type SwitchDirection = 1 | -1;

export interface EnvironmentSource {
  readonly environments: readonly Environment[];
  readonly index: number;
  readonly active: Environment;
  step(direction: SwitchDirection): void;
  select(index: number): void;
  /** `direction` só vem quando o ambiente ativo mudou. */
  onChange(callback: (direction?: SwitchDirection) => void): () => void;
}

// GSettings `environments` e `environment-index` (specs/13-preferencias.md).
// Toda troca grava na hora; a UI reage ao `changed::`, venha a mudança daqui
// ou de fora (editor, dconf).
export class SystemEnvironments implements EnvironmentSource {
  private readonly settings: Gio.Settings;
  private readonly listeners = new Set<(direction?: SwitchDirection) => void>();
  private envs: Environment[] = [];
  private activeIndex = 0;
  // Sentido pedido pela última troca feita aqui: na volta circular o índice
  // anda ao contrário do gesto.
  private pendingDirection: SwitchDirection | null = null;

  constructor(settings: Gio.Settings) {
    this.settings = settings;
    this.read();
    settings.connectObject(
      'changed::environments',
      () => this.sync(),
      'changed::environment-index',
      () => this.sync(),
      this,
    );
  }

  get environments(): readonly Environment[] {
    return this.envs;
  }

  get index(): number {
    return this.activeIndex;
  }

  get active(): Environment {
    return this.envs[this.activeIndex]!;
  }

  step(direction: SwitchDirection): void {
    this.write(stepIndex(this.activeIndex, this.envs.length, direction), direction);
  }

  select(index: number): void {
    if (index === this.activeIndex) return;
    this.write(index, index > this.activeIndex ? 1 : -1);
  }

  /** Grava a lista inteira (editor, spec 17). */
  setEnvironments(envs: readonly Environment[]): void {
    this.settings.set_value('environments', new GLib.Variant('a(ssasas)', toStored(envs)));
  }

  onChange(callback: (direction?: SwitchDirection) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.settings.disconnectObject(this);
    this.listeners.clear();
  }

  private write(index: number, direction: SwitchDirection): void {
    if (index === this.activeIndex) return;
    this.pendingDirection = direction;
    this.settings.set_uint('environment-index', index);
  }

  private read(): void {
    const stored = this.settings.get_value('environments').deepUnpack<StoredEnvironment[]>();
    this.envs = sanitizeEnvironments(stored);
    this.activeIndex = sanitizeIndex(this.settings.get_uint('environment-index'), this.envs.length);
  }

  private sync(): void {
    const previous = this.activeIndex;
    this.read();
    let direction: SwitchDirection | undefined;
    if (this.activeIndex !== previous)
      direction = this.pendingDirection ?? (this.activeIndex > previous ? 1 : -1);
    this.pendingDirection = null;
    this.listeners.forEach((callback) => callback(direction));
  }
}
