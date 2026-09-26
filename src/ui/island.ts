import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { formatClock, formatDay } from '../core/clock.js';
import { getSize, type IslandState, type Mode, type SizeContext } from '../core/island.js';
import type { SystemBrightness } from '../system/brightness.js';
import type { GSettingsToggle } from '../system/toggleSetting.js';
import type { SystemVolume } from '../system/volume.js';
import type { SystemWifi } from '../system/wifi.js';
import { ControlsRow, type ControlsRowActor } from './controlsRow.js';
import { brightnessIconName, volumeIconName } from './icons.js';
import { SliderRow, type SliderRowActor } from './sliderRow.js';
import { WifiView, type WifiViewActor } from './wifiView.js';
import { colors, effects } from './tokens.js';

const CLOCK_TICK_SECONDS = 15;

// Camada de um modo (specs/03-ilha.md "Cada modo é uma camada própria,
// centrada no topo da ilha, com o tamanho do seu modo"): o conteúdo mantém o
// layout final enquanto a ilha anima, e a `surface` corta o que sobra.
function modeLayer(content: Clutter.Actor): St.Widget {
  const layer = new St.Widget({
    layout_manager: new Clutter.BinLayout(),
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.START,
  });
  layer.set_pivot_point(0.5, 0.5);
  layer.add_child(content);
  return layer;
}

function hiddenTransform(mode: Mode): {
  scaleX: number;
  scaleY: number;
  translationY: number;
} {
  const { hiddenScale, notifHiddenScale, notifHiddenOffsetY } = effects.contentScale;
  return mode === 'notif'
    ? { scaleX: notifHiddenScale, scaleY: notifHiddenScale, translationY: notifHiddenOffsetY }
    : { scaleX: hiddenScale, scaleY: hiddenScale, translationY: 0 };
}

export interface IslandSystem {
  volume: SystemVolume;
  brightness: SystemBrightness;
  nightLight: GSettingsToggle;
  dnd: GSettingsToggle;
  wifi: SystemWifi;
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
    private readonly state: IslandState;
    private readonly onIslandClick: () => void;
    private readonly onEscape: () => void;
    private readonly clockLabel: St.Label;
    private readonly volumeRow: SliderRowActor;
    private readonly brightnessRow: SliderRowActor;
    private readonly quickRow: ControlsRowActor;
    private readonly wifiView: WifiViewActor;
    private readonly layers: ReadonlyMap<Mode, St.Widget>;
    private clockTimerId: number | null = null;
    private isTargetMonitor = false;
    private contentMode: Mode = 'compact';
    private radiusPx = 0;

    constructor(
      state: IslandState,
      system: IslandSystem,
      onIslandClick: () => void,
      onEscape: () => void,
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
      this.add_child(this.surface);

      this.accentLine = new St.Widget({
        style: `background-color: ${colors.accent}; border-radius: 0 0 2px 2px;`,
        width: 36,
        height: 2,
        opacity: 0,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.START,
      });
      this.add_child(this.accentLine);

      this.state = state;
      this.onIslandClick = onIslandClick;
      this.onEscape = onEscape;

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
      const onWifiTileClick = (): void =>
        this.state.openFromTrigger(this.state.mode === 'wifi' ? 'quick' : 'wifi');
      const onBtTileClick = (): void =>
        this.state.openFromTrigger(this.state.mode === 'bt' ? 'quick' : 'bt');
      this.quickRow = new ControlsRow(system, drag, onWifiTileClick, onBtTileClick);
      this.wifiView = new WifiView(system, drag, {
        onWifiTileClick,
        onBtTileClick,
        onSizeChanged: () => this.resize(),
        onLeave: () => this.state.closeAll(),
      });

      this.layers = new Map<Mode, St.Widget>([
        ['compact', modeLayer(this.clockLabel)],
        ['volume', modeLayer(this.volumeRow)],
        ['brightness', modeLayer(this.brightnessRow)],
        ['quick', modeLayer(this.quickRow)],
        ['wifi', modeLayer(this.wifiView)],
      ]);
      this.syncLayerSize('compact');
      this.surface.add_child(this.layers.get('compact')!);

      this.applySize(getSize('compact'), false);
      this.updateClock();

      this.connectObject(
        'button-press-event',
        () => {
          this.onIslandClick();
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
          return GLib.SOURCE_CONTINUE;
        },
      );
    }

