// Complementa os tipos de @girs/gnome-shell (50.0.4) com APIs que existem no
// runtime do GNOME Shell 50.4 mas ainda não estão no pacote de tipos
// (verificado em js/misc/brightnessManager.js e js/ui/main.js do branch
// gnome-50 do gitlab.gnome.org/GNOME/gnome-shell).
declare module 'resource:///org/gnome/shell/ui/main.js' {
  import type GObject from 'gi://GObject';

  class BrightnessScale extends GObject.Object {
    value: number;
  }

  class BrightnessManager extends GObject.Object {
    readonly globalScale: BrightnessScale | null;
  }

  export const brightnessManager: BrightnessManager;
}
