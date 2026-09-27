import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { formatClock, formatDay } from '../core/clock.js';
import { getSize, type IslandState, type Mode, type SizeContext } from '../core/island.js';
import type { SystemBluetooth } from '../system/bluetooth.js';
import type { CalendarEventsSource } from '../system/calendarEvents.js';
import type { NotificationEntry, NotificationFeed } from '../system/notifications.js';
import type { SystemBrightness } from '../system/brightness.js';
import type { MusicSource } from '../system/mpris.js';
import type { SystemSession } from '../system/session.js';
import type { GSettingsToggle } from '../system/toggleSetting.js';
import type { SystemVolume } from '../system/volume.js';
import type { SystemWifi } from '../system/wifi.js';
import { BtView, type BtViewActor } from './btView.js';
import { ControlsRow, type ControlsRowActor, type ControlsRowOptions } from './controlsRow.js';
import { brightnessIconName, volumeIconName } from './icons.js';
import { hideLayer, modeLayer, showLayer } from './modeLayer.js';
import { MusicModeRow } from './musicView.js';
import { notifContent, type NotificationRowActor } from './notificationRow.js';
import { IslandPowerToggle, quickContent } from './powerRow.js';
import { SliderRow, type SliderRowActor } from './sliderRow.js';
import { StackView, type StackViewActor } from './stackView.js';
import { WifiView, type WifiViewActor } from './wifiView.js';
import { colors, effects } from './tokens.js';

const CLOCK_TICK_SECONDS = 15;

export interface IslandSystem {
  volume: SystemVolume;
  brightness: SystemBrightness;
  nightLight: GSettingsToggle;
  dnd: GSettingsToggle;
  wifi: SystemWifi;
  bluetooth: SystemBluetooth;
  session: SystemSession;
  notifications: NotificationFeed;
  music: MusicSource;
  calendar: CalendarEventsSource;
}

