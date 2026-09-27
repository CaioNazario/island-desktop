// Grade do calendário (specs/06-calendario.md, "Grade"): semana começando na
// segunda, mês completo em semanas inteiras.

export const WEEKDAY_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export type CalendarView = 'week' | 'month';
/** `today` vale mesmo fora do mês, como no design (`isToday` antes de `inMonth`). */
export type DayKind = 'today' | 'in-month' | 'outside';

export interface CalendarDay {
  day: number;
  kind: DayKind;
}

export interface MonthGrid {
  /** `Setembro 2026`: capitalizado, sem "de". */
  title: string;
  weeks: CalendarDay[][];
  /** Linha mostrada em Semana: a de hoje no mês atual, a primeira nos outros. */
  weekIndex: number;
}

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Mês a `offset` meses do de `today` (0 = atual). */
export function monthGrid(today: Date, offset: number): MonthGrid {
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((lead + daysInMonth) / 7) * 7;

  const cells: CalendarDay[] = [];
  for (let i = 0; i < cellCount; i++) {
    const date = new Date(year, month, i - lead + 1);
    const kind: DayKind = sameDate(date, today)
      ? 'today'
      : date.getMonth() === month
        ? 'in-month'
        : 'outside';
    cells.push({ day: date.getDate(), kind });
  }
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const todayWeek = weeks.findIndex((week) => week.some((d) => d.kind === 'today'));
  return {
    title: `${MONTHS[month]} ${year}`,
    weeks,
    weekIndex: offset === 0 ? Math.max(0, todayWeek) : 0,
  };
}

export function visibleWeeks(grid: MonthGrid, view: CalendarView): CalendarDay[][] {
  return view === 'month' ? grid.weeks : grid.weeks.slice(grid.weekIndex, grid.weekIndex + 1);
}
