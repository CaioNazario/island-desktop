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

      // Bolinha em posição fixa num trilho sem layout, como o switch do
      // editor: o alinhamento do filho do `St.Button` a deixava fora do lugar.
      this.knob = new St.Widget({
        style: `border-radius: 7px; background-color: ${colors.neutral100};`,
        width: 14,
        height: 14,
        x: source.on ? KNOB_ON_X : KNOB_OFF_X,
        y: 2,
      });
      const track = new St.Widget({ width: 32, height: 18 });
      track.add_child(this.knob);
      this.set_child(track);

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
        border-radius: 9px;
        background-color: ${on ? colors.accent600 : colors.neutral700};
        transition-duration: ${TRANSITION_MS}ms;
      `;
      this.knob.ease({
        x: on ? KNOB_ON_X : KNOB_OFF_X,
        duration: TRANSITION_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    }
  },
);
