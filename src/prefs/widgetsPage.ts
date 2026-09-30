import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { formatDate, MAX_COUNTDOWN_NAME, parseIsoDate, toIsoDate } from '../core/countdown.js';
import { connectWhileOpen } from './lifetime.js';

const NAME_KEY = 'countdown-name';
const DATE_KEY = 'countdown-date';
const GH_TIMEOUT_MS = 5000;

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

// Só o código de saída: a saída do `gh auth status` é descartada. Mesmo
// timeout do widget, para o keyring bloqueado não prender a página.
async function ghConnected(): Promise<boolean> {
  let process: Gio.Subprocess;
  try {
    process = Gio.Subprocess.new(
      ['gh', 'auth', 'status'],
      Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
    );
  } catch {
    return false;
  }
  let timeoutId: number | null = GLib.timeout_add(GLib.PRIORITY_DEFAULT, GH_TIMEOUT_MS, () => {
    timeoutId = null;
    process.force_exit();
    return GLib.SOURCE_REMOVE;
  });
  try {
    return await process.wait_check_async(null);
  } catch {
    return false;
  } finally {
    if (timeoutId !== null) GLib.Source.remove(timeoutId);
  }
}

function githubRow(): Adw.ActionRow {
  const row = new Adw.ActionRow({ title: 'GitHub' });
  void ghConnected().then((connected) => {
    row.subtitle = connected ? _('Conectado') : _('Não encontrado: rode gh auth login');
  });
  return row;
}

// specs/13-preferencias.md "Widgets".
export function buildWidgetsPage(settings: Gio.Settings, window: Gtk.Window): Adw.PreferencesPage {
  Gio._promisify(Gio.Subprocess.prototype, 'wait_check_async');
  const countdown = new Adw.PreferencesGroup({ title: _('Contagem regressiva') });
  countdown.add(nameRow(settings));
  countdown.add(dateRow(settings, window));
  const page = new Adw.PreferencesPage({
    name: 'widgets',
    title: _('Widgets'),
    icon_name: 'view-grid-symbolic',
  });
  page.add(countdown);
  const github = new Adw.PreferencesGroup();
  github.add(githubRow());
  page.add(github);
  return page;
}
