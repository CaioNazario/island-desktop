import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

import type { Side, WidgetId } from '../core/environments.js';
import type { Mode } from '../core/island.js';
import { fitWidgets, type WidgetSize } from '../core/widgetFit.js';
import type { AiUsageSource } from '../system/aiUsage.js';
import type { CalendarEventsSource } from '../system/calendarEvents.js';
import type { GithubSource } from '../system/github.js';
import type { HardwareSource } from '../system/hardware.js';
import type { MusicSource } from '../system/mpris.js';
import type { PomodoroSource } from '../system/pomodoro.js';
import { AiButton, type AiButtonActor } from './aiButton.js';
import { countdownWidget } from './countdownWidget.js';
import type { EditSession } from './editSession.js';
import { eventWidget } from './eventWidget.js';
import { githubWidget } from './githubWidget.js';
import { HardwareGroup, type HardwareGroupActor } from './hardwareGroup.js';
import { musicWidget } from './musicWidget.js';
import { noteWidget } from './noteWidget.js';
import { pomodoroWidget } from './pomodoroWidget.js';
import { progressWidget } from './progressWidget.js';
import { colors } from './tokens.js';

export interface WidgetSources {
  aiUsage: AiUsageSource;
  hardware: HardwareSource;
  calendar: CalendarEventsSource;
  github: GithubSource;
  music: MusicSource;
  pomodoro: PomodoroSource;
  settings: Gio.Settings;
  openPreferences: (page: string) => void;
}

const GAP = 2;
const EMPTY_PADDING = 10;

/** O que viaja no arraste do editor (specs/17-editor-ambientes.md "Arrastar e soltar"). */
export interface DragSource {
  id: WidgetId;
  from: Side | 'catalog';
}

/** Torna `actor` arrastável; o fantasma é um clone de `look`. */
export function makeWidgetDraggable(
  actor: Clutter.Actor,
  look: Clutter.Actor,
  source: DragSource,
): void {
  (actor as Clutter.Actor & { _delegate?: unknown })._delegate = {
    ...source,
    getDragActor: () => new Clutter.Clone({ source: look, width: look.width, height: look.height }),
    getDragActorSource: () => look,
  };
  DND.makeDraggable(actor, {});
}

interface Entry {
  id: WidgetId;
  widget: Clutter.Actor;
  reactive: boolean;
  /** Só durante a edição: atrás do widget, recebe clique e arraste. */
  handle: St.Button | null;
}

function handleStyle(selected: boolean): string {
  const bg = selected ? colors.accent900 : 'transparent';
  const ring = selected ? colors.accent : colors.neutral800;
  return `border-radius: 12px; background-color: ${bg}; border: 1px solid ${ring};`;
}

