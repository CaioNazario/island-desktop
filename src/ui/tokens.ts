// Fonte: design/tokens.css (:root ~L256) e cores literais de design/logic.js.
// specs/01-design-tokens.md documenta a origem de cada valor.

export const colors = {
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
} as const;

// oklch()/color-mix() convertidos para hex/rgba equivalentes (St não entende as funções CSS4).
export const derivedColors = {
  alertRed: '#f75d59', // IA ≥90%, TEMP ≥70°
  alertText: '#fd736d', // texto de alerta (IA ≥90%, erro de senha)
  batteryRed: '#c62f2f', // bateria ≤20%, sólido
  batteryGreen: '#2e9e4f', // bateria ≥90%, sólido
  batteryInk: '#000000', // borda e número da bateria
  powerOpenBg: '#932b2a', // fundo do botão Energia aberto
  powerOffText: '#ff958d', // texto "Desligar"
  passwordErrorBorder: '#bd413f', // borda do campo de senha com erro

  volumeThumbGlow: 'rgba(145,132,217,0.60)', // accent 60%

  btnPrimaryHover: 'rgba(145,132,217,0.12)',
  btnPrimaryActive: 'rgba(145,132,217,0.22)',
  btnGhostHover: 'rgba(145,132,217,0.10)',
  btnGhostActive: 'rgba(145,132,217,0.18)',

  divider: 'rgba(233,233,237,0.16)', // text 16%
  dividerFadeEnd: 'rgba(63,66,77,0)', // neutral-800 0%, ponta dos divisores em degradê
} as const;

export const typography = {
  fontFamily: 'Inter',
  weightLabel: 500,
  weightBody: 400,
  sizes: {
    hardwareLabel: 8.5, // letter-spacing .08em
    xs: 10,
    sm: 10.5,
    base: 11,
    md: 11.5,
    lg: 12,
    xl: 12.5,
    xxl: 13,
    xxxl: 14,
  },
  numericFeatureSettings: '"tnum"',
} as const;

// Nomes de ícones Phosphor tal como usados no design (design/markup.html).
export const iconFallback = {
  music: 'ph-music-note',
  webNotification: 'ph-globe',
} as const;

export const layout = {
  barHeight: 30,
  bottomGap: 3,
  sideMargin: 12,
  pillGap: 6,
  pillRadius: 15,
  pillRingWidth: 1,
  pillPaddingH: 6,
} as const;

export const effects = {
  islandSpring: { durationMs: 460, bezier: [0.3, 1.2, 0.4, 1] }, // `easeSpring` em spring.ts
  islandChrome: { durationMs: 300, easing: 'EASE' }, // linha de acento
  // Entrada `translateY(-16px)` com `transform .4s cubic-bezier(.3,1.25,.4,1)`.
  bannerSlide: { durationMs: 400, offsetY: -16, easing: 'EASE_OUT_BACK' },
  // Barra escondida pelo auto-ocultar: `translateY(-60px)`, `transform .32s cubic-bezier(.2,.8,.2,1)`.
  barHide: { durationMs: 320, offsetY: -60, bezier: [0.2, 0.8, 0.2, 1] },
  bannerFade: { durationMs: 220, easing: 'EASE' },
  contentCrossfade: { durationMs: 220, delayMs: 80, easing: 'EASE' },
  contentScale: {
    durationMs: 300,
    easing: 'EASE',
    hiddenScale: 0.94,
    notifHiddenScale: 0.96,
    notifHiddenOffsetY: -18,
  },
  focusRingWidthPx: 2,
} as const;
