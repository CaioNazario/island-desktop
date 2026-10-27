// Temas do design v4 (`THEMES` em "Desktop Island v4.dc.html"): Nocturne e
// Alto contraste. specs/19-temas.md é a fonte de verdade. Valores em hex/rgba porque o St não entende oklch() nem
// color-mix() (specs/01-design-tokens.md).

import { mixWithTransparent, oklchToHex, withAlpha } from './color.js';

export const THEME_IDS = ['nocturne', 'high-contrast'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_LABELS: Readonly<Record<ThemeId, string>> = {
  nocturne: 'Nocturne',
  'high-contrast': 'Alto contraste',
};

export const DEFAULT_THEME: ThemeId = 'nocturne';

export function parseThemeId(value: string): ThemeId {
  return (THEME_IDS as readonly string[]).includes(value) ? (value as ThemeId) : DEFAULT_THEME;
}

/** Realce padrão do design (Blurple). */
export const DEFAULT_ACCENT_HUE = 289;

export interface ThemeColors {
  bg: string;
  surface: string;
  text: string;
  accent: string;
  neutral100: string;
  neutral200: string;
  neutral300: string;
  neutral400: string;
  neutral500: string;
  neutral600: string;
  neutral700: string;
  neutral800: string;
  neutral900: string;
  accent100: string;
  accent200: string;
  accent300: string;
  accent400: string;
  accent500: string;
  accent600: string;
  accent700: string;
  accent800: string;
  accent900: string;
}

/** Fundos da ilha (e do peek), das pílulas laterais e do painel do editor. */
export interface ThemeSurfaces {
  island: string;
  lane: string;
  panel: string;
}

/** Cores que acompanham a paleta do tema (a de exceção, como o vermelho de alerta, não muda). */
export interface ThemeDerived {
  divider: string;
  dividerFadeEnd: string;
  accentGlow: string;
  volumeThumbGlow: string;
  btnPrimaryHover: string;
  btnPrimaryActive: string;
  btnGhostHover: string;
  btnGhostActive: string;
}

export interface Theme {
  colors: ThemeColors;
  surfaces: ThemeSurfaces;
  derived: ThemeDerived;
}

// design/tokens.css (:root ~L256).
const NOCTURNE: ThemeColors = {
  bg: '#161826',
  surface: '#232532',
  text: '#e9e9ed',
  accent: '#9184d9',

  neutral100: '#f3f5fe',
  neutral200: '#e4e7f5',
  neutral300: '#cfd3e5',
  neutral400: '#b2b6ca',
  neutral500: '#9397ab',
  neutral600: '#75798c',
  neutral700: '#595d6c',
  neutral800: '#3f424d',
  neutral900: '#292b31',

  accent100: '#f5f4ff',
  accent200: '#e7e5fe',
  accent300: '#d2cefd',
  accent400: '#b5abfc',
  accent500: '#968ae0',
  accent600: '#796cbf',
  accent700: '#5d5294',
  accent800: '#423a6a',
  accent900: '#2b2741',
};

const NEUTRAL_KEYS = [
  'neutral100',
  'neutral200',
  'neutral300',
  'neutral400',
  'neutral500',
  'neutral600',
  'neutral700',
  'neutral800',
  'neutral900',
] as const;

const ACCENT_KEYS = [
  'accent100',
  'accent200',
  'accent300',
  'accent400',
  'accent500',
  'accent600',
  'accent700',
  'accent800',
  'accent900',
] as const;

function neutrals(values: readonly string[]): Partial<ThemeColors> {
  return Object.fromEntries(NEUTRAL_KEYS.map((key, i) => [key, values[i]]));
}

// `AC_L` / `AC_C` / `acRamp` do design: escala de 9 passos em oklch.
const RAMP_LIGHTNESS = [0.97, 0.93, 0.87, 0.78, 0.67, 0.57, 0.47, 0.37, 0.28];
const RAMP_CHROMA = [0.02, 0.04, 0.07, 0.11, 0.125, 0.12, 0.1, 0.075, 0.045];

function accentRamp(hue: number, chromaScale: number): string[] {
  return RAMP_LIGHTNESS.map((l, i) => oklchToHex(l, RAMP_CHROMA[i]! * chromaScale, hue));
}

function withRamp(ramp: readonly string[], accentStep: number): Partial<ThemeColors> {
  return {
    ...Object.fromEntries(ACCENT_KEYS.map((key, i) => [key, ramp[i]])),
    accent: ramp[accentStep],
  };
}

// Alto contraste: chroma ×1,25, passos 5–7 recuam dois degraus (mínimo o 3º),
// 8 e 9 voltam ao chroma normal; o acento é o passo 4.
function contrastRamp(accentHue: number): Partial<ThemeColors> {
  const boosted = accentRamp(accentHue, 1.25);
  const normal = accentRamp(accentHue, 1);
  const ramp = boosted.map((color, i) => {
    if (i >= 7) return normal[i]!;
    return i >= 4 ? boosted[Math.max(2, i - 2)]! : color;
  });
  return withRamp(ramp, 3);
}

function solidSurfaces(color: string): ThemeSurfaces {
  return { island: color, lane: color, panel: color };
}

function derivedFor(colors: ThemeColors): ThemeDerived {
  return {
    divider: withAlpha(colors.text, 0.16),
    dividerFadeEnd: withAlpha(colors.neutral800, 0),
    // Brilho da pílula-alvo na edição (specs/17-editor-ambientes.md).
    accentGlow: withAlpha(colors.accent, 0.22),
    volumeThumbGlow: withAlpha(colors.accent, 0.6),
    btnPrimaryHover: withAlpha(colors.accent, 0.12),
    btnPrimaryActive: withAlpha(colors.accent, 0.22),
    btnGhostHover: withAlpha(colors.accent, 0.1),
    btnGhostActive: withAlpha(colors.accent, 0.18),
  };
}

function assemble(colors: ThemeColors, surfaces: ThemeSurfaces): Theme {
  return { colors, surfaces, derived: derivedFor(colors) };
}

const CONTRAST_NEUTRALS = [
  '#f7f8fc',
  '#eef0f7',
  '#e3e6f0',
  '#d3d7e5',
  '#bcc1d4',
  '#9aa0b8',
  '#7c829c',
  '#6a7089',
  '#262938',
];

type ThemeBuilder = (accentHue: number) => Theme;

const nocturne: ThemeBuilder = () =>
  assemble(NOCTURNE, {
    island: NOCTURNE.bg,
    lane: NOCTURNE.bg,
    panel: mixWithTransparent(NOCTURNE.bg, 94),
  });

const highContrast: ThemeBuilder = (accentHue) =>
  assemble(
    {
      ...NOCTURNE,
      bg: '#0b0c12',
      surface: '#14161f',
      text: '#f7f8fc',
      ...neutrals(CONTRAST_NEUTRALS),
      ...contrastRamp(accentHue),
    },
    solidSurfaces('#0b0c12'),
  );

const BUILDERS: Readonly<Record<ThemeId, ThemeBuilder>> = {
  nocturne,
  'high-contrast': highContrast,
};

export function buildTheme(id: ThemeId, accentHue: number = DEFAULT_ACCENT_HUE): Theme {
  return BUILDERS[id](accentHue);
}
