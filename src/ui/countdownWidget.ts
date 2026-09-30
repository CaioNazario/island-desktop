import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { countdownView, msUntilMidnight } from '../core/countdown.js';
import { TopbarWidget, type TopbarWidgetActor } from './topbarWidget.js';
import { colors } from './tokens.js';

const NAME_KEY = 'countdown-name';
const DATE_KEY = 'countdown-date';

// Widget Contagem regressiva (specs/16-widgets.md `countdown`): ícone ·
// nome · dias até a data. Sem data, "Sem data" `neutral-400` e o clique abre
// as preferências na página Widgets. Recalcula à meia-noite e quando as
// chaves mudam.
export function countdownWidget(
  settings: Gio.Settings,
  openWidgetsPage: () => void,
): TopbarWidgetActor {
  const widget = new TopbarWidget(openWidgetsPage);
  let timerId = 0;

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
  const scheduleMidnight = (): void => {
    timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, msUntilMidnight(new Date()), () => {
      sync();
      scheduleMidnight();
      return GLib.SOURCE_REMOVE;
    });
  };
  sync();
  scheduleMidnight();

  settings.connectObject(`changed::${NAME_KEY}`, sync, `changed::${DATE_KEY}`, sync, widget);
  widget.connectObject('destroy', () => GLib.source_remove(timerId), widget);
  return widget;
}
