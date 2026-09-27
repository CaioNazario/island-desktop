import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { SystemBrightness } from '../system/brightness.js';
import { brightnessIconName, volumeIconName } from './icons.js';
import type { IslandSystem } from './island.js';
import { SliderRow, type DragHooks, type SliderRowActor } from './sliderRow.js';
import { Tile, type TileActor, type TileSource } from './tile.js';
import { colors } from './tokens.js';

function divider(): St.Widget {
  return new St.Widget({
    style: `width: 1px; height: 22px; background-color: ${colors.neutral800}; margin: 0 2px;`,
    y_align: Clutter.ActorAlign.CENTER,
  });
}

// Linha de controles comum a `quick`/`wifi`/`bt` (specs/08-controles-rapidos.md):
// brilho, volume, e os quatro tiles. Configurações/Energia ficam pra spec 09.
export const ControlsRow = GObject.registerClass(
  class ControlsRow extends St.BoxLayout {
    private readonly brightnessPill: SliderRowActor;
    private readonly brightness: SystemBrightness;
    private readonly wifiTile: TileActor;
    private readonly btTile: TileActor;
    private readonly unsubscribeBrightness: () => void;
    private readonly unsubscribeWifi: () => void;
    private readonly unsubscribeBt: () => void;

    constructor(
      system: IslandSystem,
      drag: DragHooks,
      onWifiClick: () => void,
      onBtClick: () => void,
    ) {
      super({
        style: 'height: 58px; padding: 0 10px; spacing: 8px;',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
      });

      this.brightness = system.brightness;
      this.brightnessPill = new SliderRow(brightnessIconName, 6, system.brightness, drag, 'pill');
      this.add_child(this.brightnessPill);

      const volumePill = new SliderRow(
        () => volumeIconName(system.volume),
        6,
        system.volume,
        drag,
        'pill',
      );
      this.add_child(volumePill);

      // "Estado ligado dos tiles Wi-Fi/BT = rádio ligado. Tile de rádio sem hardware some."
      const wifi = system.wifi;
      const wifiRadio: TileSource = {
        get on() {
          return wifi.radioOn;
        },
        onChange: (callback) => wifi.onChange(callback),
      };
      this.wifiTile = new Tile('network-wireless-symbolic', wifiRadio, onWifiClick);
      this.add_child(this.wifiTile);
      const bt = system.bluetooth;
      const btRadio: TileSource = {
        get on() {
          return bt.radioOn;
        },
        onChange: (callback) => bt.onChange(callback),
      };
      this.btTile = new Tile('bluetooth-active-symbolic', btRadio, onBtClick);
      this.add_child(this.btTile);
      this.add_child(
        new Tile('weather-clear-night-symbolic', system.nightLight, () =>
          system.nightLight.toggle(),
        ),
      );
      this.add_child(
        new Tile('notifications-disabled-symbolic', system.dnd, () => system.dnd.toggle()),
      );

      this.add_child(divider());

      this.unsubscribeBrightness = system.brightness.onChange(() =>
        this.syncBrightnessVisibility(),
      );
      this.syncBrightnessVisibility();

      this.unsubscribeWifi = wifi.onChange(() => (this.wifiTile.visible = wifi.available));
      this.wifiTile.visible = wifi.available;

      this.unsubscribeBt = bt.onChange(() => (this.btTile.visible = bt.available));
      this.btTile.visible = bt.available;

      this.connectObject(
        'destroy',
        () => {
          this.unsubscribeBrightness();
          this.unsubscribeWifi();
          this.unsubscribeBt();
        },
        this,
      );
    }

    private syncBrightnessVisibility(): void {
      // "Some se não houver backlight controlável (o volume ocupa o espaço)".
      this.brightnessPill.visible = this.brightness.available;
    }
  },
);

export type ControlsRowActor = InstanceType<typeof ControlsRow>;
