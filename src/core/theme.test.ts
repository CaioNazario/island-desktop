import { describe, expect, it } from 'vitest';

import { oklchToHex } from './color.js';
import { buildTheme, parseThemeId, THEME_IDS, THEME_LABELS } from './theme.js';

describe('THEME_IDS', () => {
  it('lista os temas do design, com rótulo em pt-BR', () => {
    expect(THEME_IDS).toEqual(['nocturne', 'high-contrast']);
    expect(THEME_LABELS).toEqual({
      nocturne: 'Nocturne',
      'high-contrast': 'Alto contraste',
    });
  });
});

describe('parseThemeId', () => {
  it('aceita um id conhecido e cai no Nocturne com qualquer outro valor', () => {
    expect(parseThemeId('high-contrast')).toBe('high-contrast');
    expect(parseThemeId('Alto contraste')).toBe('nocturne');
    expect(parseThemeId('')).toBe('nocturne');
  });
});

describe('buildTheme nocturne', () => {
  const { colors, surfaces, derived } = buildTheme('nocturne');

  it('mantém os tokens de design/tokens.css', () => {
    expect(colors.bg).toBe('#161826');
    expect(colors.surface).toBe('#232532');
    expect(colors.accent).toBe('#9184d9');
    expect(colors.accent500).toBe('#968ae0');
    expect(colors.neutral800).toBe('#3f424d');
  });

  it('pinta ilha e pílulas com o fundo opaco', () => {
    expect(surfaces).toEqual({
      island: '#161826',
      lane: '#161826',
      panel: 'rgba(22, 24, 38, 0.94)',
    });
  });

  it('deriva divisores e brilhos da paleta', () => {
    expect(derived.dividerFadeEnd).toBe('rgba(63, 66, 77, 0)');
    expect(derived.divider).toBe('rgba(233, 233, 237, 0.16)');
    expect(derived.accentGlow).toBe('rgba(145, 132, 217, 0.22)');
    expect(derived.volumeThumbGlow).toBe('rgba(145, 132, 217, 0.6)');
  });
});

describe('buildTheme high-contrast', () => {
  const { colors, surfaces } = buildTheme('high-contrast');
  const boosted = (lightness: number, chroma: number): string =>
    oklchToHex(lightness, chroma * 1.25, 289);

  it('troca fundo, texto e neutros e deixa as superfícies opacas', () => {
    expect(colors.bg).toBe('#0b0c12');
    expect(colors.text).toBe('#f7f8fc');
    expect(colors.neutral800).toBe('#6a7089');
    expect(surfaces).toEqual({ island: '#0b0c12', lane: '#0b0c12', panel: '#0b0c12' });
  });

  it('realça com chroma ×1,25 e o acento no passo 4', () => {
    expect(colors.accent100).toBe(boosted(0.97, 0.02));
    expect(colors.accent400).toBe(boosted(0.78, 0.11));
    expect(colors.accent).toBe(colors.accent400);
  });

  it('recua os passos 5 a 7 dois degraus e devolve 8 e 9 ao chroma normal', () => {
    expect(colors.accent500).toBe(boosted(0.87, 0.07));
    expect(colors.accent600).toBe(boosted(0.78, 0.11));
    expect(colors.accent700).toBe(boosted(0.67, 0.125));
    expect(colors.accent800).toBe(oklchToHex(0.37, 0.075, 289));
    expect(colors.accent900).toBe(oklchToHex(0.28, 0.045, 289));
  });

  it('deriva divisores do texto e do neutral-800 do tema', () => {
    const { derived } = buildTheme('high-contrast');
    expect(derived.divider).toBe('rgba(247, 248, 252, 0.16)');
    expect(derived.dividerFadeEnd).toBe('rgba(106, 112, 137, 0)');
  });
});
