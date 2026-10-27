import type Clutter from 'gi://Clutter';
import type St from 'gi://St';

import type { IslandState } from '../core/island.js';
import type { NotificationEntry } from '../system/notifications.js';
import { AiModeView, type AiModeViewActor } from './aiView.js';
import { BtView, type BtViewActor } from './btView.js';
import { CalendarModeView, type CalendarModeViewActor } from './calendarView.js';
import { CenterCard, type CenterCardActor } from './centerCard.js';
import { ControlsRow, type ControlsRowActor, type ControlsRowOptions } from './controlsRow.js';
import { EnvironmentModeRow } from './environmentView.js';
import { brightnessIconName, volumeIconName } from './icons.js';
import type { IslandSystem } from './island.js';
import { type LayerId, modeLayer } from './modeLayer.js';
import { MusicModeRow } from './musicView.js';
import { NoteView, type NoteViewActor } from './noteView.js';
import { notifContent, type NotificationRowActor } from './notificationRow.js';
import { IslandPowerToggle, quickContent } from './powerRow.js';
import { type DragHooks, SliderRow, type SliderRowActor } from './sliderRow.js';
import { StackView, type StackViewActor } from './stackView.js';
import { WifiView, type WifiViewActor } from './wifiView.js';

/** Views dos modos da ilha e a camada de cada modo (specs/03-ilha.md). */
export interface IslandViews {
  volumeRow: SliderRowActor;
  brightnessRow: SliderRowActor;
  power: IslandPowerToggle;
  quickRow: ControlsRowActor;
  wifiView: WifiViewActor;
  btView: BtViewActor;
  notifRow: NotificationRowActor;
  stackView: StackViewActor;
  calendarView: CalendarModeViewActor;
  card: CenterCardActor;
  aiView: AiModeViewActor;
  noteView: NoteViewActor;
  layers: ReadonlyMap<LayerId, St.Widget>;
}

interface ViewContext {
  state: IslandState;
  system: IslandSystem;
  drag: DragHooks;
  /** O conteúdo do modo atual mudou de altura. */
  resize: () => void;
}

// Conteúdo das camadas que não fica guardado em `IslandViews`.
interface LayerContent {
  compact: Clutter.Actor;
  notif: Clutter.Actor;
  controls: ControlsRowOptions;
}

export function buildIslandViews(
  state: IslandState,
  system: IslandSystem,
  compact: Clutter.Actor,
  resize: () => void,
): IslandViews {
  const drag = { start: () => state.dragStart(), end: () => state.dragEnd() };
  const ctx: ViewContext = { state, system, drag, resize };
  const volumeRow = new SliderRow(() => volumeIconName(system.volume), 6, system.volume, drag);
  const brightnessRow = new SliderRow(brightnessIconName, 6, system.brightness, drag);
  const power = new IslandPowerToggle(state);
  const controls = controlsOptions(ctx, power);
  const tiles = tileViews(ctx, controls);
  // × fecha a ilha; a notificação continua na lista.
  const notif = notifContent(() => state.closeAll());
  const views = {
    volumeRow,
    brightnessRow,
    power,
    ...tiles,
    notifRow: notif.row,
    ...contentViews(ctx),
  };
  return { ...views, layers: layerMap(ctx, views, { compact, notif: notif.content, controls }) };
}

// "abre wifi; em wifi, volta a quick" (specs/08) — não é a regra 2 da
// spec 03 (gatilho fecha a ilha): o tile vive dentro de quick/wifi/bt.
function controlsOptions(ctx: ViewContext, power: IslandPowerToggle): ControlsRowOptions {
  const { state, system } = ctx;
  return {
    onWifiTileClick: () => state.openFromTrigger(state.mode === 'wifi' ? 'quick' : 'wifi'),
    onBtTileClick: () => state.openFromTrigger(state.mode === 'bt' ? 'quick' : 'bt'),
    // Fecha antes de abrir: sem o grab, a janela do app recebe o foco.
    onSettingsClick: () => {
      state.closeAll();
      system.session.openSettings();
    },
    power,
    onPowerAction: (action) => {
      state.closeAll();
      system.session.run(action);
    },
  };
}

function tileViews(
  ctx: ViewContext,
  controls: ControlsRowOptions,
): Pick<IslandViews, 'quickRow' | 'wifiView' | 'btView'> {
  const { state, system, drag } = ctx;
  const callbacks = {
    ...controls,
    onSizeChanged: ctx.resize,
    onLeave: () => state.closeAll(),
  };
  return {
    quickRow: new ControlsRow(system, drag, controls),
    wifiView: new WifiView(system, drag, callbacks),
    btView: new BtView(system, drag, callbacks),
  };
}

function contentViews(
  ctx: ViewContext,
): Pick<IslandViews, 'stackView' | 'calendarView' | 'card' | 'aiView' | 'noteView'> {
  const { state, system, resize } = ctx;
  return {
    stackView: new StackView(system.notifications, {
      onSizeChanged: resize,
      onActivate: (entry: NotificationEntry) => {
        state.closeAll();
        entry.activate();
      },
    }),
    calendarView: new CalendarModeView(system.calendar, { onSizeChanged: resize }),
    card: new CenterCard(system.music, system.calendar, { onSizeChanged: resize }),
    aiView: new AiModeView(system.aiUsage, { onSizeChanged: resize }),
    noteView: new NoteView(system.settings, () => state.closeAll()),
  };
}

function layerMap(
  ctx: ViewContext,
  views: Omit<IslandViews, 'layers'>,
  content: LayerContent,
): ReadonlyMap<LayerId, St.Widget> {
  const { state, system } = ctx;
  return new Map<LayerId, St.Widget>([
    ['compact', modeLayer(content.compact)],
    ['notif', modeLayer(content.notif)],
    ['stack', modeLayer(views.stackView)],
    ['music', modeLayer(new MusicModeRow(system.music, () => state.keepAlive()))],
    ['volume', modeLayer(views.volumeRow)],
    ['brightness', modeLayer(views.brightnessRow)],
    ['calendar', modeLayer(views.calendarView)],
    ['quick', modeLayer(quickContent(views.quickRow, system.session, content.controls))],
    ['wifi', modeLayer(views.wifiView)],
    ['bt', modeLayer(views.btView)],
    ['ai', modeLayer(views.aiView)],
    ['env', modeLayer(new EnvironmentModeRow(system.environments))],
    ['note', modeLayer(views.noteView)],
    ['card', modeLayer(views.card)],
  ]);
}
