import type Cairo from 'cairo';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { colors } from './tokens.js';

const SIZE = 13;
const BORDER = 3;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function disc(cr: Cairo.Context, color: string, radius: number): void {
  cr.setSourceRGBA(...rgb(color), 1);
  cr.arc(SIZE / 2, SIZE / 2, radius, 0, 2 * Math.PI);
  cr.fill();
}

// Anel do pomodoro (specs/16-widgets.md "Visual comum"): 13×13, arco
// `accent` sobre `neutral-800` e miolo `bg` a 3px da borda. É o
// `conic-gradient` do design, desenhado em Cairo.
export const ProgressRing = GObject.registerClass(
  class ProgressRing extends St.DrawingArea {
    private value = 0;

    constructor() {
      super({ width: SIZE, height: SIZE });
      this.connectObject('repaint', () => this.draw(), this);
    }

    set fraction(fraction: number) {
      const clamped = Math.max(0, Math.min(1, fraction));
      if (clamped === this.value) return;
      this.value = clamped;
      this.queue_repaint();
    }

    private draw(): void {
      const cr = this.get_context();
      const center = SIZE / 2;
      disc(cr, colors.neutral800, center);
      if (this.value > 0) {
        const start = -Math.PI / 2;
        cr.setSourceRGBA(...rgb(colors.accent), 1);
        cr.moveTo(center, center);
        cr.arc(center, center, center, start, start + this.value * 2 * Math.PI);
        cr.closePath();
        cr.fill();
      }
      disc(cr, colors.bg, center - BORDER);
      (cr as unknown as { $dispose(): void }).$dispose();
    }
  },
);

export type ProgressRingActor = InstanceType<typeof ProgressRing>;
