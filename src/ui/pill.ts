import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { derivedColors, layout } from './tokens.js';

// Pílula flutuante (specs/02-barra.md): fundo translúcido + blur + anel 1px.
export const Pill = GObject.registerClass(
  class Pill extends St.BoxLayout {
    constructor(params: Partial<St.BoxLayout.ConstructorProps> = {}) {
      super({
        style_class: 'island-pill',
        reactive: false,
        x_expand: false,
        y_align: Clutter.ActorAlign.CENTER,
        style: `
          background-color: ${derivedColors.sidePillBg};
          border-radius: ${layout.pillRadius}px;
          border: ${layout.pillRingWidth}px solid #3f424d;
          padding: 0 ${layout.pillPaddingH}px;
        `,
        ...params,
      });

      this.set_height(layout.barHeight);
      this.add_effect(
        new Shell.BlurEffect({
          radius: 16,
          mode: Shell.BlurMode.BACKGROUND,
        }),
      );
    }
  },
);

export type PillActor = InstanceType<typeof Pill>;
