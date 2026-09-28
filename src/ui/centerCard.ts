import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {
  monthGrid,
  todayEvents,
  visibleWeeks,
  type CalendarView,
  type TodayEvent,
} from '../core/calendar.js';
import type { Size } from '../core/island.js';
import { artistLine, formatTrackTime, progressFraction, sourceGlyph } from '../core/music.js';
import type { CalendarEventsSource } from '../system/calendarEvents.js';
import type { MusicSource } from '../system/mpris.js';
import {
  CalendarGrid,
  CalendarViewToggle,
  monthNavButton,
  type CalendarGridActor,
  type CalendarViewToggleActor,
} from './calendarView.js';
import { phosphor } from './icons.js';
import { MusicControls, MusicCover, MusicProgressBar } from './musicView.js';
import { colors, effects } from './tokens.js';

const CENTER_CARD_WIDTH = 420;
const CENTER_CARD_RADIUS = 22;
const CARD_PADDING = 18;

function singleLine(label: St.Label): St.Label {
  label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
  label.clutter_text.line_wrap = false;
  return label;
}

type MusicCoverActor = InstanceType<typeof MusicCover>;
type MusicProgressBarActor = InstanceType<typeof MusicProgressBar>;
type MusicControlsActor = InstanceType<typeof MusicControls>;

// Seção de música do cartão (specs/05-musica.md): as peças do modo `music`
// em medidas maiores. Some quando nenhum player é atual.
const CardMusicSection = GObject.registerClass(
  class CardMusicSection extends St.BoxLayout {
    private readonly music: MusicSource;
    private readonly cover: MusicCoverActor;
    private readonly artistLabel: St.Label;
    private readonly titleLabel: St.Label;
    private readonly sourceIcon: St.Icon;
    private readonly bar: MusicProgressBarActor;
    private readonly timeLabel: St.Label;
    private readonly controls: MusicControlsActor;
    private readonly unsubscribe: Array<() => void>;

    constructor(music: MusicSource) {
      super({
        orientation: Clutter.Orientation.VERTICAL,
        style: `padding: 0 ${CARD_PADDING}px;`,
      });
      this.music = music;

      const head = new St.BoxLayout({ style: 'spacing: 14px;' });
      this.cover = new MusicCover(56, 12);
      head.add_child(this.cover);
      const text = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.artistLabel = singleLine(
        new St.Label({ style: `color: ${colors.text}; font-size: 14px; font-weight: 500;` }),
      );
      this.titleLabel = singleLine(
        new St.Label({ style: `color: ${colors.neutral400}; font-size: 12.5px;` }),
      );
      text.add_child(this.artistLabel);
      text.add_child(this.titleLabel);
      head.add_child(text);
      this.sourceIcon = new St.Icon({
        icon_size: 22,
        style: `color: ${colors.accent400};`,
        y_align: Clutter.ActorAlign.START,
      });
      head.add_child(this.sourceIcon);
      this.add_child(head);

      const progress = new St.BoxLayout({
        style: `spacing: 10px; margin-top: 12px; color: ${colors.neutral500}; font-size: 10.5px; font-feature-settings: "tnum";`,
      });
      this.bar = new MusicProgressBar();
      this.timeLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      progress.add_child(this.bar);
      progress.add_child(this.timeLabel);
      this.add_child(progress);

      // O cartão não tem timer para rearmar.
      this.controls = new MusicControls(
        music,
        { side: 36, sideIcon: 17, main: 40, mainIcon: 24, spacing: 18 },
        () => {},
      );
      this.controls.style = `${this.controls.style ?? ''} margin-top: 6px;`;
      this.controls.x_align = Clutter.ActorAlign.CENTER;
      this.add_child(this.controls);

      this.unsubscribe = [
        music.onChange(() => this.sync()),
        music.onPosition(() => this.syncPosition()),
      ];
      this.sync();
      this.connectObject('destroy', () => this.unsubscribe.forEach((off) => off()), this);
    }

    private sync(): void {
      const track = this.music.track;
      this.visible = track !== null;
      if (!track) return;
      this.cover.setArt(track.artUrl);
      this.artistLabel.text = artistLine(track.artists, track.identity);
      this.titleLabel.text = track.title;
      this.sourceIcon.gicon = phosphor(sourceGlyph(track.identity));
      this.controls.setTrack(track);
      this.syncPosition();
    }

    private syncPosition(): void {
      const track = this.music.track;
      if (!track) return;
      const position = this.music.positionUs;
      this.timeLabel.text = `${formatTrackTime(position)} / ${formatTrackTime(track.lengthUs)}`;
      this.bar.setFraction(progressFraction(position, track.lengthUs));
    }
  },
);

