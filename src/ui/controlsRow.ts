import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { SystemBrightness } from '../system/brightness.js';
import {
  brightnessIconName,
  btIconName,
  dndIconName,
  nightLightIconName,
  powerIconName,
  settingsIconName,
  volumeIconName,
  wifiTileIconName,
} from './icons.js';
import type { IslandSystem } from './island.js';
import type { PowerAction } from '../system/session.js';
import type { PowerToggle } from './powerRow.js';
import { ROUND_BUTTON_RESTING, RoundButton } from './roundButton.js';
import { SliderRow, type DragHooks, type SliderRowActor } from './sliderRow.js';
import { Tile, type TileActor, type TileSource } from './tile.js';
import { colors, derivedColors } from './tokens.js';

function divider(): St.Widget {
  return new St.Widget({
    style: `width: 1px; height: 22px; background-color: ${colors.neutral800}; margin: 0 2px;`,
    y_align: Clutter.ActorAlign.CENTER,
  });
}

export interface ControlsRowOptions {
  onWifiTileClick(): void;
  onBtTileClick(): void;
  /** Configurações: a ilha fecha e o app abre (specs/09-sessao-energia.md). */
  onSettingsClick(): void;
  /** Energia alterna a linha de energia; cada ação fecha a ilha antes de rodar. */
  power: PowerToggle;
  onPowerAction(action: PowerAction): void;
}

// Linha de controles comum a `quick`/`wifi`/`bt` (specs/08-controles-rapidos.md):
// brilho, volume, os quatro tiles e, depois do divisor, Configurações e
// Energia (specs/09-sessao-energia.md).
export const ControlsRow = GObject.registerClass(
  class ControlsRow extends St.BoxLayout {
    private readonly brightnessPill: SliderRowActor;
    private readonly brightness: SystemBrightness;
    private readonly wifiTile: TileActor;
    private readonly btTile: TileActor;
    private readonly unsubscribeBrightness: () => void;
    private readonly unsubscribeWifi: () => void;
    private readonly unsubscribeBt: () => void;
    private readonly unsubscribeSession: () => void;
    private readonly unsubscribePower: () => void;

    constructor(system: IslandSystem, drag: DragHooks, options: ControlsRowOptions) {
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
      this.wifiTile = new Tile(wifiTileIconName, wifiRadio, () => options.onWifiTileClick());
      this.add_child(this.wifiTile);
      const bt = system.bluetooth;
      const btRadio: TileSource = {
        get on() {
          return bt.radioOn;
        },
        onChange: (callback) => bt.onChange(callback),
      };
      this.btTile = new Tile(btIconName, btRadio, () => options.onBtTileClick());
      this.add_child(this.btTile);
      this.add_child(
        new Tile(nightLightIconName, system.nightLight, () => system.nightLight.toggle()),
      );
      this.add_child(new Tile(dndIconName, system.dnd, () => system.dnd.toggle()));

      this.add_child(divider());
      this.unsubscribeSession = this.addSettingsButton(system, options);
      this.unsubscribePower = this.addPowerButton(options.power);

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
          this.unsubscribeSession();
          this.unsubscribePower();
        },
        this,
      );
    }

    private addSettingsButton(system: IslandSystem, options: ControlsRowOptions): () => void {
      const session = system.session;
      const button = new RoundButton(settingsIconName, () => options.onSettingsClick());
      this.add_child(button);
      button.visible = session.settingsAvailable;
      return session.onChange(() => (button.visible = session.settingsAvailable));
    }

    // Aberto: `powerOpenBg` / `neutral-100`.
    private addPowerButton(power: PowerToggle): () => void {
      const button = new RoundButton(
        powerIconName,
        () => power.toggle(),
        () =>
          power.open
            ? { bg: derivedColors.powerOpenBg, fg: colors.neutral100 }
            : ROUND_BUTTON_RESTING,
      );
      this.add_child(button);
      return power.onChange(() => button.refresh());
    }

    private syncBrightnessVisibility(): void {
      // "Some se não houver backlight controlável (o volume ocupa o espaço)".
      this.brightnessPill.visible = this.brightness.available;
    }
  },
);

export type ControlsRowActor = InstanceType<typeof ControlsRow>;
