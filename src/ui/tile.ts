import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { colors } from './tokens.js';

export interface TileSource {
  readonly on: boolean;
  onChange(callback: () => void): () => void;
}

const TRANSITION_MS = 180;

function styleFor(on: boolean): string {
  const bg = on ? colors.accent600 : colors.neutral800;
  const fg = on ? colors.neutral100 : colors.neutral300;
  return `
    width: 38px;
    height: 38px;
    border-radius: 19px;
    background-color: ${bg};
    color: ${fg};
    transition-duration: ${TRANSITION_MS}ms;
  `;
}

// Tile 38×38 ligado/desligado (specs/08-controles-rapidos.md). Usado pelos
// tiles de Wi-Fi, Bluetooth, modo noturno e não perturbe da linha de
// controles de `quick`/`wifi`/`bt`.
export const Tile = GObject.registerClass(
  class Tile extends St.Button {
    private readonly icon: St.Icon;
    private readonly source: TileSource;
    private readonly unsubscribe: () => void;

    constructor(iconName: string, source: TileSource, onClick: () => void) {
      super({
        style_class: 'island-tile',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });

      this.source = source;

      this.icon = new St.Icon({ icon_name: iconName, icon_size: 18 });
      this.set_child(this.icon);

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
      this.style = styleFor(this.source.on);
    }
  },
);

export type TileActor = InstanceType<typeof Tile>;
