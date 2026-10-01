import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { countdownView } from '../core/countdown.js';
import { TopbarWidget, type TopbarWidgetActor } from './topbarWidget.js';
import { colors } from './tokens.js';

const NAME_KEY = 'countdown-name';
const DATE_KEY = 'countdown-date';
const DAY_CHECK_SECONDS = 60;

// Widget Contagem regressiva (specs/16-widgets.md `countdown`): ícone ·
// nome · dias até a data. Sem data, "Sem data" `neutral-400` e o clique abre
// as preferências na página Widgets. Recalcula na virada do dia e quando as
// chaves mudam.
export function countdownWidget(
  settings: Gio.Settings,
  openWidgetsPage: () => void,
): TopbarWidgetActor {
  const widget = new TopbarWidget(openWidgetsPage);

  const sync = (): void => {
    const view = countdownView(
      settings.get_string(NAME_KEY),
      settings.get_string(DATE_KEY),
      new Date(),
    );
    widget.clickable = view.missingDate;
    widget.display({
      icon: 'airplane-tilt',
      label: view.label,
      labelColor: view.missingDate ? colors.neutral400 : undefined,
      sub: view.sub,
    });
  };
  // Por comparação de data, não por timer até a meia-noite: o relógio
  // monotônico para na suspensão (como em system/calendarEvents.ts).
  let day = new Date().toDateString();
  sync();
  const timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, DAY_CHECK_SECONDS, () => {
    const today = new Date().toDateString();
    if (today !== day) {
      day = today;
      sync();
    }
    return GLib.SOURCE_CONTINUE;
  });

  settings.connectObject(`changed::${NAME_KEY}`, sync, `changed::${DATE_KEY}`, sync, widget);
  widget.connectObject('destroy', () => GLib.source_remove(timerId), widget);
  return widget;
}
