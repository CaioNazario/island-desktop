import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { formatClock, formatDay } from '../core/clock.js';
import { getSize, type IslandState, type Mode } from '../core/island.js';
import type { SystemBrightness } from '../system/brightness.js';
import type { GSettingsToggle } from '../system/toggleSetting.js';
import type { SystemVolume } from '../system/volume.js';
import type { SystemWifi } from '../system/wifi.js';
import { ControlsRow, type ControlsRowActor } from './controlsRow.js';
import { brightnessIconName, volumeIconName } from './icons.js';
import { SliderRow, type SliderRowActor } from './sliderRow.js';
import { effects } from './tokens.js';

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
export const Island = GObject.registerClass(
  class Island extends St.Bin {
    private readonly state: IslandState;
    private readonly onIslandClick: () => void;
    private readonly onEscape: () => void;
    private readonly clockLabel: St.Label;
    private readonly volumeRow: SliderRowActor;
    private readonly brightnessRow: SliderRowActor;
    private readonly quickRow: ControlsRowActor;
    private clockTimerId: number | null = null;
    private isTargetMonitor = false;
    private contentMode: Mode = 'compact';

    constructor(
      state: IslandState,
      system: IslandSystem,
      onIslandClick: () => void,
      onEscape: () => void,
    ) {
      super({
        style_class: 'island',
        reactive: true,
        can_focus: true,
        track_hover: true,
        style: 'background-color: #161826; border: 1px solid #3f424d;',
      });

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
      this.quickRow = new ControlsRow(
        system,
        drag,
        // "abre wifi; em wifi, volta a quick" (specs/08) — não é a regra 2 da
        // spec 03 (gatilho fecha a ilha): o tile vive dentro de quick/wifi/bt.
        () => this.state.openFromTrigger(this.state.mode === 'wifi' ? 'quick' : 'wifi'),
        () => this.state.openFromTrigger(this.state.mode === 'bt' ? 'quick' : 'bt'),
      );

      this.set_child(this.clockLabel);

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
        (_actor: St.Bin, event: Clutter.Event) => {
          if (event.get_key_symbol() === Clutter.KEY_Escape) {
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
      this.applySize(getSize(mode), true);
      this.showContentFor(mode);
    }

    private showContentFor(mode: Mode): void {
      if (mode === this.contentMode) return;
      this.contentMode = mode;
      switch (mode) {
        case 'compact':
          this.set_child(this.clockLabel);
          break;
        case 'volume':
          this.set_child(this.volumeRow);
          break;
        case 'brightness':
          this.set_child(this.brightnessRow);
          break;
        case 'quick':
          this.set_child(this.quickRow);
          break;
        // Os demais modos ainda não têm conteúdo (specs 04+): a ilha fica vazia.
        default:
          this.set_child(null);
      }
    }

    private updateClock(): void {
      const now = new Date();
      this.clockLabel.text = `${formatClock(now)} · ${formatDay(now)}`;
    }

    private applySize(
      size: { width: number; height: number; radius: number },
      animate: boolean,
    ): void {
      if (!animate) {
        this.set_size(size.width, size.height);
        this.style = `background-color: #161826; border: 1px solid #3f424d; border-radius: ${size.radius}px;`;
        return;
      }
      this.ease({
        width: size.width,
        height: size.height,
        duration: effects.islandSpring.durationMs,
        mode: Clutter.AnimationMode.EASE_OUT_BACK,
      });
    }

    private onDestroy(): void {
      if (this.clockTimerId !== null) {
        GLib.Source.remove(this.clockTimerId);
        this.clockTimerId = null;
      }
    }
  },
);

export type IslandActor = InstanceType<typeof Island>;
