import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { colors } from './tokens.js';

export interface SwitchSource {
  readonly on: boolean;
  onChange(callback: () => void): () => void;
}

const TRANSITION_MS = 180;
const KNOB_OFF_X = 2;
const KNOB_ON_X = 16;

// Switch 32×18 dos cabeçalhos de `wifi` e `bt` (specs/08-controles-rapidos.md):
// ligado `accent-600`, desligado `neutral-700`, bolinha 14px `neutral-100`.
export const Switch = GObject.registerClass(
  class Switch extends St.Button {
    private readonly knob: St.Widget;
    private readonly source: SwitchSource;
    private readonly unsubscribe: () => void;

    constructor(source: SwitchSource, onClick: () => void) {
      super({ y_align: Clutter.ActorAlign.CENTER });
      this.source = source;

      this.knob = new St.Widget({
        style: `width: 14px; height: 14px; border-radius: 7px; background-color: ${colors.neutral100};`,
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.CENTER,
        translation_x: source.on ? KNOB_ON_X : KNOB_OFF_X,
      });
      this.set_child(this.knob);

      this.connectObject(
        'clicked',
        () => onClick(),
        'destroy',
        () => this.unsubscribe(),
        this,
      );

      this.unsubscribe = source.onChange(() => this.sync());
      this.sync();
    }

    private sync(): void {
      const on = this.source.on;
      this.style = `
        width: 32px;
        height: 18px;
        border-radius: 9px;
        background-color: ${on ? colors.accent600 : colors.neutral700};
        transition-duration: ${TRANSITION_MS}ms;
      `;
      this.knob.ease({
        translationX: on ? KNOB_ON_X : KNOB_OFF_X,
        duration: TRANSITION_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    }
  },
);
