import GLib from 'gi://GLib';

import { dayProgress, msUntilNextMinute } from '../core/dayProgress.js';
import { TopbarWidget, type TopbarWidgetActor } from './topbarWidget.js';

// Widget Progresso do dia (specs/16-widgets.md `progress`): ícone · "Dia" ·
// barra · sub `%`, atualizado na virada de cada minuto. Sem clique.
export function progressWidget(): TopbarWidgetActor {
  const widget = new TopbarWidget(null);
  let timerId = 0;

  const tick = (): void => {
    const now = new Date();
    const percent = dayProgress(now);
    widget.display({ icon: 'hourglass-medium', label: 'Dia', percent, sub: `${percent}%` });
    timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, msUntilNextMinute(now), () => {
      tick();
      return GLib.SOURCE_REMOVE;
    });
  };
  tick();

  widget.connectObject('destroy', () => GLib.source_remove(timerId), widget);
  return widget;
}
