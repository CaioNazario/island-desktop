import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {
  monthGrid,
  todayEvents,
  todayTitle,
  visibleWeeks,
  WEEKDAY_HEADERS,
  type CalendarDay,
  type CalendarView,
  type TodayEvent,
} from '../core/calendar.js';
import { getSize } from '../core/island.js';
import type { CalendarEventsSource } from '../system/calendarEvents.js';
import { phosphor } from './icons.js';
import { colors, effects } from './tokens.js';

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
    private readonly heightDurationMs: number;
    private readonly weeksGrid: St.Widget;

    /** `heightDurationMs`: a mola de quem contém a grade (cartão ou ilha). */
    constructor(sizes: CalendarGridSizes, heightDurationMs: number) {
      super({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
      this.sizes = sizes;
      this.heightDurationMs = heightDurationMs;

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
        clip_to_allocation: true,
      });
      this.add_child(this.weeksGrid);
    }

    /** Quanto a grade ainda cresce (negativo: encolhe) até o fim da animação. */
    get pendingHeight(): number {
      const grid = this.weeksGrid;
      const [, settled] = grid.layout_manager.get_preferred_height(grid, -1);
      const [, current] = grid.get_preferred_height(-1);
      return settled - current;
    }

    // Semana ↔ Mês (e meses de 5 ↔ 6 semanas) anima a altura das semanas;
    // o que vem abaixo acompanha. Fora da tela, troca direto.
    setWeeks(weeks: readonly CalendarDay[][]): void {
      const grid = this.weeksGrid;
      const from = grid.height;
      grid.remove_all_transitions();
      grid.height = -1;

      grid.destroy_all_children();
      const layout = grid.layout_manager as Clutter.GridLayout;
      weeks.forEach((week, row) =>
        week.forEach((day, column) => layout.attach(this.dayCell(day), column, row, 1, 1)),
      );

      if (!grid.mapped) return;
      const [, to] = grid.get_preferred_height(-1);
      if (to === from) return;
      grid.height = from;
      grid.ease({
        height: to,
        duration: this.heightDurationMs,
        mode: Clutter.AnimationMode.EASE_OUT_BACK,
        onComplete: () => (grid.height = -1),
      });
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

const MODE_PADDING_Y = 14;
const MODE_EVENT_DOT = 8;

function singleLine(label: St.Label): St.Label {
  label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
  label.clutter_text.line_wrap = false;
  return label;
}

// Divisor vertical entre as colunas: `neutral-800` com 20% de fade em cada
// ponta. O St só faz gradiente de duas cores: são três faixas, e as pontas
// seguem a altura do modo.
const ModeColumnDivider = GObject.registerClass(
  class ModeColumnDivider extends St.BoxLayout {
    private readonly fades: St.Widget[];

    constructor() {
      super({ orientation: Clutter.Orientation.VERTICAL, style: 'width: 1px;' });
      const transparent = 'rgba(63,66,77,0)';
      const fade = (from: string, to: string) =>
        new St.Widget({
          style: `background-gradient-direction: vertical; background-gradient-start: ${from}; background-gradient-end: ${to};`,
        });
      this.fades = [fade(transparent, colors.neutral800), fade(colors.neutral800, transparent)];
      this.add_child(this.fades[0]!);
      this.add_child(
        new St.Widget({ style: `background-color: ${colors.neutral800};`, y_expand: true }),
      );
      this.add_child(this.fades[1]!);
    }

    setView(view: CalendarView): void {
      const inner = getSize('calendar', { calendarView: view }).height - 2 * MODE_PADDING_Y;
      this.fades.forEach((fade) => (fade.height = Math.round(inner * 0.2)));
    }
  },
);

function modeEventRow(event: TodayEvent): St.BoxLayout {
  const row = new St.BoxLayout({ style: 'spacing: 8px;' });
  row.add_child(
    new St.Widget({
      style: `width: ${MODE_EVENT_DOT}px; height: ${MODE_EVENT_DOT}px; margin-top: 4px; border-radius: ${MODE_EVENT_DOT / 2}px; background-color: ${colors[event.dot]};`,
      y_align: Clutter.ActorAlign.START,
    }),
  );
  const text = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
  text.add_child(
    singleLine(
      new St.Label({ text: event.name, style: `color: ${colors.text}; font-size: 12px;` }),
    ),
  );
  text.add_child(
    singleLine(
      new St.Label({ text: event.time, style: `color: ${colors.neutral500}; font-size: 10.5px;` }),
    ),
  );
  row.add_child(text);
  return row;
}

export interface CalendarModeViewOptions {
  /** Mês ↔ Semana muda a altura da ilha (150 ↔ 214). */
  onSizeChanged: () => void;
}

// Modo `calendar` da ilha (specs/06-calendario.md): grade à esquerda,
// eventos de hoje à direita, com rolagem quando não cabem.
export const CalendarModeView = GObject.registerClass(
  class CalendarModeView extends St.BoxLayout {
    private readonly events: CalendarEventsSource;
    private readonly options: CalendarModeViewOptions;
    private readonly monthLabel: St.Label;
    private readonly toggle: CalendarViewToggleActor;
    private readonly grid: CalendarGridActor;
    private readonly divider: InstanceType<typeof ModeColumnDivider>;
    private readonly todayLabel: St.Label;
    private readonly scroll: St.ScrollView;
    private readonly eventList: St.BoxLayout;
    private readonly unsubscribe: () => void;
    private _view: CalendarView = 'week';
    private monthOffset = 0;

    constructor(events: CalendarEventsSource, options: CalendarModeViewOptions) {
      super({
        style: `padding: ${MODE_PADDING_Y}px 16px; spacing: 16px;`,
        x_expand: true,
        y_expand: true,
      });
      this.events = events;
      this.options = options;

      const left = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'width: 264px;',
      });
      const header = new St.BoxLayout({ style: 'height: 22px; margin-bottom: 6px;' });
      this.monthLabel = new St.Label({
        style: `color: ${colors.text}; font-size: 13px; font-weight: 500;`,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      header.add_child(this.monthLabel);
      this.toggle = new CalendarViewToggle(22, () => {
        this._view = this._view === 'week' ? 'month' : 'week';
        this.syncGrid();
        this.options.onSizeChanged();
      });
      header.add_child(this.toggle);
      header.add_child(monthNavButton('caret-left', 22, 12, () => this.moveMonth(-1)));
      header.add_child(monthNavButton('caret-right', 22, 12, () => this.moveMonth(1)));
      left.add_child(header);
      this.grid = new CalendarGrid(
        {
          headerFont: 10.5,
          headerMarginBottom: 2,
          cellHeight: 22,
          dayFont: 12,
          pillWidth: 24,
          pillHeight: 20,
        },
        effects.islandSpring.durationMs,
      );
      left.add_child(this.grid);
      this.add_child(left);

      this.divider = new ModeColumnDivider();
      this.add_child(this.divider);

      const right = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'spacing: 12px;',
        x_expand: true,
      });
      this.todayLabel = new St.Label({
        style: `color: ${colors.text}; font-size: 13px; font-weight: 500;`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      right.add_child(
        new St.Bin({
          child: this.todayLabel,
          style: 'height: 22px;',
          x_align: Clutter.ActorAlign.START,
        }),
      );
      this.eventList = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'spacing: 12px;',
        x_expand: true,
      });
      this.scroll = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: true,
        x_expand: true,
        y_expand: true,
        child: this.eventList,
      });
      right.add_child(this.scroll);
      this.add_child(right);

      this.unsubscribe = events.onChange(() => this.syncEvents());
      this.reset();
      this.connectObject('destroy', () => this.unsubscribe(), this);
    }

    get view(): CalendarView {
      return this._view;
    }

    /** Ao abrir o modo: Semana, mês atual, eventos do topo. */
    reset(): void {
      this._view = 'week';
      this.monthOffset = 0;
      this.syncGrid();
      this.syncEvents();
      this.scroll.vadjustment.value = 0;
    }

    private moveMonth(step: number): void {
      this.monthOffset += step;
      this.syncGrid();
    }

    private syncGrid(): void {
      const grid = monthGrid(new Date(), this.monthOffset);
      this.toggle.setView(this._view);
      this.divider.setView(this._view);
      this.monthLabel.text = grid.title;
      this.grid.setWeeks(visibleWeeks(grid, this._view));
    }

    private syncEvents(): void {
      const now = new Date();
      this.todayLabel.text = todayTitle(now);
      this.eventList.destroy_all_children();
      todayEvents(this.events.today, now).forEach((event) =>
        this.eventList.add_child(modeEventRow(event)),
      );
    }
  },
);

export type CalendarModeViewActor = InstanceType<typeof CalendarModeView>;
