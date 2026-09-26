import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';

import { colors } from './tokens.js';

export interface PercentSource {
  readonly percent: number;
  setPercent(percent: number): void;
  onChange(callback: () => void): () => void;
}

export interface DragHooks {
  start(): void;
  end(): void;
}

export type SliderRowVariant = 'popup' | 'pill';

// Linha ícone + slider (+ valor no variant `popup`), usada pelos modos
// `volume`/`brightness` (`popup`, 320×50) e pela linha de controles de
// `quick`/`wifi`/`bt` (`pill`, specs/08-controles-rapidos.md). O ícone usa
// nomes simbólicos do sistema como substituto temporário do ícone Phosphor
// até a spec 01 ganhar um pipeline de fonte de ícones.
export const SliderRow = GObject.registerClass(
  class SliderRow extends St.BoxLayout {
    private readonly source: PercentSource;
    private readonly slider: InstanceType<typeof Slider>;
    private readonly valueLabel: St.Label | null;
    private readonly unsubscribe: () => void;
    private updatingFromSource = false;

    private readonly icon: St.Icon;
    private readonly iconName: () => string;

    constructor(
      iconName: () => string,
      thumbRadiusPx: number,
      source: PercentSource,
      drag: DragHooks,
      variant: SliderRowVariant = 'popup',
    ) {
      const isPill = variant === 'pill';
      super({
        style_class: isPill ? 'island-control-pill' : undefined,
        style: isPill
          ? `padding: 0 12px; spacing: 8px; height: 38px; border-radius: 19px; background-color: ${colors.neutral900};`
          : 'padding: 0 18px; spacing: 14px;',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
      });

      this.source = source;
      this.iconName = iconName;

      this.icon = new St.Icon({
        icon_size: isPill ? 16 : 18,
        style: `color: ${colors.neutral300};`,
      });
      this.add_child(this.icon);

      this.slider = new Slider(0);
      this.slider.x_expand = true;
      this.slider.style = `
        color: ${colors.neutral100};
        -slider-handle-radius: ${thumbRadiusPx}px;
        -barlevel-height: 4px;
        -barlevel-background-color: ${colors.neutral800};
        -barlevel-active-background-color: ${colors.accent};
      `;
      this.add_child(this.slider);

      if (isPill) {
        this.valueLabel = null;
      } else {
        this.valueLabel = new St.Label({
          style: `color: ${colors.neutral300}; font-size: 12px; width: 34px; text-align: right;`,
          y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.valueLabel);
      }

      this.slider.connectObject(
        'notify::value',
        () => this.onSliderChanged(),
        'drag-begin',
        () => drag.start(),
        'drag-end',
        () => drag.end(),
        this,
      );

      this.unsubscribe = source.onChange(() => this.syncFromSource());
      this.syncFromSource();

      this.connectObject('destroy', () => this.unsubscribe(), this);
    }

    private onSliderChanged(): void {
      if (this.updatingFromSource) return;
      this.source.setPercent(Math.round(this.slider.value * 100));
    }

    private syncFromSource(): void {
      const percent = this.source.percent;
      this.updatingFromSource = true;
      this.slider.value = percent / 100;
      this.updatingFromSource = false;
      if (this.valueLabel) this.valueLabel.text = `${percent}%`;
      this.icon.icon_name = this.iconName();
    }
  },
);

export type SliderRowActor = InstanceType<typeof SliderRow>;
