// Conversões de cor para o St, que só entende #rrggbb e rgba(): o design usa
// oklch() e color-mix() (design/tokens.css), que o CSS do St não tem.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_COLOR = /^#([0-9a-f]{6})$/i;
const RGBA_COLOR = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/;

export function parseColor(color: string): Rgba {
  const hex = HEX_COLOR.exec(color);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = RGBA_COLOR.exec(color);
  if (rgba) return { r: +rgba[1]!, g: +rgba[2]!, b: +rgba[3]!, a: +rgba[4]! };
  throw new Error(`cor inválida: ${JSON.stringify(color)} (esperado #rrggbb ou rgba(r, g, b, a))`);
}

function hex2(channel: number): string {
  return Math.round(channel).toString(16).padStart(2, '0');
}

export function formatColor({ r, g, b, a }: Rgba): string {
  if (a >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(3)})`;
}

/** Mesma cor com outro alfa (multiplica o alfa que ela já tem). */
export function withAlpha(color: string, alpha: number): string {
  const parsed = parseColor(color);
  return formatColor({ ...parsed, a: parsed.a * alpha });
}

/**
 * `color-mix(in srgb, color pct%, transparent)` do design. O mix é em sRGB
 * sem pré-multiplicar, que para um lado transparente só muda o alfa.
 */
export function mixWithTransparent(color: string, percent: number): string {
  return withAlpha(color, percent / 100);
}

function gamma(linear: number): number {
  const v = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v)) * 255;
}

/** oklch() → #rrggbb, matriz de Björn Ottosson (bottosson.github.io/posts/oklab). */
export function oklchToHex(lightness: number, chroma: number, hueDegrees: number): string {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);
  return formatColor({
    r: gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: 1,
  });
}
