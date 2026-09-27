import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { IslandState } from '../core/island.js';
import type { PowerAction, SystemSession } from '../system/session.js';
import { phosphor } from './icons.js';
import { colors, derivedColors } from './tokens.js';

export interface PowerToggle {
  readonly open: boolean;
  toggle(): void;
  onChange(callback: () => void): () => void;
}

/** Espelha `IslandState.powerOpen` pros atores: a ilha chama `sync()` a cada render. */
export class IslandPowerToggle implements PowerToggle {
  private readonly state: IslandState;
  private readonly listeners = new Set<() => void>();
  private lastOpen = false;

  constructor(state: IslandState) {
    this.state = state;
  }

  get open(): boolean {
    return this.state.powerOpen;
  }

  toggle(): void {
    this.state.togglePower();
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  sync(): void {
    if (this.open === this.lastOpen) return;
    this.lastOpen = this.open;
    this.listeners.forEach((callback) => callback());
  }
}

const POWER_BUTTONS: ReadonlyArray<{ action: PowerAction; label: string; glyph: string }> = [
  { action: 'suspend', label: 'Suspender', glyph: 'moon-stars' },
  { action: 'restart', label: 'Reiniciar', glyph: 'arrow-clockwise' },
  { action: 'power-off', label: 'Desligar', glyph: 'power-bold' },
  { action: 'logout', label: 'Sair', glyph: 'sign-out' },
  { action: 'lock', label: 'Bloquear', glyph: 'lock-simple' },
];

function powerButton(label: string, glyph: string, color: string, onClick: () => void): St.Button {
  const content = new St.BoxLayout({
    style: `spacing: 6px; color: ${color}; font-size: 12px;`,
    x_align: Clutter.ActorAlign.CENTER,
  });
  content.add_child(
    new St.Icon({ gicon: phosphor(glyph), icon_size: 14, y_align: Clutter.ActorAlign.CENTER }),
  );
  content.add_child(new St.Label({ text: label, y_align: Clutter.ActorAlign.CENTER }));

  const button = new St.Button({
    child: content,
    track_hover: true,
    x_expand: true,
    y_align: Clutter.ActorAlign.CENTER,
  });
  const syncStyle = (): void => {
    const bg = button.hover ? colors.neutral800 : colors.neutral900;
    button.style = `height: 36px; border-radius: 12px; background-color: ${bg};`;
  };
  syncStyle();
  button.connectObject('notify::hover', syncStyle, 'clicked', onClick, button);
  return button;
}

// Linha de energia abaixo da linha de controles (specs/09-sessao-energia.md):
// 48px (40 de linha + 8 de respiro), 5 botões de mesma largura. Ação
// indisponível (ex.: suspender bloqueado por política) → o botão some.
export const PowerRow = GObject.registerClass(
  class PowerRow extends St.BoxLayout {
    constructor(
      session: SystemSession,
      power: PowerToggle,
      onAction: (action: PowerAction) => void,
    ) {
      super({ style: 'height: 40px; padding: 0 10px 8px; spacing: 6px;', x_expand: true });
      (this.layout_manager as Clutter.BoxLayout).homogeneous = true;

      const buttons = POWER_BUTTONS.map(({ action, label, glyph }) => {
        const color = action === 'power-off' ? derivedColors.powerOffText : colors.text;
        const button = powerButton(label, glyph, color, () => onAction(action));
        this.add_child(button);
        return { action, button };
      });
      const syncAvailable = (): void =>
        buttons.forEach(({ action, button }) => (button.visible = session.canRun(action)));
      const syncOpen = (): void => {
        this.visible = power.open;
      };
      syncAvailable();
      syncOpen();

      const unsubscribeSession = session.onChange(syncAvailable);
      const unsubscribePower = power.onChange(syncOpen);
      this.connectObject(
        'destroy',
        () => {
          unsubscribeSession();
          unsubscribePower();
        },
        this,
      );
    }
  },
);
