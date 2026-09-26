import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

// Mesmo caminho que o Shell usa pra abrir um painel das Configurações com
// argumentos (js/ui/status/network.js `launchSettingsPanel`, não exportado).
export function launchSettingsPanel(panel: string, ...args: string[]): void {
  const app = Shell.AppSystem.get_default().lookup_app('org.gnome.Settings.desktop');
  if (!app) return;

  const param = new GLib.Variant('av', [
    new GLib.Variant('(sav)', [panel, args.map((arg) => new GLib.Variant('s', arg))]),
  ]);
  app.activate_action('launch-panel', param, 0, -1, null).catch((error: Error) => {
    console.error(`Island: failed to launch Settings panel ${panel}: ${error.message}`);
  });
}
