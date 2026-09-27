import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { batteryDisplay, type BatteryTone } from '../core/battery.js';
import type { BatterySource } from '../system/battery.js';
import { BarButton, type BarButtonActor } from './barButton.js';
import { batteryLevelIconName, caretIconName, phosphor } from './icons.js';
import { Pill } from './pill.js';
import { colors, derivedColors } from './tokens.js';

const BATTERY_ICON_COLOR: Record<BatteryTone, string> = {
  good: derivedColors.batteryGreen,
  normal: colors.neutral300,
  low: derivedColors.alertRed,
};

// Bateria (specs/11-bateria.md): ícone 17px + `78%` 13px/500, gap 6px,
// padding 0 10px. Sem bateria o botão some.
function batteryButton(battery: BatterySource, onClick: () => void): BarButtonActor {
  const icon = new St.Icon({ icon_size: 17, y_align: Clutter.ActorAlign.CENTER });
  const label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
  const content = new St.BoxLayout({ style: 'spacing: 6px;' });
  content.add_child(icon);
  content.add_child(label);
  const button = new BarButton(content, onClick, 'padding: 0 10px;');

  const sync = (): void => {
    button.visible = battery.available;
    if (!button.visible) return;
    const display = batteryDisplay(battery.percentage, battery.charging);
    icon.gicon = phosphor(batteryLevelIconName(display.icon));
    icon.style = `color: ${BATTERY_ICON_COLOR[display.tone]};`;
    label.text = display.label;
    const textColor = display.tone === 'low' ? derivedColors.alertRed : colors.text;
    label.style = `color: ${textColor}; font-size: 13px; font-weight: 500;`;
  };
  sync();
  const unsubscribe = battery.onChange(sync);
  button.connectObject('destroy', () => unsubscribe(), button);
  return button;
}

// Pílula direita (specs/02-barra.md): os botões ficam à direita, com gap 2px;
// o espaço à esquerda é do grupo de hardware (spec 10).
export const RightPill = GObject.registerClass(
  class RightPill extends Pill {
    constructor(battery: BatterySource, onOpenQuick: () => void) {
      super();
      this.add_child(new St.Widget({ x_expand: true }));

      const buttons = new St.BoxLayout({
        style: 'spacing: 2px;',
        y_align: Clutter.ActorAlign.CENTER,
      });
      buttons.add_child(batteryButton(battery, onOpenQuick));
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
