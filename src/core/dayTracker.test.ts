import { describe, expect, it } from 'vitest';
import { DayTracker, startOfDay } from './dayTracker.js';

describe('startOfDay', () => {
  it('zera a hora no fuso local', () => {
    expect(startOfDay(new Date(2026, 9, 2, 23, 59, 59, 999))).toEqual(new Date(2026, 9, 2));
  });
});

describe('DayTracker', () => {
  it('começa no dia de quem cria', () => {
    expect(new DayTracker(new Date(2026, 9, 2, 15, 30)).day).toEqual(new Date(2026, 9, 2));
  });

  it('no mesmo dia não vira', () => {
    const tracker = new DayTracker(new Date(2026, 9, 2, 0, 0));
    expect(tracker.advance(new Date(2026, 9, 2, 23, 59))).toBe(false);
    expect(tracker.day).toEqual(new Date(2026, 9, 2));
  });

  it('vira uma vez só no dia seguinte', () => {
    const tracker = new DayTracker(new Date(2026, 9, 2, 23, 59));
    expect(tracker.advance(new Date(2026, 9, 3, 0, 0))).toBe(true);
    expect(tracker.advance(new Date(2026, 9, 3, 0, 1))).toBe(false);
    expect(tracker.day).toEqual(new Date(2026, 9, 3));
  });

  it('vira depois de dias sem checar, como numa suspensão longa', () => {
    const tracker = new DayTracker(new Date(2026, 9, 2, 22, 0));
    expect(tracker.advance(new Date(2026, 9, 5, 8, 0))).toBe(true);
    expect(tracker.day).toEqual(new Date(2026, 9, 5));
  });

  it('vira quando o relógio volta para o dia anterior', () => {
    const tracker = new DayTracker(new Date(2026, 9, 2, 0, 5));
    expect(tracker.advance(new Date(2026, 9, 1, 23, 55))).toBe(true);
    expect(tracker.day).toEqual(new Date(2026, 9, 1));
  });
});
