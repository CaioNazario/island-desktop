import GLib from 'gi://GLib';
import type { EventSourceBase } from 'resource:///org/gnome/shell/ui/calendar.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { CalendarEvent } from '../core/calendar.js';
import { DayTracker } from '../core/dayTracker.js';

export interface CalendarEventsSource {
  /** Eventos que tocam hoje, crus: filtro, ordem e formato são do core. */
  readonly today: readonly CalendarEvent[];
  /** Eventos mudaram no servidor ou o dia virou. */
  onChange(callback: () => void): () => void;
}

// O `gnome-shell-calendar-server` (cliente do Evolution Data Server, que
// sincroniza as contas online) guarda um intervalo só para todos os clientes:
// um `DBusEventSource` nosso sobrescreveria o do menu de data. Usamos a
// instância do próprio `DateMenuButton` (js/ui/dateMenu.js, Shell 50.4), que
// ele recria a cada `Main.sessionMode` `updated`.
function shellEventSource(): EventSourceBase | null {
  const dateMenu = Main.panel.statusArea.dateMenu as unknown as {
    _eventSource?: EventSourceBase;
  };
  return dateMenu?._eventSource ?? null;
}

const DAY_CHECK_SECONDS = 60;

// Eventos de hoje (specs/06-calendario.md, "Eventos").
export class SystemCalendarEvents implements CalendarEventsSource {
  private source: EventSourceBase | null = null;
  private readonly dayTracker = new DayTracker(new Date());
  private dayTimerId: number | null;
  private readonly listeners = new Set<() => void>();

  constructor() {
    // Conectado depois do `DateMenuButton`: quando rodamos, a fonte nova já existe.
    Main.sessionMode.connectObject('updated', () => this.attach(), this);
    this.attach();
    // Por comparação de data, não por timer até a meia-noite: o relógio
    // monotônico para na suspensão.
    this.dayTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, DAY_CHECK_SECONDS, () => {
      if (this.dayTracker.advance(new Date())) {
        this.requestRange();
        this.notify();
      }
      return GLib.SOURCE_CONTINUE;
    });
  }

  get today(): readonly CalendarEvent[] {
    if (!this.source) return [];
    const day = this.dayTracker.day;
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    return this.source.getEvents(day, end).map((event) => ({
      id: event.id,
      summary: event.summary,
      start: event.date,
      end: event.end,
    }));
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    if (this.dayTimerId !== null) {
      GLib.Source.remove(this.dayTimerId);
      this.dayTimerId = null;
    }
    Main.sessionMode.disconnectObject(this);
    this.source?.disconnectObject(this);
    this.source = null;
    this.listeners.clear();
  }

  private attach(): void {
    const source = shellEventSource();
    if (source === this.source) return;
    this.source?.disconnectObject(this);
    this.source = source;
    source?.connectObject('changed', () => this.notify(), this);
    this.requestRange();
    this.notify();
  }

  // O calendário do menu de data só pede o intervalo ao abrir; com o painel
  // escondido, o mês dele fica velho. Pedimos um intervalo que contém a
  // janela de 6 semanas que ele pede para o mês de hoje (começa até 13 dias
  // antes do dia 1 e termina até 36 dias depois), para o menu nativo seguir
  // certo quando a extensão é desativada.
  private requestRange(): void {
    const day = this.dayTracker.day;
    const year = day.getFullYear();
    const month = day.getMonth();
    this.source?.requestRange(new Date(year, month, 1 - 14), new Date(year, month + 1, 14));
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }
}
