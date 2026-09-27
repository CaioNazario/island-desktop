import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { phosphor } from './icons.js';
import { colors } from './tokens.js';

export interface RoundButtonColors {
  bg: string;
  fg: string;
}

export const ROUND_BUTTON_RESTING: RoundButtonColors = {
  bg: colors.neutral800,
  fg: colors.neutral300,
};

// Botão 38×38 raio 19 depois do divisor da linha de controles
// (specs/09-sessao-energia.md): hover `neutral-700` / `text`, pressionado
// `accent-800`. `resting` dá as cores fora do hover (o Energia muda quando a
// linha de energia está aberta); `refresh()` reaplica quando elas mudam.
export const RoundButton = GObject.registerClass(
  class RoundButton extends St.Button {
    private readonly resting: () => RoundButtonColors;

    constructor(
      glyph: string,
      onClick: () => void,
      resting: () => RoundButtonColors = () => ROUND_BUTTON_RESTING,
    ) {
      super({
        child: new St.Icon({ gicon: phosphor(glyph), icon_size: 17 }),
        track_hover: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.resting = resting;
      this.connectObject(
        'notify::hover',
        () => this.refresh(),
        'notify::pressed',
        () => this.refresh(),
        'clicked',
        () => onClick(),
        this,
      );
      this.refresh();
    }

    refresh(): void {
      const { bg, fg } = this.colorsNow();
      this.style = `
        width: 38px;
        height: 38px;
        border-radius: 19px;
        background-color: ${bg};
        color: ${fg};
        transition-duration: 180ms;
      `;
    }

    private colorsNow(): RoundButtonColors {
      if (this.pressed) return { bg: colors.accent800, fg: colors.text };
      if (this.hover) return { bg: colors.neutral700, fg: colors.text };
      return this.resting();
    }
  },
);

export type RoundButtonActor = InstanceType<typeof RoundButton>;