// Área de widgets de uma pílula lateral (specs/16-widgets.md "Pílulas"): os
// widgets do ambiente ativo, gap 2px, encostados na ilha (`towardIsland` diz
// de que lado ela fica). Id ainda sem widget não mostra nada.
//
// Largura mínima 0: a área nunca empurra a ilha nem os botões fixos. O que
// cabe é medido com a ilha no maior modo (`slack`), para os widgets não
// piscarem quando ela abre e fecha. Widget que não cabe é alocado depois da
// borda e some pelo clip, sem mexer em `visible` dentro do allocate.
//
// Na edição (specs/17-editor-ambientes.md "Barra durante a edição") os
// widgets deixam de ser reativos: o clique cai num handle atrás de cada um,
// que seleciona e arrasta. A área é o alvo do soltar.
export const WidgetArea = GObject.registerClass(
  class WidgetArea extends St.Widget {
    private readonly sources: WidgetSources;
    private readonly towardIsland: 'start' | 'end';
    private readonly onTrigger: (mode: Mode) => void;
    private ids: readonly WidgetId[] = [];
    private entries: Entry[] = [];
    private session: EditSession | null = null;
    private unsubscribeSession: (() => void) | null = null;
    private emptyLabel: St.Label | null = null;
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
      (this as Clutter.Actor & { _delegate?: unknown })._delegate = {
        handleDragOver: (source: DragSource) => {
          if (!this.session) return DND.DragMotionResult.CONTINUE;
          return source.from === 'catalog'
            ? DND.DragMotionResult.COPY_DROP
            : DND.DragMotionResult.MOVE_DROP;
        },
        acceptDrop: (source: DragSource, _actor: Clutter.Actor, x: number) => {
          const session = this.session;
          if (!session) return false;
          const at = this.indexAt(x);
          // Gravar aqui reconstrói os widgets e destrói a origem no meio do
          // arraste (spike S5).
          GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            session.place(source.id, this.side, at);
            return GLib.SOURCE_REMOVE;
          });
          return true;
        },
      };
      this.connectObject('destroy', () => this.unsubscribeSession?.(), this);
    }

    private get side(): Side {
      return this.towardIsland === 'end' ? 'left' : 'right';
    }

    /** Liga (com a sessão) ou desliga o modo de edição. */
    edit(session: EditSession | null): void {
      if (session === this.session) return;
      this.unsubscribeSession?.();
      this.unsubscribeSession = null;
      this.session = session;
      this.syncEditing();
      if (session) this.unsubscribeSession = session.onChange(() => this.styleHandles());
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
      this.entries = [];
      this.emptyLabel = null;
      this.aiButton = null;
      this.hardware = null;

      for (const id of ids) {
        const widget = this.build(id);
        if (!widget) continue;
        this.add_child(widget);
        this.entries.push({ id, widget, reactive: widget.reactive, handle: null });
      }
      this.syncEditing();
    }

    override vfunc_get_preferred_width(_forHeight: number): [number, number] {
      if (this.emptyLabel)
        return [0, this.emptyLabel.get_preferred_width(-1)[1] + 2 * EMPTY_PADDING];
      const widths = this.shownChildren().map((child) => child.get_preferred_width(-1)[1]);
      const natural = widths.reduce((sum, width) => sum + width, 0);
      return [0, natural + GAP * Math.max(0, widths.length - 1)];
    }

    override vfunc_get_preferred_height(_forWidth: number): [number, number] {
      const shown = this.emptyLabel ? [this.emptyLabel] : this.shownChildren();
      const heights = shown.map((child) => child.get_preferred_height(-1)[1]);
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

      this.entries.forEach(({ widget, handle }) => handle?.allocate(widget.get_allocation_box()));
      if (this.emptyLabel) {
        const [, labelWidth] = this.emptyLabel.get_preferred_width(-1);
        const [, labelHeight] = this.emptyLabel.get_preferred_height(labelWidth);
        childBox.x1 =
          this.towardIsland === 'start' ? EMPTY_PADDING : width - EMPTY_PADDING - labelWidth;
        childBox.x2 = childBox.x1 + labelWidth;
        childBox.y1 = Math.round((height - labelHeight) / 2);
        childBox.y2 = childBox.y1 + labelHeight;
        this.emptyLabel.allocate(childBox);
      }
    }

    private shownChildren(): Clutter.Actor[] {
      return this.entries.map((entry) => entry.widget).filter((widget) => widget.visible);
    }

    /**
     * Posição de soltar na lista de ids: a do widget sob o ponteiro; fora de
     * qualquer um, o fim (`null`). Widget cortado fica depois da borda.
     */
    private indexAt(x: number): number | null {
      const index = this.entries.findIndex(({ widget }) => {
        if (!widget.visible) return false;
        const box = widget.get_allocation_box();
        return x >= box.x1 && x < box.x2;
      });
      return index === -1 ? null : index;
    }

    private syncEditing(): void {
      const session = this.session;
      for (const entry of this.entries) {
        entry.handle?.destroy();
        entry.handle = null;
        entry.widget.reactive = session === null && entry.reactive;
        if (entry.widget instanceof St.Widget) entry.widget.hover = false;
        if (session) entry.handle = this.addHandle(entry, session);
      }
      this.emptyLabel?.destroy();
      this.emptyLabel = null;
      if (session && this.entries.length === 0) {
        this.emptyLabel = new St.Label({
          text: 'Solte widgets aqui',
          style: `font-size: 11.5px; color: ${colors.neutral500};`,
        });
        this.add_child(this.emptyLabel);
      }
      this.queue_relayout();
    }

    private addHandle(entry: Entry, session: EditSession): St.Button {
      const handle = new St.Button({ style: handleStyle(false) });
      handle.set_cursor_type(Clutter.CursorType.GRAB);
      handle.connectObject('clicked', () => session.select(entry.id, this.side), handle);
      makeWidgetDraggable(handle, entry.widget, { id: entry.id, from: this.side });
      this.insert_child_below(handle, entry.widget);
      handle.style = handleStyle(session.selected?.id === entry.id);
      return handle;
    }

    private styleHandles(): void {
      const selected = this.session?.selected?.id;
      for (const { id, handle } of this.entries)
        if (handle) handle.style = handleStyle(id === selected);
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
        case 'github':
          return githubWidget(this.sources.github);
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
