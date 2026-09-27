import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { Switch } from './switch.js';
import { colors } from './tokens.js';

// Peças comuns às seções de `wifi` e `bt` (specs/08-controles-rapidos.md):
// divisor, cabeçalho com switch do rádio, lista rolável, área de rádio
// desligado e linha clicável.

/** O que o cabeçalho precisa de um serviço de rádio (`SystemWifi`, e o de Bluetooth). */
export interface Radio {
  readonly radioOn: boolean;
  setRadio(on: boolean): void;
  onChange(callback: () => void): () => void;
}

export function vertical(params: Partial<St.BoxLayout.ConstructorProps> = {}): St.BoxLayout {
  return new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, ...params });
}

export function sectionDivider(): St.Widget {
  return new St.Widget({
    style: `height: 1px; margin-bottom: 8px; background-color: ${colors.neutral800};`,
  });
}

export function radioHeader(options: { icon: string; title: string; radio: Radio }): {
  header: St.BoxLayout;
  statusLabel: St.Label;
} {
  const header = new St.BoxLayout({
    style: 'height: 26px; padding: 0 6px; margin-bottom: 4px; spacing: 8px;',
  });
  header.add_child(
    new St.Icon({
      icon_name: options.icon,
      icon_size: 14,
      style: `color: ${colors.neutral300};`,
      y_align: Clutter.ActorAlign.CENTER,
    }),
  );
  header.add_child(
    new St.Label({
      text: options.title,
      style: `font-size: 13px; font-weight: 500; color: ${colors.text};`,
      y_align: Clutter.ActorAlign.CENTER,
    }),
  );
  const statusLabel = new St.Label({
    style: `font-size: 11px; color: ${colors.neutral500};`,
    x_expand: true,
    x_align: Clutter.ActorAlign.END,
    y_align: Clutter.ActorAlign.CENTER,
  });
  header.add_child(statusLabel);
  const { radio } = options;
  const source = {
    get on() {
      return radio.radioOn;
    },
    onChange: (callback: () => void) => radio.onChange(callback),
  };
  header.add_child(new Switch(source, () => radio.setRadio(!radio.radioOn)));
  return { header, statusLabel };
}

export function scrollList(): { scroll: St.ScrollView; list: St.BoxLayout } {
  const list = vertical();
  const scroll = new St.ScrollView({
    hscrollbar_policy: St.PolicyType.NEVER,
    vscrollbar_policy: St.PolicyType.AUTOMATIC,
    y_expand: true,
  });
  scroll.set_child(list);
  return { scroll, list };
}

export function radioOffArea(options: {
  icon: string;
  text: string;
  height: number;
}): St.BoxLayout {
  const area = vertical({
    style: `height: ${options.height}px; spacing: 8px; color: ${colors.neutral500};`,
    y_align: Clutter.ActorAlign.CENTER,
  });
  area.add_child(
    new St.Icon({
      icon_name: options.icon,
      icon_size: 22,
      x_align: Clutter.ActorAlign.CENTER,
      y_expand: true,
      y_align: Clutter.ActorAlign.END,
    }),
  );
  area.add_child(
    new St.Label({
      text: options.text,
      style: 'font-size: 12.5px;',
      x_align: Clutter.ActorAlign.CENTER,
      y_expand: true,
      y_align: Clutter.ActorAlign.START,
    }),
  );
  return area;
}

/** Linha da lista: fundo `accent-900` quando ativa, hover `neutral-900` nas outras. */
export function listRow(options: {
  content: St.Widget;
  active: boolean;
  onClick: () => void;
}): St.Button {
  const baseBg = options.active ? colors.accent900 : 'transparent';
  const row = new St.Button({ child: options.content, track_hover: true, x_expand: true });
  const syncStyle = (): void => {
    const bg = row.hover && !options.active ? colors.neutral900 : baseBg;
    row.style = `border-radius: 10px; background-color: ${bg};`;
  };
  syncStyle();
  row.connectObject('notify::hover', syncStyle, 'clicked', () => options.onClick(), row);
  return row;
}
