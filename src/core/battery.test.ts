import { describe, expect, it } from 'vitest';
import { batteryDisplay } from './battery.js';

describe('batteryDisplay', () => {
  it.each([
    [100, 'full'],
    [95, 'full'],
    [94, 'high'],
    [60, 'high'],
    [59, 'medium'],
    [21, 'medium'],
    [20, 'low'],
    [9, 'low'],
    [8, 'warning'],
    [0, 'warning'],
  ] as const)('shows the %i%% level as %s', (percent, icon) => {
    expect(batteryDisplay(percent, false).icon).toBe(icon);
  });

  it.each([
    [100, 'good'],
    [80, 'good'],
    [79, 'normal'],
    [21, 'normal'],
    [20, 'low'],
    [0, 'low'],
  ] as const)('colors the %i%% level as %s', (percent, tone) => {
    expect(batteryDisplay(percent, false).tone).toBe(tone);
  });

  it('shows the charging icon at any level', () => {
    for (const percent of [100, 94, 50, 20, 8, 0]) {
      expect(batteryDisplay(percent, true).icon).toBe('charging');
    }
  });

  it('keeps the level colors while charging', () => {
    expect(batteryDisplay(85, true).tone).toBe('good');
    expect(batteryDisplay(50, true).tone).toBe('normal');
    expect(batteryDisplay(15, true).tone).toBe('low');
  });

  it('rounds the UPower percentage before applying the thresholds', () => {
    expect(batteryDisplay(94.6, false)).toEqual({ icon: 'full', tone: 'good', label: '95%' });
    expect(batteryDisplay(20.4, false)).toEqual({ icon: 'low', tone: 'low', label: '20%' });
  });

  it('clamps out-of-range percentages', () => {
    expect(batteryDisplay(104, false).label).toBe('100%');
    expect(batteryDisplay(-3, false).label).toBe('0%');
  });
});
