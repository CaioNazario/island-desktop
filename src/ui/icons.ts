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
