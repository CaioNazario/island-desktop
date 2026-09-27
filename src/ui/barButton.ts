import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { colors } from './tokens.js';

// Botão da pílula direita (specs/02-barra.md): 24px de altura, raio 12,
// fundo transparente, hover `neutral-900`. `sizeStyle` dá a largura (30px nos
// botões de ícone) ou o padding (bateria).
export const BarButton = GObject.registerClass(
  class BarButton extends St.Button {
    private readonly sizeStyle: string;

    constructor(child: Clutter.Actor, onClick: () => void, sizeStyle = 'width: 30px;') {
      super({ child, track_hover: true, y_align: Clutter.ActorAlign.CENTER });
      this.sizeStyle = sizeStyle;
      this.connectObject(
        'notify::hover',
        () => this.refresh(),
        'clicked',
        () => onClick(),
        this,
      );
      this.refresh();
    }

    private refresh(): void {
      const bg = this.hover ? colors.neutral900 : 'transparent';
      this.style = `height: 24px; border-radius: 12px; background-color: ${bg}; ${this.sizeStyle}`;
    }
  },
);

export type BarButtonActor = InstanceType<typeof BarButton>;
