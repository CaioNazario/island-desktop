import { dayProgress } from '../core/dayProgress.js';
import { everyMinute } from './minuteTimer.js';
import { TopbarWidget, type TopbarWidgetActor } from './topbarWidget.js';

// Widget Progresso do dia (specs/16-widgets.md `progress`): ícone · "Dia" ·
// barra · sub `%`, atualizado na virada de cada minuto. Sem clique.
export function progressWidget(): TopbarWidgetActor {
  const widget = new TopbarWidget(null);
  everyMinute(widget, () => {
    const percent = dayProgress(new Date());
    widget.display({ icon: 'hourglass-medium', label: 'Dia', percent, sub: `${percent}%` });
  });
  return widget;
}
