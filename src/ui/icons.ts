import type { DeviceKind } from '../core/bluetooth.js';
import type { SignalLevel } from '../core/wifi.js';
import type { SystemVolume } from '../system/volume.js';

// Nomes simbólicos do sistema como substituto temporário do ícone Phosphor
// (specs/08-controles-rapidos.md), até a spec 01 ganhar um pipeline de fonte
// de ícones.
export function volumeIconName(volume: SystemVolume): string {
  if (volume.muted || volume.percent === 0) return 'audio-volume-muted-symbolic';
  if (volume.percent < 40) return 'audio-volume-low-symbolic';
  return 'audio-volume-high-symbolic';
}

export const brightnessIconName = (): string => 'display-brightness-symbolic';

export function wifiSignalIconName(level: SignalLevel): string {
  switch (level) {
    case 'high':
      return 'network-wireless-signal-excellent-symbolic';
    case 'medium':
      return 'network-wireless-signal-ok-symbolic';
    case 'low':
      return 'network-wireless-signal-weak-symbolic';
  }
}

export const wifiIconName = 'network-wireless-symbolic';
export const wifiOffIconName = 'network-wireless-disabled-symbolic';
export const lockIconName = 'changes-prevent-symbolic';
export const keyIconName = 'dialog-password-symbolic';
export const warningIconName = 'dialog-warning-symbolic';
export const revealIconName = 'view-reveal-symbolic';
export const concealIconName = 'view-conceal-symbolic';

export const btIconName = 'bluetooth-active-symbolic';
export const btOffIconName = 'bluetooth-disabled-symbolic';
export const spinnerIconName = 'view-refresh-symbolic';
export const batteryIconName = 'battery-level-50-symbolic';

export function btDeviceIconName(kind: DeviceKind): string {
  switch (kind) {
    case 'headphones':
      return 'audio-headphones-symbolic';
    case 'mouse':
      return 'input-mouse-symbolic';
    case 'keyboard':
      return 'input-keyboard-symbolic';
    case 'speaker':
      return 'audio-speakers-symbolic';
    case 'phone':
      return 'phone-symbolic';
    case 'computer':
      return 'computer-symbolic';
    case 'gamepad':
      return 'input-gaming-symbolic';
    case 'other':
      return btIconName;
  }
}