// Divisor entre as seções: 1px, transparente → `neutral-800` (15%–85%) →
// transparente, de borda a borda do cartão. O St só faz gradiente de duas
// cores: são três faixas.
function sectionDivider(): St.BoxLayout {
  const fadeWidth = Math.round(CENTER_CARD_WIDTH * 0.15);
  const transparent = 'rgba(63,66,77,0)';
  const fade = (from: string, to: string) =>
    new St.Widget({
      style: `width: ${fadeWidth}px; background-gradient-direction: horizontal; background-gradient-start: ${from}; background-gradient-end: ${to};`,
    });
  const divider = new St.BoxLayout({ style: 'height: 1px; margin: 14px 0;' });
  divider.add_child(fade(transparent, colors.neutral800));
  divider.add_child(
    new St.Widget({ style: `background-color: ${colors.neutral800};`, x_expand: true }),
  );
  divider.add_child(fade(colors.neutral800, transparent));
  return divider;
}

const EVENT_DOT_SIZE = 8;

function eventRow(event: TodayEvent): St.BoxLayout {
  const row = new St.BoxLayout({ style: 'spacing: 10px; font-size: 12.5px;' });
  row.add_child(
    new St.Widget({
      style: `width: ${EVENT_DOT_SIZE}px; height: ${EVENT_DOT_SIZE}px; border-radius: ${EVENT_DOT_SIZE / 2}px; background-color: ${colors[event.dot]};`,
      y_align: Clutter.ActorAlign.CENTER,
    }),
  );
  row.add_child(
    singleLine(
      new St.Label({
        text: event.name,
        style: `color: ${colors.text};`,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      }),
    ),
  );
  row.add_child(
    new St.Label({
      text: event.time,
      style: `color: ${colors.neutral500}; font-size: 11px;`,
      y_align: Clutter.ActorAlign.CENTER,
    }),
  );
  return row;
}

