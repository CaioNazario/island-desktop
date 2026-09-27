// Botão de bateria da pílula direita (specs/11-bateria.md; design/logic.js
// `batColor`/`batIcon`/`batShown`, ~197–198 e 285).

export type BatteryIcon = 'full' | 'high' | 'medium' | 'low' | 'warning' | 'charging';

/** `good` ≥80 (verde), `low` ≤20 (vermelho no ícone e no texto), `normal` entre. */
export type BatteryTone = 'good' | 'normal' | 'low';

export interface BatteryDisplay {
  icon: BatteryIcon;
  tone: BatteryTone;
  label: string;
}

function levelIcon(percent: number): BatteryIcon {
  if (percent >= 95) return 'full';
  if (percent >= 60) return 'high';
  if (percent > 20) return 'medium';
  if (percent > 8) return 'low';
  return 'warning';
}

function tone(percent: number): BatteryTone {
  if (percent >= 80) return 'good';
  if (percent <= 20) return 'low';
  return 'normal';
}

/** As cores seguem o nível também carregando; só o ícone vira `charging`. */
export function batteryDisplay(percentage: number, charging: boolean): BatteryDisplay {
  const percent = Math.max(0, Math.min(100, Math.round(percentage)));
  return {
    icon: charging ? 'charging' : levelIcon(percent),
    tone: tone(percent),
    label: `${percent}%`,
  };
}
