import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { IslandState } from '../core/island.js';
import type { PowerAction, SystemSession } from '../system/session.js';
import type { ControlsRowActor, ControlsRowOptions } from './controlsRow.js';
import { phosphor } from './icons.js';
import { colors, derivedColors, effects } from './tokens.js';

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
function powerButtons(
  session: SystemSession,
  onAction: (action: PowerAction) => void,
): St.BoxLayout {
  const row = new St.BoxLayout({
    style: 'height: 40px; padding: 0 10px 8px; spacing: 6px;',
    x_expand: true,
  });
  (row.layout_manager as Clutter.BoxLayout).homogeneous = true;
  const buttons = POWER_BUTTONS.map(({ action, label, glyph }) => {
    const color = action === 'power-off' ? derivedColors.powerOffText : colors.text;
    const button = powerButton(label, glyph, color, () => onAction(action));
    row.add_child(button);
    return { action, button };
  });
  const syncAvailable = (): void =>
    buttons.forEach(({ action, button }) => (button.visible = session.canRun(action)));
  syncAvailable();
  const unsubscribe = session.onChange(syncAvailable);
  row.connectObject('destroy', unsubscribe, row);
  return row;
}

// Abre e fecha no tempo da mola da ilha: a moldura corta a linha, presa no topo,
// e cresce de 0 a 48px. Em `quick` acompanha a borda da ilha; em `wifi` e
// `bt`, onde fica entre os controles e a lista, empurra a lista junto.
export const PowerRow = GObject.registerClass(
  class PowerRow extends St.Widget {
    private readonly row: St.BoxLayout;

    constructor(
      session: SystemSession,
      power: PowerToggle,
      onAction: (action: PowerAction) => void,
    ) {
      super({ clip_to_allocation: true, x_expand: true, visible: power.open });
      this.row = powerButtons(session, onAction);
      this.add_child(this.row);
      const unsubscribe = power.onChange(() => this.setOpen(power.open));
      this.connectObject('destroy', unsubscribe, this);
    }

    private setOpen(open: boolean): void {
      this.remove_all_transitions();
      // Fechada, a moldura está invisível e nunca `mapped`: vale a do pai.
      if (!this.get_parent()?.mapped) {
        this.height = -1;
        this.visible = open;
        return;
      }
      if (open && !this.visible) {
        this.height = 0;
        this.visible = true;
      }
      const [, natural] = this.row.get_preferred_height(-1);
      this.ease({
        height: open ? natural : 0,
        duration: effects.islandSpring.durationMs,
        // Sem repique: fechando, abaixo de 0 a lista subiria para dentro dos
        // tiles; abrindo, a linha e a borda da ilha passam do tamanho.
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        onStopped: (isFinished: boolean) => {
          if (!isFinished) return;
          this.height = -1;
          this.visible = open;
        },
      });
    }

    override vfunc_get_preferred_width(forHeight: number): [number, number] {
      return this.row.get_preferred_width(forHeight);
    }

    override vfunc_get_preferred_height(forWidth: number): [number, number] {
      return this.row.get_preferred_height(forWidth);
    }

    // A linha fica no tamanho final, no topo: o `BinLayout` a espremeria
    // até a altura da moldura (CLAMP em `clutter_actor_allocate_align_fill`,
    // mutter 50.4).
    override vfunc_allocate(box: Clutter.ActorBox): void {
      this.set_allocation(box);
      const [, height] = this.row.get_preferred_height(box.get_width());
      const childBox = new Clutter.ActorBox();
      childBox.set_size(box.get_width(), height);
      this.row.allocate(childBox);
    }
  },
);

// `quick`: linha de controles com a linha de energia abaixo (specs/09-sessao-energia.md).
export function quickContent(
  row: ControlsRowActor,
  session: SystemSession,
  controls: ControlsRowOptions,
): St.BoxLayout {
  const content = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
  content.add_child(row);
  content.add_child(new PowerRow(session, controls.power, controls.onPowerAction));
  return content;
}
