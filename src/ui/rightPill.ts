import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { BarButton } from './barButton.js';
import { caretIconName, phosphor } from './icons.js';
import { Pill } from './pill.js';
import { colors } from './tokens.js';

// Pílula direita (specs/02-barra.md): os botões ficam à direita, com gap 2px;
// o espaço à esquerda é do grupo de hardware (spec 10).
export const RightPill = GObject.registerClass(
  class RightPill extends Pill {
    constructor(onOpenQuick: () => void) {
      super();
      this.add_child(new St.Widget({ x_expand: true }));

      const buttons = new St.BoxLayout({
        style: 'spacing: 2px;',
        y_align: Clutter.ActorAlign.CENTER,
      });
      buttons.add_child(
        new BarButton(
          new St.Icon({
            gicon: phosphor(caretIconName),
            icon_size: 12,
            style: `color: ${colors.neutral300};`,
          }),
          onOpenQuick,
        ),
      );
      this.add_child(buttons);
    }
  },
);
