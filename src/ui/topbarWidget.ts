import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { phosphor } from './icons.js';
import { colors } from './tokens.js';

const HOVER_MS = 150;
const DEFAULT_LABEL_MAX = 140;
const BAR = { width: 34, height: 4, radius: 2 };

/** O que o widget mostra; parte ausente fica escondida. */
export interface WidgetContent {
  icon?: string;
  iconColor?: string;
  label?: string;
  labelColor?: string;
  /** 0–100: mostra a barra. */
  percent?: number;
  sub?: string;
  trail?: string;
}

// Visual comum dos widgets (specs/16-widgets.md "Visual comum"; design/
// components/TopbarWidget.html): linha de 24px, padding 0 9px, gap 6px,
// 12px/500, dígitos tabulares. Moldura raio 12, hover `neutral-900` em
// 150ms; cursor de mão só com ação de clique.
export const TopbarWidget = GObject.registerClass(
  class TopbarWidget extends St.Button {
    private readonly iconView: St.Icon;
    private readonly labelView: St.Label;
    private readonly labelStyle: string;
    private readonly bar: St.Widget;
    private readonly barFill: St.Widget;
    private readonly sub: St.Label;
    private readonly trail: St.Icon;
    private isClickable = false;

    constructor(onClick: (() => void) | null, labelMax = DEFAULT_LABEL_MAX) {
      const content = new St.BoxLayout({
        style: `spacing: 6px; padding: 0 9px; font-size: 12px; font-weight: 500; color: ${colors.text}; font-feature-settings: "tnum";`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      super({
        child: content,
        track_hover: true,
        reactive: true,
        can_focus: false,
        y_align: Clutter.ActorAlign.CENTER,
      });

      this.iconView = new St.Icon({ icon_size: 14, y_align: Clutter.ActorAlign.CENTER });
      content.add_child(this.iconView);

      this.labelStyle = `max-width: ${labelMax}px;`;
      this.labelView = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      this.labelView.clutter_text.ellipsize = Pango.EllipsizeMode.END;
      this.labelView.clutter_text.line_wrap = false;
      content.add_child(this.labelView);

      this.bar = new St.Widget({
        style: `background-color: ${colors.neutral800}; border-radius: ${BAR.radius}px;`,
        width: BAR.width,
        height: BAR.height,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.barFill = new St.Widget({
        style: `background-color: ${colors.accent}; border-radius: ${BAR.radius}px;`,
        width: 0,
        height: BAR.height,
      });
      this.bar.add_child(this.barFill);
      content.add_child(this.bar);

      this.sub = new St.Label({
        style: `font-weight: 400; color: ${colors.neutral400};`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.sub.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
      content.add_child(this.sub);

      this.trail = new St.Icon({
        icon_size: 13,
        style: `color: ${colors.neutral300};`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      content.add_child(this.trail);

      this.connectObject('notify::hover', () => this.refresh(), this);
      if (onClick) {
        this.connectObject(
          'clicked',
          () => {
            if (this.isClickable) onClick();
          },
          this,
        );
      }
      this.clickable = onClick !== null;
      this.refresh();
      this.display({});
    }

    /** Widget com clique só em alguns estados (contagem sem data). */
    set clickable(clickable: boolean) {
      this.isClickable = clickable;
      this.set_cursor_type(clickable ? Clutter.CursorType.POINTER : Clutter.CursorType.DEFAULT);
    }

    display(content: WidgetContent): void {
      this.iconView.visible = content.icon !== undefined;
      if (content.icon !== undefined) {
        this.iconView.gicon = phosphor(content.icon);
        this.iconView.style = `color: ${content.iconColor ?? colors.neutral300};`;
      }

      this.labelView.visible = content.label !== undefined;
      this.labelView.text = content.label ?? '';
      this.labelView.style = `${this.labelStyle} color: ${content.labelColor ?? colors.text};`;

      this.bar.visible = content.percent !== undefined;
      const percent = Math.max(0, Math.min(100, content.percent ?? 0));
      this.barFill.width = Math.round((BAR.width * percent) / 100);

      this.sub.visible = content.sub !== undefined;
      this.sub.text = content.sub ?? '';

      this.trail.visible = content.trail !== undefined;
      if (content.trail !== undefined) this.trail.gicon = phosphor(content.trail);
    }

    private refresh(): void {
      const bg = this.hover ? colors.neutral900 : 'transparent';
      this.style = `height: 24px; border-radius: 12px; background-color: ${bg}; transition-duration: ${HOVER_MS}ms;`;
    }
  },
);

export type TopbarWidgetActor = InstanceType<typeof TopbarWidget>;
