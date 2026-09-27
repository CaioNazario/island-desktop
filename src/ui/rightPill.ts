import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { batteryDisplay, type BatteryTone } from '../core/battery.js';
import type { BatterySource } from '../system/battery.js';
import type { NotificationFeed } from '../system/notifications.js';
import { BarButton, type BarButtonActor } from './barButton.js';
import {
  batteryLevelIconName,
  caretIconName,
  notificationFallbackIconName,
  phosphor,
} from './icons.js';
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

// Ponto de não lido 7×7 `accent` com anel 2px `bg`, em `top: 5px; right: 8px`
// do botão 30×24. O anel é borda: 11×11 a partir de (13, 3). No St, `width`
// é a caixa de conteúdo e a borda soma por fora (st-theme-node.c, 50.0).
const UNREAD_DOT = { size: 7, ring: 2, x: 13, y: 3 };

// Sino (specs/02-barra.md, item 2): abre `stack`.
function bellButton(feed: NotificationFeed, onClick: () => void): BarButtonActor {
  // Sem `x_expand`/`y_expand`: o expand sobe pelo botão e ele estica na
  // pílula. Sem expand, o BinLayout (do `St.Bin` do botão e deste conteúdo)
  // centraliza no tamanho natural e respeita a posição fixa
  // (clutter-bin-layout.c, mutter 50.0); por isso o conteúdo tem o tamanho
  // do botão, senão o ponto fica espremido na largura do ícone.
  const content = new St.Widget({
    layout_manager: new Clutter.BinLayout(),
    style: 'width: 30px; height: 24px;',
  });
  content.add_child(
    new St.Icon({
      gicon: phosphor(notificationFallbackIconName),
      icon_size: 16,
      style: `color: ${colors.text};`,
    }),
  );
  const ringSize = UNREAD_DOT.size + 2 * UNREAD_DOT.ring;
  const dot = new St.Widget({
    style: `
      width: ${UNREAD_DOT.size}px;
      height: ${UNREAD_DOT.size}px;
      border-radius: ${ringSize / 2}px;
      background-color: ${colors.accent};
      border: ${UNREAD_DOT.ring}px solid ${colors.bg};
    `,
    x: UNREAD_DOT.x,
    y: UNREAD_DOT.y,
  });
  content.add_child(dot);
  const button = new BarButton(content, onClick);

  const sync = (): void => {
    dot.visible = feed.hasUnread;
  };
  sync();
  const unsubscribe = feed.onChange(sync);
  button.connectObject('destroy', () => unsubscribe(), button);
  return button;
}

// Pílula direita (specs/02-barra.md): os botões ficam à direita, com gap 2px;
// o espaço à esquerda é do grupo de hardware (spec 10).
export const RightPill = GObject.registerClass(
  class RightPill extends Pill {
    constructor(
      battery: BatterySource,
      feed: NotificationFeed,
      onOpenQuick: () => void,
      onOpenStack: () => void,
    ) {
      super();
      this.add_child(new St.Widget({ x_expand: true }));

      const buttons = new St.BoxLayout({
        style: 'spacing: 2px;',
        y_align: Clutter.ActorAlign.CENTER,
      });
      buttons.add_child(bellButton(feed, onOpenStack));
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
