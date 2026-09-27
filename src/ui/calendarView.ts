import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { WEEKDAY_HEADERS, type CalendarDay, type CalendarView } from '../core/calendar.js';
import { phosphor } from './icons.js';
import { colors } from './tokens.js';

// Peças do calendário compartilhadas pela seção do cartão central e pelo modo
// `calendar` (specs/06-calendario.md): as medidas mudam, o comportamento não.

export interface CalendarGridSizes {
  headerFont: number;
  headerMarginBottom: number;
  cellHeight: number;
  dayFont: number;
  pillWidth: number;
  pillHeight: number;
}

function dayColors(kind: CalendarDay['kind']): { fg: string; bg: string; weight: number } {
  switch (kind) {
    case 'today':
      return { fg: colors.neutral100, bg: colors.accent600, weight: 600 };
    case 'in-month':
      return { fg: colors.text, bg: 'transparent', weight: 400 };
    case 'outside':
      return { fg: colors.neutral700, bg: 'transparent', weight: 400 };
  }
}

// Cabeçalho `Seg … Dom` + semanas. `GridLayout` homogêneo: as 7 colunas
// dividem a largura igualmente, como o `repeat(7, 1fr)` do design.
export const CalendarGrid = GObject.registerClass(
  class CalendarGrid extends St.BoxLayout {
    private readonly sizes: CalendarGridSizes;
    private readonly weeksGrid: St.Widget;

    constructor(sizes: CalendarGridSizes) {
      super({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
      this.sizes = sizes;

      const header = new St.Widget({
        layout_manager: new Clutter.GridLayout({ column_homogeneous: true }),
        style: `margin-bottom: ${sizes.headerMarginBottom}px;`,
      });
      const headerLayout = header.layout_manager as Clutter.GridLayout;
      WEEKDAY_HEADERS.forEach((name, column) => {
        const label = new St.Label({
          text: name,
          style: `color: ${colors.neutral500}; font-size: ${sizes.headerFont}px;`,
          x_align: Clutter.ActorAlign.CENTER,
          x_expand: true,
        });
        headerLayout.attach(label, column, 0, 1, 1);
      });
      this.add_child(header);

      this.weeksGrid = new St.Widget({
        layout_manager: new Clutter.GridLayout({ column_homogeneous: true }),
      });
      this.add_child(this.weeksGrid);
    }

    setWeeks(weeks: readonly CalendarDay[][]): void {
      this.weeksGrid.destroy_all_children();
      const layout = this.weeksGrid.layout_manager as Clutter.GridLayout;
      weeks.forEach((week, row) =>
        week.forEach((day, column) => layout.attach(this.dayCell(day), column, row, 1, 1)),
      );
    }

    private dayCell(day: CalendarDay): St.Widget {
      const { sizes } = this;
      const { fg, bg, weight } = dayColors(day.kind);
      const pill = new St.Bin({
        child: new St.Label({
          text: String(day.day),
          x_align: Clutter.ActorAlign.CENTER,
          y_align: Clutter.ActorAlign.CENTER,
        }),
        style: `
          min-width: ${sizes.pillWidth}px;
          height: ${sizes.pillHeight}px;
          border-radius: ${sizes.pillHeight / 2}px;
          background-color: ${bg};
          color: ${fg};
          font-size: ${sizes.dayFont}px;
          font-weight: ${weight};
        `,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });
      return new St.Bin({
        child: pill,
        style: `height: ${sizes.cellHeight}px;`,
        x_expand: true,
      });
    }
  },
);

// `‹` `›`: redondo, transparente, hover `neutral-900`.
export function monthNavButton(
  glyph: 'caret-left' | 'caret-right',
  size: number,
  iconSize: number,
  onClick: () => void,
): St.Button {
  const button = new St.Button({
    child: new St.Icon({ gicon: phosphor(glyph), icon_size: iconSize }),
    track_hover: true,
    y_align: Clutter.ActorAlign.CENTER,
  });
  const refresh = (): void => {
    const bg = button.hover ? colors.neutral900 : 'transparent';
    button.style = `width: ${size}px; height: ${size}px; border-radius: ${size / 2}px; background-color: ${bg}; color: ${colors.neutral300};`;
  };
  button.connectObject('notify::hover', refresh, 'clicked', () => onClick(), button);
  refresh();
  return button;
}

// Botão Mês/Semana: mostra a vista para a qual alterna (em Semana, "Mês" com
// `caret-down`). `neutral-900`, hover `neutral-800`.
export const CalendarViewToggle = GObject.registerClass(
  class CalendarViewToggle extends St.Button {
    // `height`, `label` e `icon` já são propriedades do St.Button.
    private readonly buttonHeight: number;
    private readonly viewLabel: St.Label;
    private readonly caretIcon: St.Icon;

    constructor(height: number, onClick: () => void) {
      const box = new St.BoxLayout({ style: 'spacing: 4px;' });
      super({ child: box, track_hover: true, y_align: Clutter.ActorAlign.CENTER });
      this.buttonHeight = height;
      this.viewLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      this.caretIcon = new St.Icon({ icon_size: 11, y_align: Clutter.ActorAlign.CENTER });
      box.add_child(this.viewLabel);
      box.add_child(this.caretIcon);
      this.connectObject(
        'notify::hover',
        () => this.refresh(),
        'clicked',
        () => onClick(),
        this,
      );
      this.refresh();
    }

    setView(view: CalendarView): void {
      this.viewLabel.text = view === 'week' ? 'Mês' : 'Semana';
      this.caretIcon.gicon = phosphor(view === 'week' ? 'caret-down' : 'caret-up');
    }

    private refresh(): void {
      const bg = this.hover ? colors.neutral800 : colors.neutral900;
      this.style = `
        height: ${this.buttonHeight}px;
        padding: 0 8px;
        border-radius: ${this.buttonHeight / 2}px;
        background-color: ${bg};
        color: ${colors.neutral300};
        font-size: 11px;
      `;
    }
  },
);

export type CalendarGridActor = InstanceType<typeof CalendarGrid>;
export type CalendarViewToggleActor = InstanceType<typeof CalendarViewToggle>;
