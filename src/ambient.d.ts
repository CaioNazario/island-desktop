// Complementa os tipos de @girs/gnome-shell (50.0.4) com APIs que existem no
// runtime do GNOME Shell 50.4 mas ainda não estão no pacote de tipos
// (verificado em js/misc/brightnessManager.js, js/ui/main.js,
// js/ui/layout.js e js/ui/pointerWatcher.js do branch gnome-50 do
// gitlab.gnome.org/GNOME/gnome-shell; o `PressureBarrier` no spike S9).
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

declare module 'resource:///org/gnome/shell/ui/layout.js' {
  import type Meta from 'gi://Meta';
  import type Shell from 'gi://Shell';

  export class PressureBarrier {
    constructor(threshold: number, timeout: number, actionMode: Shell.ActionMode);
    addBarrier(barrier: Meta.Barrier): void;
    connect(signal: 'trigger', callback: () => void): number;
    destroy(): void;
  }
}

declare module 'resource:///org/gnome/shell/ui/pointerWatcher.js' {
  export interface PointerWatch {
    remove(): void;
  }

  interface PointerWatcher {
    /** Chama `callback` quando o ponteiro mexe; para de consultar com o usuário ocioso. */
    addWatch(interval: number, callback: (x: number, y: number) => void): PointerWatch;
  }

  export function getPointerWatcher(): PointerWatcher;
}
