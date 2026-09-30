import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { colors, layout } from './tokens.js';

// Pílula flutuante (specs/02-barra.md): fundo `bg` + anel 1px, sem blur:
// o `Shell.BlurEffect` não segue o `border-radius` e deixa as quinas quadradas.
export const Pill = GObject.registerClass(
  class Pill extends St.BoxLayout {
    constructor(params: Partial<St.BoxLayout.ConstructorProps> = {}) {
      super({
        style_class: 'island-pill',
        reactive: false,
        x_expand: false,
        // Corta os widgets deslizando na troca de ambiente (specs/15-ambientes.md).
        clip_to_allocation: true,
        y_align: Clutter.ActorAlign.CENTER,
        style: `
          background-color: ${colors.bg};
          border-radius: ${layout.pillRadius}px;
          border: ${layout.pillRingWidth}px solid ${colors.neutral800};
          padding: 0 ${layout.pillPaddingH}px;
        `,
        ...params,
      });

      this.set_height(layout.barHeight);
    }
  },
);

export type PillActor = InstanceType<typeof Pill>;
