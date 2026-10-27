import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { WeatherSource } from '../system/weather.js';
import { colors } from './tokens.js';
import { WeatherItem } from './weatherItem.js';

const compactTextStyle = (): string => `
  color: ${colors.text};
  font-weight: 500;
  font-size: 13px;
  font-feature-settings: "tnum";
`;

function compactLabel(text = ''): St.Label {
  return new St.Label({
    text,
    style: compactTextStyle(),
    y_align: Clutter.ActorAlign.CENTER,
  });
}

/** Conteúdo do modo `compact` (specs/03-ilha.md); a ilha atualiza o `clockLabel`. */
export function compactContent(weather: WeatherSource): {
  actor: St.BoxLayout;
  clockLabel: St.Label;
} {
  const clockLabel = compactLabel();
  // `[clima] · [hora] · [dia]`: sem clima, o item e seu separador somem.
  const weatherItem = new WeatherItem(weather);
  const weatherSeparator = compactLabel(' · ');
  weatherItem.bind_property(
    'visible',
    weatherSeparator,
    'visible',
    GObject.BindingFlags.SYNC_CREATE,
  );
  const actor = new St.BoxLayout({
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER,
  });
  actor.add_child(weatherItem);
  actor.add_child(weatherSeparator);
  actor.add_child(clockLabel);
  return { actor, clockLabel };
}
