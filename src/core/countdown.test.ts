import { describe, expect, it } from 'vitest';
import { formatDate, parseIsoDate, toIsoDate } from './countdown.js';

describe('parseIsoDate', () => {
  it('lê AAAA-MM-DD', () => {
    expect(parseIsoDate('2026-12-24')).toEqual({ year: 2026, month: 12, day: 24 });
  });

  it('recusa vazio, formato errado e dia inexistente', () => {
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate('24/12/2026')).toBeNull();
    expect(parseIsoDate('2026-2-3')).toBeNull();
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
  });

  it('aceita 29 de fevereiro só em ano bissexto', () => {
    expect(parseIsoDate('2028-02-29')).not.toBeNull();
    expect(parseIsoDate('2027-02-29')).toBeNull();
  });
});

describe('toIsoDate e formatDate', () => {
  it('completam com zero à esquerda', () => {
    const date = { year: 2027, month: 1, day: 5 };
    expect(toIsoDate(date)).toBe('2027-01-05');
    expect(formatDate(date)).toBe('05/01/2027');
  });
});