// Seção de calendário do cartão (specs/06-calendario.md "Seção no cartão
// central"): abre sempre em Semana, no mês atual.
const CardCalendarSection = GObject.registerClass(
  class CardCalendarSection extends St.BoxLayout {
    private readonly events: CalendarEventsSource;
    private readonly onSizeChanged: () => void;
    private readonly toggle: CalendarViewToggleActor;
    private readonly monthLabel: St.Label;
    private readonly grid: CalendarGridActor;
    private readonly eventList: St.BoxLayout;
    private readonly unsubscribe: () => void;
    private view: CalendarView = 'week';
    private monthOffset = 0;

    constructor(events: CalendarEventsSource, onSizeChanged: () => void) {
      super({
        orientation: Clutter.Orientation.VERTICAL,
        style: `padding: 0 ${CARD_PADDING}px;`,
      });
      this.events = events;
      this.onSizeChanged = onSizeChanged;

      const header = new St.BoxLayout({ style: 'spacing: 8px; margin-bottom: 10px;' });
      header.add_child(
        new St.Icon({
          gicon: phosphor('calendar-blank'),
          icon_size: 16,
          style: `color: ${colors.neutral300};`,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      header.add_child(
        new St.Label({
          text: 'Calendário',
          style: `color: ${colors.text}; font-size: 14px; font-weight: 500;`,
          x_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      this.toggle = new CalendarViewToggle(24, () => {
        this.view = this.view === 'week' ? 'month' : 'week';
        this.sync();
        this.onSizeChanged();
      });
      header.add_child(this.toggle);
      this.add_child(header);

      const monthRow = new St.BoxLayout({ style: 'margin-bottom: 8px;' });
      this.monthLabel = new St.Label({
        style: `color: ${colors.text}; font-size: 13px;`,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      monthRow.add_child(this.monthLabel);
      monthRow.add_child(monthNavButton('caret-left', 26, 13, () => this.moveMonth(-1)));
      monthRow.add_child(monthNavButton('caret-right', 26, 13, () => this.moveMonth(1)));
      this.add_child(monthRow);

      this.grid = new CalendarGrid(
        {
          headerFont: 11,
          headerMarginBottom: 4,
          cellHeight: 26,
          dayFont: 12.5,
          pillWidth: 26,
          pillHeight: 22,
        },
        effects.islandSpring.durationMs,
      );
      this.add_child(this.grid);

      this.eventList = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'spacing: 9px; margin-top: 12px;',
      });
      this.add_child(this.eventList);

      this.unsubscribe = events.onChange(() => {
        this.sync();
        this.onSizeChanged();
      });
      this.sync();
      this.connectObject('destroy', () => this.unsubscribe(), this);
    }

    get pendingHeight(): number {
      return this.grid.pendingHeight;
    }

    /** Reabrir o cartão volta a Semana, no mês atual. */
    reset(): void {
      this.view = 'week';
      this.monthOffset = 0;
      this.sync();
    }

    private moveMonth(step: number): void {
      this.monthOffset += step;
      this.sync();
      this.onSizeChanged();
    }

    private sync(): void {
      const now = new Date();
      const grid = monthGrid(now, this.monthOffset);
      this.toggle.setView(this.view);
      this.monthLabel.text = grid.title;
      this.grid.setWeeks(visibleWeeks(grid, this.view));

      this.eventList.destroy_all_children();
      const events = todayEvents(this.events.today, now);
      events.forEach((event) => this.eventList.add_child(eventRow(event)));
      this.eventList.visible = events.length > 0;
    }
  },
);

type CardMusicSectionActor = InstanceType<typeof CardMusicSection>;
type CardCalendarSectionActor = InstanceType<typeof CardCalendarSection>;

export interface CenterCardOptions {
  /** A música apareceu ou sumiu, ou o calendário mudou de altura. */
  onSizeChanged: () => void;
}

// Cartão central (specs/05-musica.md "Cartão central"): a ilha se expande
// nele como num modo. Música · divisor · calendário, como no design; nada
// tocando, a seção de música e o divisor somem.
export const CenterCard = GObject.registerClass(
  class CenterCard extends St.BoxLayout {
    private readonly calendar: CardCalendarSectionActor;

    constructor(music: MusicSource, events: CalendarEventsSource, options: CenterCardOptions) {
      super({
        orientation: Clutter.Orientation.VERTICAL,
        style: `padding: ${CARD_PADDING}px 0;`,
        y_align: Clutter.ActorAlign.START,
      });
      const musicSection: CardMusicSectionActor = new CardMusicSection(music);
      const divider = sectionDivider();
      musicSection.bind_property('visible', divider, 'visible', GObject.BindingFlags.SYNC_CREATE);
      musicSection.connectObject('notify::visible', () => options.onSizeChanged(), this);
      this.calendar = new CardCalendarSection(events, options.onSizeChanged);
      this.add_child(musicSection);
      this.add_child(divider);
      this.add_child(this.calendar);
    }

    /** Reabrir o cartão volta a Semana, no mês atual. */
    reset(): void {
      this.calendar.reset();
    }

    /**
     * Tamanho da ilha com o cartão, anel incluso. A altura conta a grade do
     * calendário onde a animação Semana ↔ Mês vai parar.
     */
    islandSize(ring: number): Size {
      const [, content] = this.get_preferred_height(CENTER_CARD_WIDTH - 2 * ring);
      const height = content + this.calendar.pendingHeight + 2 * ring;
      return { width: CENTER_CARD_WIDTH, height, radius: CENTER_CARD_RADIUS };
    }
  },
);

export type CenterCardActor = InstanceType<typeof CenterCard>;
