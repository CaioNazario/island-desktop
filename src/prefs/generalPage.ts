import Adw from 'gi://Adw';
import type Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { connectWhileOpen } from './lifetime.js';

const CLICK_ACTION_KEY = 'click-action';
const THEME_KEY = 'theme';

// A posição de cada tema é o valor do enum `Theme` no schema, na ordem de
// `THEME_IDS` (specs/19-temas.md). Trocar recria a UI da ilha na hora.
function themeRow(settings: Gio.Settings, window: Gtk.Window): Adw.ComboRow {
  const row = new Adw.ComboRow({
    title: _('Tema'),
    model: Gtk.StringList.new([_('Nocturne'), _('Alto contraste')]),
  });
  const sync = () => {
    row.selected = settings.get_enum(THEME_KEY);
  };
  sync();
  connectWhileOpen(window, settings, `changed::${THEME_KEY}`, sync);
  row.connect('notify::selected', () => {
    if (settings.get_enum(THEME_KEY) !== row.selected) settings.set_enum(THEME_KEY, row.selected);
  });
  return row;
}

// specs/13-preferencias.md "Geral". A posição de cada opção é o valor do enum
// `ClickAction` no schema (center-card = 0, calendar = 1).
export function buildGeneralPage(settings: Gio.Settings, window: Gtk.Window): Adw.PreferencesPage {
  const row = new Adw.ComboRow({
    title: _('Clique na ilha abre'),
    model: Gtk.StringList.new([_('Calendário e música (cartão)'), _('Calendário compacto (ilha)')]),
  });
  const sync = () => {
    row.selected = settings.get_enum(CLICK_ACTION_KEY);
  };
  sync();
  connectWhileOpen(window, settings, `changed::${CLICK_ACTION_KEY}`, sync);
  row.connect('notify::selected', () => {
    if (settings.get_enum(CLICK_ACTION_KEY) !== row.selected)
      settings.set_enum(CLICK_ACTION_KEY, row.selected);
  });

  const group = new Adw.PreferencesGroup();
  group.add(row);
  group.add(themeRow(settings, window));
  const page = new Adw.PreferencesPage({
    name: 'general',
    title: _('Geral'),
    icon_name: 'preferences-system-symbolic',
  });
  page.add(group);
  return page;
}
