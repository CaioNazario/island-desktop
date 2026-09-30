import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { WidgetId } from '../core/environments.js';
import type { Mode } from '../core/island.js';
import { fitWidgets, type WidgetSize } from '../core/widgetFit.js';
import type { AiUsageSource } from '../system/aiUsage.js';
import type { CalendarEventsSource } from '../system/calendarEvents.js';
import type { HardwareSource } from '../system/hardware.js';
import type { MusicSource } from '../system/mpris.js';
import type { PomodoroSource } from '../system/pomodoro.js';
import { AiButton, type AiButtonActor } from './aiButton.js';
import { countdownWidget } from './countdownWidget.js';
import { eventWidget } from './eventWidget.js';
import { HardwareGroup, type HardwareGroupActor } from './hardwareGroup.js';
import { musicWidget } from './musicWidget.js';
import { noteWidget } from './noteWidget.js';
import { pomodoroWidget } from './pomodoroWidget.js';
import { progressWidget } from './progressWidget.js';

export interface WidgetSources {
  aiUsage: AiUsageSource;
  hardware: HardwareSource;
  calendar: CalendarEventsSource;
  music: MusicSource;
  pomodoro: PomodoroSource;
  settings: Gio.Settings;
  openPreferences: (page: string) => void;
}

const GAP = 2;

// Área de widgets de uma pílula lateral (specs/16-widgets.md "Pílulas"): os
// widgets do ambiente ativo, gap 2px, encostados na ilha (`towardIsland` diz
// de que lado ela fica). Id ainda sem widget não mostra nada.
//
// Largura mínima 0: a área nunca empurra a ilha nem os botões fixos. O que
// cabe é medido com a ilha no maior modo (`slack`), para os widgets não
// piscarem quando ela abre e fecha. Widget que não cabe é alocado depois da
// borda e some pelo clip, sem mexer em `visible` dentro do allocate.
export const WidgetArea = GObject.registerClass(
  class WidgetArea extends St.Widget {
    private readonly sources: WidgetSources;
    private readonly towardIsland: 'start' | 'end';
    private readonly onTrigger: (mode: Mode) => void;
    private ids: readonly WidgetId[] = [];
    private aiButton: AiButtonActor | null = null;
    private hardware: HardwareGroupActor | null = null;
    private slackPx = 0;
    private aiActive = false;

    constructor(
      sources: WidgetSources,
      towardIsland: 'start' | 'end',
      onTrigger: (mode: Mode) => void,
    ) {
      super({
        clip_to_allocation: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.FILL,
      });
      this.sources = sources;
      this.towardIsland = towardIsland;
      this.onTrigger = onTrigger;
    }

    /** Quanto a pílula está mais larga do que ficaria com a ilha no maior modo. */
    set slack(slack: number) {
      this.slackPx = slack;
    }

    /** Fundo do botão de IA com o modo `ai` aberto (specs/12-uso-ia.md). */
    set active(aiActive: boolean) {
      this.aiActive = aiActive;
      if (this.aiButton) this.aiButton.active = aiActive;
    }

    /** Monta os widgets de `ids`; com a mesma lista, mantém os atores. */
    setWidgets(ids: readonly WidgetId[]): void {
      if (ids.length === this.ids.length && ids.every((id, i) => id === this.ids[i])) return;
      this.ids = [...ids];
      this.destroy_all_children();
      this.aiButton = null;
      this.hardware = null;

      for (const id of ids) {
        const widget = this.build(id);
        if (widget) this.add_child(widget);
      }
    }

    override vfunc_get_preferred_width(_forHeight: number): [number, number] {
      const widths = this.shownChildren().map((child) => child.get_preferred_width(-1)[1]);
      const natural = widths.reduce((sum, width) => sum + width, 0);
      return [0, natural + GAP * Math.max(0, widths.length - 1)];
    }

    override vfunc_get_preferred_height(_forWidth: number): [number, number] {
      const heights = this.shownChildren().map((child) => child.get_preferred_height(-1)[1]);
      const height = Math.max(0, ...heights);
      return [height, height];
    }

    override vfunc_allocate(box: Clutter.ActorBox): void {
      this.set_allocation(box);
      const width = box.get_width();
      const height = box.get_height();
      const children = this.shownChildren();
      const fitted = fitWidgets(
        children.map((child) => this.sizeOf(child)),
        width - this.slackPx,
        GAP,
        this.towardIsland === 'end' ? 'start' : 'end',
      ).map((w, i) =>
        w !== null && children[i] === this.hardware ? this.hardware.fittedWidth(w) : w,
      );

      const row = fitted.flatMap((w) => (w === null ? [] : [w]));
      const rowWidth = row.reduce((sum, w) => sum + w, 0) + GAP * Math.max(0, row.length - 1);
      let x = this.towardIsland === 'start' ? 0 : width - rowWidth;
      const childBox = new Clutter.ActorBox();
      children.forEach((child, i) => {
        const w = fitted[i] ?? null;
        const [, h] = child.get_preferred_height(w ?? -1);
        childBox.x1 = w === null ? width : x;
        childBox.x2 = childBox.x1 + (w ?? child.get_preferred_width(-1)[1]);
        childBox.y1 = Math.round((height - h) / 2);
        childBox.y2 = childBox.y1 + h;
        child.allocate(childBox);
        if (w !== null) x += w + GAP;
      });
    }

    private shownChildren(): Clutter.Actor[] {
      return this.get_children().filter((child) => child.visible);
    }

    // Só o `hw` encolhe; os outros entram inteiros ou somem.
    private sizeOf(child: Clutter.Actor): WidgetSize {
      const [min, natural] = child.get_preferred_width(-1);
      return { natural, min: child === this.hardware ? min : natural };
    }

    private build(id: WidgetId): Clutter.Actor | null {
      switch (id) {
        case 'ai':
          this.aiButton = new AiButton(this.sources.aiUsage, () => this.onTrigger('ai'));
          this.aiButton.active = this.aiActive;
          return this.aiButton;
        case 'hw':
          this.hardware = new HardwareGroup(this.sources.hardware);
          return this.hardware;
        case 'event':
          return eventWidget(this.sources.calendar, () => this.onTrigger('calendar'));
        case 'pomodoro':
          return pomodoroWidget(this.sources.pomodoro);
        case 'music':
          return musicWidget(this.sources.music, () => this.onTrigger('music'));
        case 'progress':
          return progressWidget();
        case 'countdown':
          return countdownWidget(this.sources.settings, () =>
            this.sources.openPreferences('widgets'),
          );
        case 'note':
          return noteWidget(this.sources.settings, () => this.onTrigger('note'));
        default:
          return null;
      }
    }
  },
);

export type WidgetAreaActor = InstanceType<typeof WidgetArea>;
