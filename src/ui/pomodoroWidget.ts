import GLib from 'gi://GLib';

import { elapsedFraction, formatRemaining, phaseLabel, remainingAt } from '../core/pomodoro.js';
import type { PomodoroSource } from '../system/pomodoro.js';
import { TopbarWidget, type TopbarWidgetActor } from './topbarWidget.js';

// Widget Pomodoro (specs/16-widgets.md `pomodoro`): anel · `mm:ss` · fase.
// O clique alterna rodando/pausado. O relógio de 1s só roda com o widget na
// tela e o pomodoro rodando.
export function pomodoroWidget(pomodoro: PomodoroSource): TopbarWidgetActor {
  const widget = new TopbarWidget(() => pomodoro.toggle());
  let tickId: number | null = null;

  const render = (): void => {
    const { state } = pomodoro;
    const now = Date.now();
    widget.display({
      ring: elapsedFraction(state, now),
      label: formatRemaining(remainingAt(state, now)),
      sub: phaseLabel(state),
    });
  };
  const stopTick = (): void => {
    if (tickId !== null) GLib.Source.remove(tickId);
    tickId = null;
  };
  const sync = (): void => {
    render();
    const ticking = widget.mapped && pomodoro.state.endsAt !== null;
    if (!ticking) stopTick();
    else if (tickId === null) {
      tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        render();
        return GLib.SOURCE_CONTINUE;
      });
    }
  };

  sync();
  const unsubscribe = pomodoro.onChange(sync);
  widget.connectObject(
    'notify::mapped',
    sync,
    'destroy',
    () => {
      unsubscribe();
      stopTick();
    },
    widget,
  );
  return widget;
}
