import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { SHELL_KEYBINDINGS_SCHEMA } from 'resource:///org/gnome/shell/ui/windowManager.js';

import { BarManager } from './ui/bar.js';

const QUICK_SETTINGS_KEYBINDING = 'toggle-quick-settings';
const QUICK_SETTINGS_MODES =
  Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP;

// specs/15-ambientes.md: `Super+Ctrl+→`/`←` trocam de ambiente de qualquer lugar.
const ENVIRONMENT_KEYBINDINGS = [
  ['switch-environment-next', 1],
  ['switch-environment-previous', -1],
] as const;

export default class IslandExtension extends Extension {
  private barManager: BarManager | null = null;

  override enable(): void {
    // A Island é dona do painel: o strut do panelBox padrão sai de cena e as
    // três pílulas passam a reservar o próprio espaço (specs/02-barra.md).
    Main.layoutManager.untrackChrome(Main.layoutManager.panelBox);
    Main.panel.hide();
    const settings = this.getSettings();
    this.barManager = new BarManager(settings, () => this.openPreferences());
    for (const [name, direction] of ENVIRONMENT_KEYBINDINGS)
      Main.wm.addKeybinding(
        name,
        settings,
        Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
        QUICK_SETTINGS_MODES,
        () => this.barManager?.stepEnvironmentFromShortcut(direction),
      );

    // specs/03-ilha.md "Atalho Super+S": a Island assume o atalho nativo de
    // quick settings (o painel nativo está escondido atrás dela) e devolve o
    // comportamento original no disable().
    Main.wm.removeKeybinding(QUICK_SETTINGS_KEYBINDING);
    Main.wm.addKeybinding(
      QUICK_SETTINGS_KEYBINDING,
      new Gio.Settings({ schema_id: SHELL_KEYBINDINGS_SCHEMA }),
      Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
      QUICK_SETTINGS_MODES,
      () => this.barManager?.toggleQuickFromShortcut(),
    );
  }

  override disable(): void {
    for (const [name] of ENVIRONMENT_KEYBINDINGS) Main.wm.removeKeybinding(name);
    Main.wm.removeKeybinding(QUICK_SETTINGS_KEYBINDING);
    Main.wm.addKeybinding(
      QUICK_SETTINGS_KEYBINDING,
      new Gio.Settings({ schema_id: SHELL_KEYBINDINGS_SCHEMA }),
      Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
      QUICK_SETTINGS_MODES,
      () => Main.panel.toggleQuickSettings(),
    );

    this.barManager?.destroy();
    this.barManager = null;
    Main.panel.show();
    Main.layoutManager.trackChrome(Main.layoutManager.panelBox, {
      affectsStruts: true,
      trackFullscreen: true,
    });
  }
}
