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
