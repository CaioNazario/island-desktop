import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { IslandState } from '../core/island.js';
import type { PowerAction, SystemSession } from '../system/session.js';
import type { ControlsRowActor, ControlsRowOptions } from './controlsRow.js';
import { phosphor } from './icons.js';
import { easeSpring } from './spring.js';
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

// Ocupa o espaço na hora (specs/09-sessao-energia.md) e a ilha cresce na mola.
// Em `wifi`/`bt`, a lista abaixo desliza os 48px na mesma mola, e a linha só
// aparece acima do topo da lista: a lista é transparente e passaria por cima
// dos botões. Em `quick` não há nada abaixo e a ilha corta a linha.
export const PowerRow = GObject.registerClass(
  class PowerRow extends St.Widget {
    private readonly row: St.BoxLayout;
    private open: boolean;
    private trackingList = false;

    constructor(
      session: SystemSession,
      power: PowerToggle,
      onAction: (action: PowerAction) => void,
    ) {
      super({ x_expand: true });
      this.row = powerButtons(session, onAction);
      this.add_child(this.row);
      this.open = power.open;
      this.syncClip();
      const unsubscribe = power.onChange(() => this.setOpen(power.open));
      this.connectObject('destroy', unsubscribe, this);
    }

    private get rowHeight(): number {
      return this.row.get_preferred_height(-1)[1];
    }

    private below(): Clutter.Actor[] {
      const actors: Clutter.Actor[] = [];
      for (let next = this.get_next_sibling(); next; next = next.get_next_sibling())
        actors.push(next);
      return actors;
    }

    private setOpen(open: boolean): void {
      if (open === this.open) return;
      this.open = open;
      this.queue_relayout();
      const below = this.below();
      if (!this.trackingList && below[0]) {
        below[0].connectObject('notify::translation-y', () => this.syncClip(), this);
        this.trackingList = true;
      }
      // O layout pula a lista na hora; a translação desfaz o pulo e volta a 0.
      // Fora da tela não há o que animar nem medir.
      const jump = this.mapped ? (open ? this.rowHeight : -this.rowHeight) : 0;
      for (const actor of below) {
        actor.remove_transition('translation-y');
        actor.translationY = this.mapped ? actor.translationY - jump : 0;
        if (this.mapped) easeSpring(actor, { translationY: 0 });
      }
      this.syncClip();
    }

    // Parte visível = do topo da linha até o topo da lista.
    private syncClip(): void {
      // Fora da tela o St mede sem CSS (e avisa no log): fica o estado final.
      if (!this.mapped) {
        this.row.visible = this.open;
        this.row.remove_clip();
        return;
      }
      const height = this.rowHeight;
      const listTop = this.get_next_sibling()?.translationY ?? 0;
      const visible = Math.min(height, Math.max(0, (this.open ? height : 0) + listTop));
      this.row.visible = visible > 0;
      if (visible >= height) this.row.remove_clip();
      else this.row.set_clip(0, 0, this.width, visible);
    }

    override vfunc_get_preferred_width(forHeight: number): [number, number] {
      return this.row.get_preferred_width(forHeight);
    }

    override vfunc_get_preferred_height(forWidth: number): [number, number] {
      if (!this.open) return [0, 0];
      return this.row.get_preferred_height(forWidth);
    }

    // Fechando, a linha segue no tamanho dela, pra fora da moldura de 0px,
    // enquanto a lista sobe por cima.
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
