import type GObject from 'gi://GObject';
import type Gtk from 'gi://Gtk';

// O `connectObject` é do Shell e não existe no processo das preferências. O
// app Extensões continua vivo depois de fechar a janela, então cada signal
// ligado a um objeto de fora dela é desligado no `close-request`.
export function connectWhileOpen(
  window: Gtk.Window,
  target: GObject.Object,
  signal: string,
  callback: () => void,
): void {
  const id = target.connect(signal, callback);
  window.connect('close-request', () => {
    target.disconnect(id);
    return false;
  });
}
