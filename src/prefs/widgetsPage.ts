import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { formatDate, MAX_COUNTDOWN_NAME, parseIsoDate, toIsoDate } from '../core/countdown.js';
import { connectWhileOpen } from './lifetime.js';

const NAME_KEY = 'countdown-name';
const DATE_KEY = 'countdown-date';

function nameRow(settings: Gio.Settings): Adw.EntryRow {
  const row = new Adw.EntryRow({ title: _('Nome'), max_length: MAX_COUNTDOWN_NAME });
  settings.bind(NAME_KEY, row, 'text', Gio.SettingsBindFlags.DEFAULT);
  return row;
}

function datePicker(settings: Gio.Settings): Gtk.MenuButton {
  const calendar = new Gtk.Calendar();
  const popover = new Gtk.Popover({ child: calendar });
  popover.connect('show', () => {
    const date = parseIsoDate(settings.get_string(DATE_KEY));
    if (date)
      calendar.select_day(GLib.DateTime.new_local(date.year, date.month, date.day, 0, 0, 0));
  });
  calendar.connect('day-selected', () => {
    const picked = calendar.get_date();
    settings.set_string(
      DATE_KEY,
      toIsoDate({
        year: picked.get_year(),
        month: picked.get_month(),
        day: picked.get_day_of_month(),
      }),
    );
    popover.popdown();
  });
  return new Gtk.MenuButton({
    icon_name: 'x-office-calendar-symbolic',
    popover,
    valign: Gtk.Align.CENTER,
    css_classes: ['flat'],
    tooltip_text: _('Escolher data'),
  });
}

function dateRow(settings: Gio.Settings, window: Gtk.Window): Adw.ActionRow {
  const row = new Adw.ActionRow({ title: _('Data') });
  const clear = new Gtk.Button({
    label: _('Limpar'),
    valign: Gtk.Align.CENTER,
    css_classes: ['flat'],
  });
  clear.connect('clicked', () => settings.reset(DATE_KEY));
  row.add_suffix(clear);
  row.add_suffix(datePicker(settings));

  const sync = () => {
    const date = parseIsoDate(settings.get_string(DATE_KEY));
    row.subtitle = date ? formatDate(date) : _('Sem data');
    clear.visible = date !== null;
  };
  sync();
  connectWhileOpen(window, settings, `changed::${DATE_KEY}`, sync);
  return row;
}

// specs/13-preferencias.md "Widgets".
export function buildWidgetsPage(settings: Gio.Settings, window: Gtk.Window): Adw.PreferencesPage {
  const countdown = new Adw.PreferencesGroup({ title: _('Contagem regressiva') });
  countdown.add(nameRow(settings));
  countdown.add(dateRow(settings, window));
  const page = new Adw.PreferencesPage({
    name: 'widgets',
    title: _('Widgets'),
    icon_name: 'view-grid-symbolic',
  });
  page.add(countdown);
  return page;
}
