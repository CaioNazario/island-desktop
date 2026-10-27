import { describe, expect, it } from 'vitest';

import { formatColor, mixWithTransparent, oklchToHex, parseColor, withAlpha } from './color.js';

describe('parseColor / formatColor', () => {
  it('lê hex e rgba e devolve a mesma forma', () => {
    expect(parseColor('#161826')).toEqual({ r: 22, g: 24, b: 38, a: 1 });
    expect(parseColor('rgba(22, 24, 38, 0.5)')).toEqual({ r: 22, g: 24, b: 38, a: 0.5 });
    expect(formatColor({ r: 22, g: 24, b: 38, a: 1 })).toBe('#161826');
    expect(formatColor({ r: 22, g: 24, b: 38, a: 0.5 })).toBe('rgba(22, 24, 38, 0.5)');
  });

  it('recusa formato desconhecido citando o valor', () => {
    expect(() => parseColor('oklch(0.5 0.1 20)')).toThrow('"oklch(0.5 0.1 20)"');
  });
});

describe('withAlpha / mixWithTransparent', () => {
  it('multiplica o alfa que a cor já tem', () => {
    expect(withAlpha('#f8f9fc', 0.94)).toBe('rgba(248, 249, 252, 0.94)');
    expect(withAlpha('rgba(243, 245, 254, 0.5)', 0.5)).toBe('rgba(243, 245, 254, 0.25)');
  });

  it('mixWithTransparent equivale ao color-mix(srgb, cor N%, transparent)', () => {
    expect(mixWithTransparent('#161826', 52)).toBe('rgba(22, 24, 38, 0.52)');
  });
});

describe('oklchToHex', () => {
  it('cobre os extremos de luminosidade', () => {
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff');
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
  });

  it('gera o passo 5 do realce padrão perto do accent-500 do Nocturne', () => {
    const { r, g, b } = parseColor(oklchToHex(0.67, 0.125, 289));
    const nocturne = parseColor('#968ae0');
    expect(Math.abs(r - nocturne.r)).toBeLessThan(6);
    expect(Math.abs(g - nocturne.g)).toBeLessThan(6);
    expect(Math.abs(b - nocturne.b)).toBeLessThan(6);
  });

  it('prende no gamut em vez de estourar o canal', () => {
    expect(oklchToHex(0.9, 0.4, 150)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