    /** Chamado pelo `BarManager` a cada mudança de modo ou de monitor-alvo. */
    render(isTargetMonitor: boolean): void {
      this.isTargetMonitor = isTargetMonitor;
      const mode = isTargetMonitor ? this.state.mode : 'compact';
      this.showContentFor(mode);
      this.applySize(getSize(mode, this.sizeContext()), true);
      this.syncExpanded(mode !== 'compact' || (isTargetMonitor && this.state.cardOpen));
    }

    // "opacidade 1 quando a ilha não está em `compact` ou o cartão central está
    // aberto (300ms)" (specs/03-ilha.md).
    private syncExpanded(expanded: boolean): void {
      this.accentLine.ease({
        opacity: expanded ? 255 : 0,
        duration: effects.islandChrome.durationMs,
        mode: Clutter.AnimationMode.EASE,
      });
    }

    /** O conteúdo do modo atual mudou de altura (ex.: painel de senha do `wifi`). */
    private resize(): void {
      this.syncLayerSize(this.contentMode);
      this.applySize(getSize(this.contentMode, this.sizeContext()), true);
    }

    private sizeContext(): SizeContext {
      return { wifiPasswordField: this.wifiView.passwordField };
    }

    private showContentFor(mode: Mode): void {
      if (mode === this.contentMode) return;
      const previous = this.contentMode;
      this.contentMode = mode;

      // Os demais modos ainda não têm conteúdo (specs 04+): a ilha fica vazia.
      const outgoing = this.layers.get(previous);
      if (outgoing) this.hideLayer(outgoing, previous);
      const incoming = this.layers.get(mode);
      if (incoming) {
        this.syncLayerSize(mode);
        this.showLayer(incoming, mode);
      }
      if (mode === 'wifi') this.wifiView.onOpen();
    }

    private syncLayerSize(mode: Mode): void {
      const size = getSize(mode, this.sizeContext());
      this.layers.get(mode)?.set_size(size.width, size.height);
    }

    // Crossfade (specs/03-ilha.md "Animação"): a camada que entra vai a
    // opacidade 1 em 220ms com atraso de 80ms e escala 0.94→1 em 300ms; a que
    // sai faz o inverso.
    private showLayer(layer: St.Widget, mode: Mode): void {
      layer.remove_all_transitions();
      if (layer.get_parent() === null) {
        this.surface.add_child(layer);
        layer.opacity = 0;
        Object.assign(layer, hiddenTransform(mode));
      } else {
        this.surface.set_child_above_sibling(layer, null);
      }
      layer.ease({
        opacity: 255,
        delay: effects.contentCrossfade.delayMs,
        duration: effects.contentCrossfade.durationMs,
        mode: Clutter.AnimationMode.EASE,
      });
      layer.ease({
        scaleX: 1,
        scaleY: 1,
        translationY: 0,
        duration: effects.contentScale.durationMs,
        mode: Clutter.AnimationMode.EASE,
      });
    }

    private hideLayer(layer: St.Widget, mode: Mode): void {
      layer.remove_all_transitions();
      layer.ease({
        opacity: 0,
        delay: effects.contentCrossfade.delayMs,
        duration: effects.contentCrossfade.durationMs,
        mode: Clutter.AnimationMode.EASE,
        // Interrompida, a camada voltou a entrar (ou a ilha foi destruída):
        // fica onde está.
        onStopped: (isFinished: boolean) => {
          if (isFinished) this.surface.remove_child(layer);
        },
      });
      layer.ease({
        ...hiddenTransform(mode),
        duration: effects.contentScale.durationMs,
        mode: Clutter.AnimationMode.EASE,
      });
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
      this.surface.style = `background-color: ${colors.bg}; border: 1px solid ${colors.neutral800}; border-radius: ${radius}px;`;
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
