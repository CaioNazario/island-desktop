import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { colors, layout, typography } from './tokens.js';

const DELAY_MS = 500;
// Distância da borda de baixo da pílula.
const GAP = 6;

// Tooltip Nocturne (o `title` do design; specs/12-uso-ia.md): fundo `bg`,
// anel `neutral-800`, 11px, no lugar do tooltip do sistema. Aparece 500ms
// depois do hover, centrado no ator, abaixo da pílula e sem sair do monitor. Fica no uiGroup para não
// ser cortado nem mexer no layout de quem o usa. O ator precisa de
// `reactive` e `track_hover`.
export class Tooltip {
  private readonly label = new St.Label({
    style: `
      background-color: ${colors.bg};
      border: 1px solid ${colors.neutral800};
      border-radius: 8px;
      padding: 4px 8px;
      font-size: ${typography.sizes.base}px;
      color: ${colors.text};
    `,
    visible: false,
  });
  private readonly actor: St.Widget;
  private timerId: number | null = null;

  constructor(actor: St.Widget) {
    this.actor = actor;
    Main.uiGroup.add_child(this.label);
    actor.connectObject(
      'notify::hover',
      () => (actor.hover ? this.arm() : this.hide()),
      'notify::mapped',
      () => {
        if (!actor.mapped) this.hide();
      },
      'destroy',
      () => this.destroy(),
      this.label,
    );
  }

  /** Com o tooltip aberto, troca o texto no lugar. */
  set text(text: string) {
    if (this.label.text === text) return;
    this.label.text = text;
    if (this.label.visible) this.place();
  }

  private arm(): void {
    this.clearTimer();
    this.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DELAY_MS, () => {
      this.timerId = null;
      if (this.label.text) {
        this.label.show();
        this.place();
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  private hide(): void {
    this.clearTimer();
    this.label.hide();
  }

  private place(): void {
    const [actorX, actorY] = this.actor.get_transformed_position();
    const [actorWidth, actorHeight] = this.actor.get_transformed_size();
    const [, width] = this.label.get_preferred_width(-1);
    const monitor = Main.layoutManager.findMonitorForActor(this.actor);
    let x = actorX + (actorWidth - width) / 2;
    let y = actorY + actorHeight + GAP;
    if (monitor) {
      y = monitor.y + layout.barHeight + GAP;
      const min = monitor.x + layout.sideMargin;
      const max = monitor.x + monitor.width - layout.sideMargin - width;
      x = Math.max(min, Math.min(max, x));
    }
    this.label.set_position(Math.round(x), Math.round(y));
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      GLib.Source.remove(this.timerId);
      this.timerId = null;
    }
  }

  private destroy(): void {
    this.clearTimer();
    this.label.destroy();
  }
}
