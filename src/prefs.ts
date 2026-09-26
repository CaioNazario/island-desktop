import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import type Adw from 'gi://Adw';

export default class IslandPreferences extends ExtensionPreferences {
  override fillPreferencesWindow(_window: Adw.PreferencesWindow): Promise<void> {
    // TODO(spec 13): páginas de preferências a partir do GSettings.
    return Promise.resolve();
  }
}
