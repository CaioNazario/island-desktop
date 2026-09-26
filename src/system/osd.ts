import Gio from 'gi://Gio';
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

type OsdKind = 'volume' | 'brightness' | null;

function kindOf(icon: unknown): OsdKind {
  if (!(icon instanceof Gio.ThemedIcon)) return null;
  const name = icon.names[0] ?? '';
  if (name.startsWith('audio-volume-')) return 'volume';
  if (name === 'display-brightness-symbolic') return 'brightness';
  return null;
}

// specs/08-controles-rapidos.md "Teclas de mídia": o OSD nativo de volume e
// brilho não aparece, redirecionado pra ilha; outros OSDs (ex.: teclado)
// continuam nativos. `Main.osdWindowManager` é injetado via `InjectionManager`
// (js/ui/osdWindow.js do Shell 50.x: `show`/`showOne`/`showAll` são os três
// pontos de entrada — a tecla de volume chega por `showOne`/`showAll` via
// D-Bus `org.gnome.Shell.ShowOSD`, a de brilho por `show` direto do
// `BrightnessManager`).
export class OsdRedirect {
  private readonly injectionManager = new InjectionManager();

  constructor(onVolumeOsd: () => void, onBrightnessOsd: () => void) {
    const redirect = (icon: unknown, showNative: () => void): void => {
      const kind = kindOf(icon);
      if (kind === 'volume') onVolumeOsd();
      else if (kind === 'brightness') onBrightnessOsd();
      else showNative();
    };

    type PatchableMethod = (...args: unknown[]) => void;
    const prototype = Object.getPrototypeOf(Main.osdWindowManager) as Record<
      string,
      PatchableMethod
    >;

    for (const methodName of ['show', 'showOne', 'showAll'] as const) {
      this.injectionManager.overrideMethod(
        prototype,
        methodName,
        (original: PatchableMethod) =>
          function (this: unknown, ...args: unknown[]) {
            const icon = methodName === 'showOne' ? args[1] : args[0];
            redirect(icon, () => original.apply(this, args));
          },
      );
    }
  }

  destroy(): void {
    this.injectionManager.clear();
  }
}
