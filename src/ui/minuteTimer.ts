import type Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { msUntilNextMinute } from '../core/dayProgress.js';

/** Chama `tick` agora e na virada de cada minuto, até `owner` ser destruído. */
export function everyMinute(owner: Clutter.Actor, tick: () => void): void {
  let timerId = 0;
  const run = (): void => {
    tick();
    timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, msUntilNextMinute(new Date()), () => {
      run();
      return GLib.SOURCE_REMOVE;
    });
  };
  run();
  owner.connectObject('destroy', () => GLib.source_remove(timerId), owner);
}