// Ator da ilha central (specs/03-ilha.md). O estado é único e compartilhado
// entre monitores (specs/02-barra.md); esta view só renderiza o modo atual
// quando `isTarget` é true, e fica em `compact` nos demais monitores.
//
// A ilha em si não pinta nada: o fundo, o anel e o corte do conteúdo
// (`overflow: hidden` no design) ficam na `surface`, para que sombra e brilho
// possam ser atores irmãos fora da área cortada.
export const Island = GObject.registerClass(
  {
    Properties: {
      // Animável com `ease_property` (specs/03-ilha.md: "raio: 460ms ease").
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
  class Island extends St.Widget {
    private readonly surface: St.Widget;
    private readonly accentLine: St.Widget;
    // O St só compõe um `box-shadow` por ator: a sombra e o brilho da ilha
    // expandida são irmãos atrás da `surface` (specs/03-ilha.md).
    private readonly dropShadow: St.Widget;
    private readonly glow: St.Widget;
    private readonly state: IslandState;
    private readonly onIslandClick: () => void;
    private readonly onEscape: () => void;
    private readonly onPressOutside: (target: Clutter.Actor) => boolean;
    private readonly clockLabel: St.Label;
    private readonly volumeRow: SliderRowActor;
    private readonly brightnessRow: SliderRowActor;
    private readonly quickRow: ControlsRowActor;
    private readonly wifiView: WifiViewActor;
    private readonly btView: BtViewActor;
    private readonly notifRow: NotificationRowActor;
    private readonly stackView: StackViewActor;
    private readonly layers: ReadonlyMap<Mode, St.Widget>;
    private readonly power: IslandPowerToggle;
    private clockTimerId: number | null = null;
    private isTargetMonitor = false;
    private contentMode: Mode = 'compact';
    private radiusPx = 0;

    constructor(
      state: IslandState,
      system: IslandSystem,
      onIslandClick: () => void,
      onEscape: () => void,
      onPressOutside: (target: Clutter.Actor) => boolean,
    ) {
      super({
        style_class: 'island',
        layout_manager: new Clutter.BinLayout(),
        reactive: true,
        can_focus: true,
        track_hover: true,
      });

      this.surface = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        clip_to_allocation: true,
        x_expand: true,
        y_expand: true,
      });
      this.glow = new St.Widget({ opacity: 0, x_expand: true, y_expand: true });
      this.add_child(this.glow);
      this.dropShadow = new St.Widget({ opacity: 0, x_expand: true, y_expand: true });
      this.add_child(this.dropShadow);
      this.add_child(this.surface);

      this.accentLine = new St.Widget({
        style: `background-color: ${colors.accent}; border-radius: 0 0 2px 2px;`,
        width: 36,
        height: 2,
        opacity: 0,
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.START,
      });
      this.add_child(this.accentLine);

      this.state = state;
      this.onIslandClick = onIslandClick;
      this.onEscape = onEscape;
      this.onPressOutside = onPressOutside;

      this.clockLabel = new St.Label({
        style: `
          color: #e9e9ed;
          font-weight: 500;
          font-size: 13px;
          font-feature-settings: "tnum";
        `,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
      });
      const drag = { start: () => this.state.dragStart(), end: () => this.state.dragEnd() };
      this.volumeRow = new SliderRow(() => volumeIconName(system.volume), 7, system.volume, drag);
      this.brightnessRow = new SliderRow(brightnessIconName, 6, system.brightness, drag);
      // "abre wifi; em wifi, volta a quick" (specs/08) — não é a regra 2 da
      // spec 03 (gatilho fecha a ilha): o tile vive dentro de quick/wifi/bt.
      this.power = new IslandPowerToggle(state);
      const controls: ControlsRowOptions = {
        onWifiTileClick: () =>
          this.state.openFromTrigger(this.state.mode === 'wifi' ? 'quick' : 'wifi'),
        onBtTileClick: () => this.state.openFromTrigger(this.state.mode === 'bt' ? 'quick' : 'bt'),
        // Fecha antes de abrir: sem o grab, a janela do app recebe o foco.
        onSettingsClick: () => {
          this.state.closeAll();
          system.session.openSettings();
        },
        power: this.power,
        onPowerAction: (action) => {
          this.state.closeAll();
          system.session.run(action);
        },
      };
      this.quickRow = new ControlsRow(system, drag, controls);
      this.wifiView = new WifiView(system, drag, {
        ...controls,
        onSizeChanged: () => this.resize(),
        onLeave: () => this.state.closeAll(),
      });
      this.btView = new BtView(system, drag, {
        ...controls,
        onSizeChanged: () => this.resize(),
        onLeave: () => this.state.closeAll(),
      });

      // × fecha a ilha; a notificação continua na lista.
      const notif = notifContent(() => this.state.closeAll());
      this.notifRow = notif.row;

      this.stackView = new StackView(system.notifications, {
        onSizeChanged: () => this.resize(),
        onActivate: (entry: NotificationEntry) => {
          this.state.closeAll();
          entry.activate();
        },
      });

      this.layers = new Map<Mode, St.Widget>([
        ['compact', modeLayer(this.clockLabel)],
        ['notif', modeLayer(notif.content)],
        ['stack', modeLayer(this.stackView)],
        ['music', modeLayer(new MusicModeRow(system.music, () => this.state.keepAlive()))],
        ['volume', modeLayer(this.volumeRow)],
        ['brightness', modeLayer(this.brightnessRow)],
        ['quick', modeLayer(quickContent(this.quickRow, system.session, controls))],
        ['wifi', modeLayer(this.wifiView)],
        ['bt', modeLayer(this.btView)],
      ]);
      this.syncLayerSize('compact');
      this.surface.add_child(this.layers.get('compact')!);

      this.applySize(getSize('compact'), false);
      this.updateClock();

      // Gesto, não `button-press-event`: um ator que devolve EVENT_STOP no
      // press cancela os gestos da cadeia, inclusive o `ClickGesture` dos
      // `St.Button` do conteúdo (tiles, switch).
      const clickGesture = new Clutter.ClickGesture();
      clickGesture.connectObject('recognize', () => this.onIslandClick(), this);
      this.add_action(clickGesture);

      this.connectObject(
        // Com o grab modal, o clique fora da ilha é entregue a ela: fecha
        // tudo, como os menus do Shell. STOP para não virar clique na ilha
        // (já em `compact`, abriria o cartão central).
        'captured-event',
        (_actor: St.Widget, event: Clutter.Event) => {
          const type = event.type();
          if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.TOUCH_BEGIN)
            return Clutter.EVENT_PROPAGATE;
          const target = global.stage.get_event_actor(event);
          if (target && this.contains(target)) return Clutter.EVENT_PROPAGATE;
          // O banner fica fora da ilha e do grab (specs/04-notificacoes.md).
          if (target && this.onPressOutside(target)) return Clutter.EVENT_STOP;
          this.state.closeAll();
          return Clutter.EVENT_STOP;
        },
        'enter-event',
        () => {
          if (this.isTargetMonitor) this.state.hoverStart();
        },
        'leave-event',
        () => {
          if (this.isTargetMonitor) this.state.hoverEnd();
        },
        'key-press-event',
        (_actor: St.Widget, event: Clutter.Event) => {
          if (event.get_key_symbol() === Clutter.KEY_Escape) {
            // Regra 9 da spec 03: com o painel de senha aberto, Esc fecha só ele.
            if (this.contentMode === 'wifi' && this.wifiView.closePasswordIfOpen())
              return Clutter.EVENT_STOP;
            this.onEscape();
            return Clutter.EVENT_STOP;
          }
          return Clutter.EVENT_PROPAGATE;
        },
        'destroy',
        () => this.onDestroy(),
        this,
      );

      this.clockTimerId = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        CLOCK_TICK_SECONDS,
        () => {
          this.updateClock();
          this.notifRow.refreshTime();
          this.stackView.refreshTimes();
          return GLib.SOURCE_CONTINUE;
        },
      );
    }

    /** Conteúdo do `notif`; o `BarManager` chama antes de abrir o modo. */
    setNotification(entry: NotificationEntry): void {
      this.notifRow.setEntry(entry);
    }

    /** Notificação nova com `stack` aberto (specs/04-notificacoes.md). */
    flashStack(entry: NotificationEntry): void {
      this.stackView.flash(entry);
    }

    /** Chamado pelo `BarManager` a cada mudança de modo ou de monitor-alvo. */
    render(isTargetMonitor: boolean): void {
      this.isTargetMonitor = isTargetMonitor;
      const mode = isTargetMonitor ? this.state.mode : 'compact';
      this.power.sync();
      this.showContentFor(mode);
      // A linha de energia muda a altura sem trocar de modo.
      this.resize();
      this.syncExpanded(mode !== 'compact' || (isTargetMonitor && this.state.cardOpen));
      // "Cursor de mão só em `compact` e `notif`" (specs/03-ilha.md): nos
      // outros modos, cliques são do conteúdo.
      this.set_cursor_type(
        mode === 'compact' || mode === 'notif'
          ? Clutter.CursorType.POINTER
          : Clutter.CursorType.DEFAULT,
      );
    }

    // "opacidade 1 quando a ilha não está em `compact` ou o cartão central está
    // aberto (300ms)" (specs/03-ilha.md).
    private syncExpanded(expanded: boolean): void {
      for (const actor of [this.accentLine, this.dropShadow, this.glow]) {
        actor.ease({
          opacity: expanded ? 255 : 0,
          duration: effects.islandChrome.durationMs,
          mode: Clutter.AnimationMode.EASE,
        });
      }
    }

    /** O conteúdo do modo atual mudou de altura (energia, senha do `wifi`, rádio do `bt`). */
    private resize(): void {
      this.syncLayerSize(this.contentMode);
      this.applySize(getSize(this.contentMode, this.sizeContext()), true);
    }

    private sizeContext(): SizeContext {
      const powerOpen = this.state.powerOpen;
      return {
        stackItemCount: this.stackView.itemCount,
        quickEnergyOpen: powerOpen,
        wifiEnergyOpen: powerOpen,
        wifiPasswordField: this.wifiView.passwordField,
        btOn: this.btView.radioIsOn,
        btEnergyOpen: powerOpen,
      };
    }

    private showContentFor(mode: Mode): void {
      if (mode === this.contentMode) return;
      const previous = this.contentMode;
      this.contentMode = mode;

      // Os demais modos ainda não têm conteúdo (specs 04+): a ilha fica vazia.
      const outgoing = this.layers.get(previous);
      if (outgoing) hideLayer(this.surface, outgoing, previous);
      const incoming = this.layers.get(mode);
      if (incoming) {
        this.syncLayerSize(mode);
        showLayer(this.surface, incoming, mode);
      }
      if (previous === 'bt') this.btView.onClose();
      if (mode === 'wifi') this.wifiView.onOpen();
      if (mode === 'bt') this.btView.onOpen();
    }

    private syncLayerSize(mode: Mode): void {
      const size = getSize(mode, this.sizeContext());
      this.layers.get(mode)?.set_size(size.width, size.height);
    }

    private updateClock(): void {
      const now = new Date();
      this.clockLabel.text = `${formatClock(now)} · ${formatDay(now)}`;
    }

    get radius(): number {
      return this.radiusPx;
    }

    set radius(radius: number) {
      if (this.radiusPx === radius) return;
      this.radiusPx = radius;
      const shape = `background-color: ${colors.bg}; border-radius: ${radius}px;`;
      this.surface.style = `${shape} border: 1px solid ${colors.neutral800};`;
      this.dropShadow.style = `${shape} box-shadow: ${effects.islandShadow.drop};`;
      this.glow.style = `${shape} box-shadow: ${effects.islandShadow.glow};`;
      this.notify('radius');
    }

    private applySize(
      size: { width: number; height: number; radius: number },
      animate: boolean,
    ): void {
      if (!animate) {
        this.set_size(size.width, size.height);
        this.radius = size.radius;
        return;
      }
      this.ease({
        width: size.width,
        height: size.height,
        duration: effects.islandSpring.durationMs,
        mode: Clutter.AnimationMode.EASE_OUT_BACK,
      });
      this.ease_property('radius', size.radius, {
        duration: effects.islandRadius.durationMs,
        mode: Clutter.AnimationMode.EASE,
      });
    }

    private onDestroy(): void {
      if (this.clockTimerId !== null) {
        GLib.Source.remove(this.clockTimerId);
        this.clockTimerId = null;
      }
      // Só as camadas visíveis (a atual e a que ainda sai) são filhas da
      // ilha e morrem junto com ela; as demais precisam ser destruídas à mão.
      for (const layer of this.layers.values()) {
        if (layer.get_parent() === null) layer.destroy();
      }
    }
  },
);

export type IslandActor = InstanceType<typeof Island>;
