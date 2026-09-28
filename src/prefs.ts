import type Adw from 'gi://Adw';
import type Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { buildGeneralPage } from './prefs/generalPage.js';
import { connectWhileOpen } from './prefs/lifetime.js';
import { buildWeatherPage } from './prefs/weatherPage.js';

// O `openPreferences()` do Shell não escolhe página: quem abre grava o nome
// dela nesta chave interna (ex.: a dica do clima, specs/07-clima.md).
const PAGE_KEY = 'prefs-page';

function followRequestedPage(settings: Gio.Settings, window: Adw.PreferencesWindow): void {
  const show = () => {
    const name = settings.get_string(PAGE_KEY);
    if (!name) return;
    window.set_visible_page_name(name);
    settings.reset(PAGE_KEY);
  };
  show();
  // Janela já aberta: o Shell só a traz para frente.
  connectWhileOpen(window, settings, `changed::${PAGE_KEY}`, show);
}

// Janela de preferências (specs/13-preferencias.md). Roda no processo do app
// Extensões e só conversa com a extensão via GSettings.
export default class IslandPreferences extends ExtensionPreferences {
  override fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();
    window.add(buildGeneralPage(settings, window));
    window.add(buildWeatherPage(settings, window));
    followRequestedPage(settings, window);
    return Promise.resolve();
  }
}
