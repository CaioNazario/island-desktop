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
import { getSize } from '../core/island.js';
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

export const CENTER_CARD_WIDTH = 420;
/** `top: 38px` no design: distância do topo da barra. */
export const CENTER_CARD_TOP = 38;
const CARD_RADIUS = 22;
const CARD_PADDING = 18;
const CARD_RING = 1;
const CONTENT_WIDTH = CENTER_CARD_WIDTH - 2 * CARD_RING;

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
    private readonly toggle: CalendarViewToggleActor;
    private readonly monthLabel: St.Label;
    private readonly grid: CalendarGridActor;
    private readonly eventList: St.BoxLayout;
    private readonly unsubscribe: () => void;
    private view: CalendarView = 'week';
    private monthOffset = 0;

    constructor(events: CalendarEventsSource) {
      super({
        orientation: Clutter.Orientation.VERTICAL,
        style: `padding: 0 ${CARD_PADDING}px;`,
      });
      this.events = events;

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
        effects.cardSpring.durationMs,
      );
      this.add_child(this.grid);

      this.eventList = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'spacing: 9px; margin-top: 12px;',
      });
      this.add_child(this.eventList);

      this.unsubscribe = events.onChange(() => this.sync());
      this.sync();
      this.connectObject('destroy', () => this.unsubscribe(), this);
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
  onEscape: () => void;
  /** Clique fora do cartão com ele segurando o grab: fecha tudo. */
  onPressOutside: () => void;
  /** Clique em outro ator da barra que trata o próprio clique sob o grab (banner). */
  claimPressUnderGrab: (target: Clutter.Actor) => boolean;
}

// Casca do cartão: pinta fundo, anel e raio e corta o conteúdo. Enquanto a
// casca cresce a partir da ilha, o conteúdo fica no tamanho final,
// centralizado no topo: o `BinLayout` espremeria um filho maior que o pai
// (CLAMP em `clutter_actor_allocate_align_fill`, mutter 50.4).
const CardShell = GObject.registerClass(
  {
    Properties: {
      // Animável com `ease_property`, como o raio da ilha.
      radius: GObject.ParamSpec.double(
        'radius',
        null,
        null,
        GObject.ParamFlags.READWRITE,
        0,
        Number.MAX_SAFE_INTEGER,
        0,
      ),
    },
  },
  class CardShell extends St.Widget {
    private readonly body: Clutter.Actor;
    private radiusPx = -1;

    constructor(body: Clutter.Actor) {
      super({
        clip_to_allocation: true,
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.START,
      });
      this.body = body;
      this.add_child(body);
      this.radius = CARD_RADIUS;
    }

    get radius(): number {
      return this.radiusPx;
    }

    set radius(radius: number) {
      if (this.radiusPx === radius) return;
      this.radiusPx = radius;
      this.style = `
        border-radius: ${radius}px;
        background-color: ${colors.bg};
        border: ${CARD_RING}px solid ${colors.neutral800};
      `;
      this.notify('radius');
    }

    override vfunc_get_preferred_width(_forHeight: number): [number, number] {
      return [CENTER_CARD_WIDTH, CENTER_CARD_WIDTH];
    }

    override vfunc_get_preferred_height(_forWidth: number): [number, number] {
      const [min, natural] = this.body.get_preferred_height(CONTENT_WIDTH);
      return [min + 2 * CARD_RING, natural + 2 * CARD_RING];
    }

    override vfunc_allocate(box: Clutter.ActorBox): void {
      this.set_allocation(box);
      const [, height] = this.body.get_preferred_height(CONTENT_WIDTH);
      const childBox = new Clutter.ActorBox();
      childBox.set_origin((box.get_width() - CONTENT_WIDTH) / 2, CARD_RING);
      childBox.set_size(CONTENT_WIDTH, height);
      this.body.allocate(childBox);
    }
  },
);

type CardShellActor = InstanceType<typeof CardShell>;

