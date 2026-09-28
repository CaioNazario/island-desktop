import GLib from 'gi://GLib';

// Logs de diagnóstico no journal, desligados por padrão. Liga com
// `touch ~/.cache/island-debug` e relogin; lê com
// `journalctl -o cat /usr/bin/gnome-shell | grep ISLANDDBG`.
const FLAG_FILE = 'island-debug';

let enabled = false;

/** Lê o arquivo-flag; o `BarManager` chama a cada ativação da extensão. */
export function syncDebugLog(): void {
  const path = GLib.build_filenamev([GLib.get_user_cache_dir(), FLAG_FILE]);
  enabled = GLib.file_test(path, GLib.FileTest.EXISTS);
}

export function debugLog(message: string): void {
  if (enabled) console.log(`ISLANDDBG ${message}`);
}

/** Quem chamou, em uma linha, sem os quadros do próprio log. */
export function callerStack(skip = 2): string {
  return (new Error().stack ?? '')
    .split('\n')
    .slice(skip, skip + 4)
    .map((frame) => frame.replace(/@.*\/(.*?:\d+):\d+$/, '@$1'))
    .join(' | ');
}
