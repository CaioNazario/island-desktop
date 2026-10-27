export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Virada do dia por comparação de data, checada de tempos em tempos. Não use
 * um timer até a meia-noite: o relógio monotônico do GLib para na suspensão
 * e o timer dispararia atrasado.
 */
export class DayTracker {
  private _day: Date;

  constructor(now: Date) {
    this._day = startOfDay(now);
  }

  get day(): Date {
    return this._day;
  }

  /** `true` uma vez por virada, para qualquer lado. */
  advance(now: Date): boolean {
    const today = startOfDay(now);
    if (today.getTime() === this._day.getTime()) return false;
    this._day = today;
    return true;
  }
}
