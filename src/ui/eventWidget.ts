import { nextEvent } from '../core/calendar.js';
import type { CalendarEventsSource } from '../system/calendarEvents.js';
import { everyMinute } from './minuteTimer.js';
import { TopbarWidget, type TopbarWidgetActor } from './topbarWidget.js';

const LABEL_MAX = 130;

// Widget Próximo evento (specs/16-widgets.md `event`): ícone · nome · quando.
// Atualiza a cada minuto e quando os eventos mudam; o clique abre `calendar`.
export function eventWidget(
  calendar: CalendarEventsSource,
  openCalendar: () => void,
): TopbarWidgetActor {
  const widget = new TopbarWidget(openCalendar, LABEL_MAX);
  const sync = (): void => {
    const view = nextEvent(calendar.today, new Date());
    widget.display({ icon: 'calendar-blank', label: view.label, sub: view.sub });
  };
  everyMinute(widget, sync);
  const unsubscribe = calendar.onChange(sync);
  widget.connectObject('destroy', () => unsubscribe(), widget);
  return widget;
}
