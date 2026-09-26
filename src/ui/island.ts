import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { formatClock, formatDay } from '../core/clock.js';
import { getSize, IslandState, type Scheduler } from '../core/island.js';
import { effects } from './tokens.js';

class GLibScheduler implements Scheduler {
  setTimeout(callback: () => void, ms: number): number {
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      callback();
      return GLib.SOURCE_REMOVE;
    });
  }

  clearTimeout(id: number): void {
    GLib.Source.remove(id);
  }
}

const CLOCK_TICK_SECONDS = 15;

// Ator da ilha central (specs/03-ilha.md). Modo `compact` mostra hora e dia;
// os demais modos chegam com as specs 04+.
export const Island = GObject.registerClass(
  class Island extends St.Bin {
    private readonly state: IslandState;
    private readonly clockLabel: St.Label;
    private clockTimerId: number | null = null;

    constructor() {
      super({
        style_class: 'island',
        reactive: true,
        track_hover: true,
        style: 'background-color: #161826; border: 1px solid #3f424d;',
      });

      this.state = new IslandState(new GLibScheduler(), {
        onChange: () => this.syncMode(),
      });

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
      this.set_child(this.clockLabel);

      this.applySize(getSize('compact'), false);
      this.updateClock();

      this.connectObject(
        'button-press-event',
        () => {
          this.state.islandClick();
          return Clutter.EVENT_STOP;
        },
        'enter-event',
        () => {
          this.state.hoverStart();
        },
        'leave-event',
        () => {
          this.state.hoverEnd();
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

    private updateClock(): void {
      const now = new Date();
      this.clockLabel.text = `${formatClock(now)} · ${formatDay(now)}`;
    }

    /** Re-sincroniza tamanho e conteúdo com `state.mode` (specs/03-ilha.md). */
    private syncMode(): void {
      const mode = this.state.mode;
      this.applySize(getSize(mode), true);
      // Os demais modos ainda não têm conteúdo (specs 04+); por ora a ilha
      // fica vazia fora do compact em vez de mostrar o relógio no tamanho errado.
      this.clockLabel.visible = mode === 'compact';
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
