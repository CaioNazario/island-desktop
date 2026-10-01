import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {
  advance,
  parse,
  phaseNotification,
  type PomodoroPhase,
  type PomodoroState,
  serialize,
  toggle,
} from '../core/pomodoro.js';

const STATE_KEY = 'pomodoro-state';

export interface PomodoroSource {
  readonly state: PomodoroState;
  /** Rodando ↔ pausado. */
  toggle(): void;
  onChange(callback: () => void): () => void;
}

// Pomodoro único para todas as barras (specs/16-widgets.md `pomodoro`). O
// vencimento de fase é um timeout só, com o widget visível ou não; a troca
// entra como notificação da Island, que a ilha roteia (spec 04). Destruir
// (a cada bloqueio de tela) salva pausado.
export class SystemPomodoro implements PomodoroSource {
  private readonly settings: Gio.Settings;
  private readonly icon: Gio.Icon;
  private readonly listeners = new Set<() => void>();
  private current: PomodoroState;
  private timerId: number | null = null;
  private source: MessageTray.Source | null = null;

  constructor(settings: Gio.Settings, icon: Gio.Icon) {
    this.settings = settings;
    this.icon = icon;
    this.current = parse(settings.get_string(STATE_KEY));
  }

  get state(): PomodoroState {
    return this.current;
  }

  toggle(): void {
    this.current = toggle(this.current, Date.now());
    this.save();
    this.schedule();
    this.notify();
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.clearTimer();
    this.save();
    this.listeners.clear();
    this.source?.disconnectObject(this);
    this.source = null;
  }

  private schedule(): void {
    this.clearTimer();
    const { endsAt } = this.current;
    if (endsAt === null) return;
    const delay = Math.max(0, endsAt - Date.now());
    this.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
      this.timerId = null;
      this.onPhaseEnd();
      return GLib.SOURCE_REMOVE;
    });
  }

  private onPhaseEnd(): void {
    const { state, started } = advance(this.current, Date.now());
    this.current = state;
    if (started) this.announce(started);
    this.save();
    this.schedule();
    this.notify();
  }

  private announce(started: PomodoroPhase): void {
    const { title, body } = phaseNotification(started);
    const source = this.traySource();
    source.addNotification(new MessageTray.Notification({ source, title, body }));
  }

  private traySource(): MessageTray.Source {
    if (this.source) return this.source;
    const source = new MessageTray.Source({ title: 'Island', icon: this.icon });
    source.connectObject('destroy', () => (this.source = null), this);
    Main.messageTray.add(source);
    this.source = source;
    return source;
  }

  private save(): void {
    this.settings.set_string(STATE_KEY, serialize(this.current, Date.now()));
  }

  private clearTimer(): void {
    if (this.timerId === null) return;
    GLib.Source.remove(this.timerId);
    this.timerId = null;
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }
}
