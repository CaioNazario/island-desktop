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
    private readonly state: IslandState;
    private readonly onIslandClick: () => void;
    private readonly onEscape: () => void;
    private readonly clockLabel: St.Label;
    private readonly volumeRow: SliderRowActor;
    private readonly brightnessRow: SliderRowActor;
    private readonly quickRow: ControlsRowActor;
    private readonly wifiView: WifiViewActor;
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

      this.setContent(this.clockLabel);

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
    }

    /** O conteúdo do modo atual mudou de altura (ex.: painel de senha do `wifi`). */
    private resize(): void {
      this.applySize(getSize(this.contentMode, this.sizeContext()), true);
    }

    private sizeContext(): SizeContext {
      return { wifiPasswordField: this.wifiView.passwordField };
    }

    private showContentFor(mode: Mode): void {
      if (mode === this.contentMode) return;
      this.contentMode = mode;
      switch (mode) {
        case 'compact':
          this.setContent(this.clockLabel);
          break;
        case 'volume':
          this.setContent(this.volumeRow);
          break;
        case 'brightness':
          this.setContent(this.brightnessRow);
          break;
        case 'quick':
          this.setContent(this.quickRow);
          break;
        case 'wifi':
          this.setContent(this.wifiView);
          this.wifiView.onOpen();
          break;
        // Os demais modos ainda não têm conteúdo (specs 04+): a ilha fica vazia.
        default:
          this.setContent(null);
      }
    }

    private setContent(content: Clutter.Actor | null): void {
      this.surface.remove_all_children();
      if (content) this.surface.add_child(content);
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
      // Só o conteúdo do modo atual é filho da ilha e morre junto com ela;
      // os demais precisam ser destruídos à mão.
      const contents = [
        this.clockLabel,
        this.volumeRow,
        this.brightnessRow,
        this.quickRow,
        this.wifiView,
      ];
      for (const content of contents) {
        if (content.get_parent() === null) content.destroy();
      }
    }
  },
);

export type IslandActor = InstanceType<typeof Island>;
