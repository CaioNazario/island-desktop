import Gio from 'gi://Gio';

import type { BatteryIcon } from '../core/battery.js';
import type { DeviceKind } from '../core/bluetooth.js';
import type { SignalLevel } from '../core/wifi.js';
import type { SystemVolume } from '../system/volume.js';

// Ícones Phosphor do design (specs/01-design-tokens.md "Ícones"), extraídos
// por `scripts/extract-design.py` para `icons/<glifo>-symbolic.svg`. O nome
// do glifo segue a classe do design: `ph ph-sun` → `sun`, `ph-bold ph-power`
// → `power-bold`, `ph-fill ph-moon` → `moon-fill`.
export function phosphor(glyph: string): Gio.Icon {
  // `dist/ui/icons.js` → `dist/icons/`.
  const iconsDir = Gio.File.new_for_uri(import.meta.url)
    .get_parent()!
    .get_parent()!
    .get_child('icons');
  return new Gio.FileIcon({ file: iconsDir.get_child(`${glyph}-symbolic.svg`) });
}

export function volumeIconName(volume: SystemVolume): string {
  if (volume.muted || volume.percent === 0) return 'speaker-x-fill';
  if (volume.percent < 40) return 'speaker-low-fill';
  return 'speaker-high-fill';
}

export const brightnessIconName = (): string => 'sun';

export function wifiSignalIconName(level: SignalLevel): string {
  switch (level) {
    case 'high':
      return 'wifi-high-bold';
    case 'medium':
      return 'wifi-medium-bold';
    case 'low':
      return 'wifi-low-bold';
  }
}

export const wifiTileIconName = 'wifi-high-bold';
export const wifiIconName = 'wifi-high';
export const wifiOffIconName = 'wifi-slash';
export const wifiOffBoldIconName = 'wifi-slash-bold';
export const lockIconName = 'lock-simple-fill';
export const keyIconName = 'key';
export const warningIconName = 'warning-circle';
export const revealIconName = 'eye';
export const concealIconName = 'eye-slash';

export const btIconName = 'bluetooth-bold';
export const btOffIconName = 'bluetooth-slash';
export const spinnerIconName = 'circle-notch';
export const batteryIconName = 'battery-medium-fill';

export const nightLightIconName = 'moon-fill';
export const settingsIconName = 'gear-six';
export const powerIconName = 'power-bold';
export const dndIconName = 'bell-slash-fill';
export const caretIconName = 'caret-down';
export const closeIconName = 'x';
export const notificationFallbackIconName = 'bell-fill';
export const silentBellIconName = 'bell-slash';

/**
 * Ícone de notificação de app nativo (specs/04-notificacoes.md): o simbólico
 * do app (`<ícone>-symbolic`), tingido pela UI. Sem nome de tema (ex.:
 * `FileIcon`), vai direto ao sino; nome sem simbólico no tema cai no
 * `fallback_gicon` do `St.Icon`.
 */
export function notificationAppIcon(appIcon: Gio.Icon | null): Gio.Icon {
  if (!(appIcon instanceof Gio.ThemedIcon)) return phosphor(notificationFallbackIconName);
  const name = appIcon.get_names()[0];
  if (!name) return phosphor(notificationFallbackIconName);
  return new Gio.ThemedIcon({ name: name.endsWith('-symbolic') ? name : `${name}-symbolic` });
}

export function batteryLevelIconName(icon: BatteryIcon): string {
  return `battery-${icon}-fill`;
}

export function btDeviceIconName(kind: DeviceKind): string {
  switch (kind) {
    case 'headphones':
      return 'headphones-fill';
    case 'mouse':
      return 'mouse-fill';
    case 'keyboard':
      return 'keyboard-fill';
    case 'speaker':
      return 'speaker-hifi-fill';
    case 'phone':
      return 'device-mobile-fill';
    case 'computer':
      return 'laptop-fill';
    case 'gamepad':
      return 'game-controller-fill';
    case 'other':
      return 'bluetooth-fill';
  }
}
