import type Adw from 'gi://Adw';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { buildGeneralPage } from './prefs/generalPage.js';

// Janela de preferências (specs/13-preferencias.md). Roda no processo do app
// Extensões e só conversa com a extensão via GSettings.
export default class IslandPreferences extends ExtensionPreferences {
  override fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();
    window.add(buildGeneralPage(settings, window));
    return Promise.resolve();
  }
}
