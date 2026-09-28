import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { formatTemperature } from '../core/weather.js';
import type { WeatherSource } from '../system/weather.js';
import { phosphor } from './icons.js';
import { colors } from './tokens.js';

// `[clima]` da ilha compacta (specs/03-ilha.md "Modo compacto"): ícone
// `ph-fill` 15px `accent-300` + temperatura `neutral-300`, gap 4px. Sem
// leitura válida (spec 07), fica invisível.
export const WeatherItem = GObject.registerClass(
  class WeatherItem extends St.BoxLayout {
    private readonly weather: WeatherSource;
    private readonly icon: St.Icon;
    private readonly label: St.Label;

    constructor(weather: WeatherSource) {
      super({ style: 'spacing: 4px;', y_align: Clutter.ActorAlign.CENTER });
      this.weather = weather;
      this.icon = new St.Icon({
        icon_size: 15,
        style: `color: ${colors.accent300};`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.label = new St.Label({
        style: `
          color: ${colors.neutral300};
          font-weight: 500;
          font-size: 13px;
          font-feature-settings: "tnum";
        `,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.add_child(this.icon);
      this.add_child(this.label);

      const unsubscribe = weather.onChange(() => this.sync());
      this.connect('destroy', unsubscribe);
      this.sync();
    }

    private sync(): void {
      const reading = this.weather.reading;
      this.visible = reading !== null;
      if (!reading) return;
      this.icon.gicon = phosphor(reading.glyph);
      this.label.text = formatTemperature(reading.celsius);
    }
  },
);
