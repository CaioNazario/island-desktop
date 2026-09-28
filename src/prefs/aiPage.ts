import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
  CREDENTIAL_FILES,
  credentialState,
  type CredentialState,
  type ProviderId,
} from '../core/aiUsage.js';

const PROVIDERS: readonly { id: ProviderId; name: string; settingsKey: string }[] = [
  { id: 'claude', name: 'Claude', settingsKey: 'ai-claude-enabled' },
  { id: 'codex', name: 'Codex', settingsKey: 'ai-codex-enabled' },
];

const decoder = new TextDecoder();

function describeState(state: CredentialState, name: string): string {
  switch (state) {
    case 'found':
      return _('Encontrada');
    case 'expired':
      return _('Expirada');
    case 'missing':
      return _('Não encontrada: faça login no %s').replace('%s', name);
  }
}

// Só lê o arquivo: a Island nunca escreve nas credenciais (specs/12-uso-ia.md).
async function readState(file: Gio.File, id: ProviderId): Promise<CredentialState> {
  try {
    const [bytes] = await file.load_contents_async(null);
    return credentialState(CREDENTIAL_FILES[id].parse(decoder.decode(bytes)), Date.now());
  } catch (e) {
    if (!(e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)))
      console.error(`Island: cannot read ${id} credentials: ${(e as Error).message}`);
    return 'missing';
  }
}

function providerRow(
  provider: (typeof PROVIDERS)[number],
  settings: Gio.Settings,
  window: Gtk.Window,
): Adw.SwitchRow {
  const row = new Adw.SwitchRow({ title: provider.name });
  settings.bind(provider.settingsKey, row, 'active', Gio.SettingsBindFlags.DEFAULT);
  const path = GLib.build_filenamev([GLib.get_home_dir(), ...CREDENTIAL_FILES[provider.id].path]);
  const file = Gio.File.new_for_path(path);
  const refresh = () =>
    void readState(file, provider.id).then((state) => {
      row.subtitle = describeState(state, provider.name);
    });
  refresh();
  // Login ou renovação com a janela aberta.
  const monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
  monitor.connect('changed', refresh);
  window.connect('close-request', () => {
    monitor.cancel();
    return false;
  });
  return row;
}

// specs/13-preferencias.md "Uso de IA".
export function buildAiPage(settings: Gio.Settings, window: Gtk.Window): Adw.PreferencesPage {
  Gio._promisify(Gio.File.prototype, 'load_contents_async');
  const group = new Adw.PreferencesGroup();
  for (const provider of PROVIDERS) group.add(providerRow(provider, settings, window));
  const page = new Adw.PreferencesPage({
    name: 'ai',
    title: _('Uso de IA'),
    icon_name: 'utilities-system-monitor-symbolic',
  });
  page.add(group);
  return page;
}
