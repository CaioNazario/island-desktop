import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { colors, layout } from './tokens.js';

/** Anel na edição (specs/17-editor-ambientes.md "Barra durante a edição"). */
export type PillRing = 'normal' | 'target' | 'other';

const RING_COLOR: Record<PillRing, string> = {
  normal: colors.neutral800,
  target: colors.accent,
  other: colors.neutral700,
};

function pillStyle(ring: PillRing): string {
  return `
    background-color: ${colors.bg};
    border-radius: ${layout.pillRadius}px;
    border: ${layout.pillRingWidth}px solid ${RING_COLOR[ring]};
    padding: 0 ${layout.pillPaddingH}px;
  `;
}

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
        style: pillStyle('normal'),
        ...params,
      });

      this.set_height(layout.barHeight);
    }

    set ring(ring: PillRing) {
      this.style = pillStyle(ring);
    }
  },
);

export type PillActor = InstanceType<typeof Pill>;