// Cartão central (specs/05-musica.md "Cartão central"): abre abaixo da ilha
// compacta, que não muda de tamanho. Sai de trás dela: a casca começa com o
// tamanho e a posição da ilha compacta e cresce até o tamanho do cartão.
export const CenterCard = GObject.registerClass(
  class CenterCard extends St.Widget {
    private readonly options: CenterCardOptions;
    private readonly calendar: CardCalendarSectionActor;
    private readonly shell: CardShellActor;
    private readonly body: St.BoxLayout;
    private isOpen = false;

    constructor(music: MusicSource, events: CalendarEventsSource, options: CenterCardOptions) {
      super({
        layout_manager: new Clutter.BinLayout(),
        reactive: true,
        can_focus: true,
        width: CENTER_CARD_WIDTH,
        visible: false,
      });
      this.options = options;

      this.body = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style: `padding: ${CARD_PADDING}px 0;`,
      });
      // Música · divisor · calendário, como no design. Nada tocando: seção
      // de música e divisor somem (specs/05-musica.md).
      const musicSection: CardMusicSectionActor = new CardMusicSection(music);
      const divider = sectionDivider();
      musicSection.bind_property('visible', divider, 'visible', GObject.BindingFlags.SYNC_CREATE);
      this.calendar = new CardCalendarSection(events);
      this.body.add_child(musicSection);
      this.body.add_child(divider);
      this.body.add_child(this.calendar);

      this.shell = new CardShell(this.body);
      this.add_child(this.shell);

      this.connectObject(
        'captured-event',
        (_actor: St.Widget, event: Clutter.Event) => this.onCapturedEvent(event),
        'key-press-event',
        (_actor: St.Widget, event: Clutter.Event) => {
          if (event.get_key_symbol() !== Clutter.KEY_Escape) return Clutter.EVENT_PROPAGATE;
          this.options.onEscape();
          return Clutter.EVENT_STOP;
        },
        this,
      );
    }

    // Com o grab modal, o clique fora do cartão é entregue a ele: fecha
    // tudo, inclusive o clique na ilha ("clicar de novo na ilha fecha").
    // STOP para não chegar à janela embaixo (specs/02-barra.md).
    private onCapturedEvent(event: Clutter.Event): boolean {
      const type = event.type();
      if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.TOUCH_BEGIN)
        return Clutter.EVENT_PROPAGATE;
      const target = global.stage.get_event_actor(event);
      if (target && this.contains(target)) return Clutter.EVENT_PROPAGATE;
      if (target && this.options.claimPressUnderGrab(target)) return Clutter.EVENT_STOP;
      this.options.onPressOutside();
      return Clutter.EVENT_STOP;
    }

    setOpen(open: boolean): void {
      if (open === this.isOpen) return;
      this.isOpen = open;
      const { shell, body } = this;
      shell.remove_all_transitions();
      body.remove_all_transitions();
      if (open) this.calendar.reset();

      const island = getSize('compact');
      if (open && !this.visible) {
        shell.set_size(island.width, island.height);
        shell.radius = island.radius;
        shell.translationY = -CENTER_CARD_TOP;
        body.opacity = 0;
        this.visible = true;
      } else {
        // Interrompido no meio: parte do tamanho atual.
        shell.set_size(shell.width, shell.height);
      }

      const [, bodyHeight] = body.get_preferred_height(CONTENT_WIDTH);
      const spring = {
        duration: effects.cardSpring.durationMs,
        mode: Clutter.AnimationMode.EASE_OUT_BACK,
      };
      shell.ease({
        ...(open
          ? { width: CENTER_CARD_WIDTH, height: bodyHeight + 2 * CARD_RING, translationY: 0 }
          : { width: island.width, height: island.height, translationY: -CENTER_CARD_TOP }),
        ...spring,
        onStopped: (isFinished: boolean) => {
          if (!isFinished) return;
          if (open) {
            // Volta ao tamanho natural: Mês/Semana e a música mudam a altura.
            shell.set_size(-1, -1);
          } else {
            this.visible = false;
          }
        },
      });
      shell.ease_property('radius', open ? CARD_RADIUS : island.radius, spring);
      body.ease({
        opacity: open ? 255 : 0,
        delay: effects.contentCrossfade.delayMs,
        duration: effects.contentCrossfade.durationMs,
        mode: Clutter.AnimationMode.EASE,
      });
    }
  },
);

export type CenterCardActor = InstanceType<typeof CenterCard>;
