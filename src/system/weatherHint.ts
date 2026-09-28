import type Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import type { WeatherSource } from './weather.js';

const SHOWN_KEY = 'weather-hint-shown';

// Primeira execução sem localização (specs/07-clima.md): uma única vez, a
// Island avisa que falta a cidade; o clique abre as preferências.
//
// A notificação fica com o Shell mesmo depois do `destroy()`: a extensão é
// desligada a cada bloqueio de tela, e a dica já foi marcada como mostrada.
export class WeatherHint {
  private readonly settings: Gio.Settings;
  private readonly weather: WeatherSource;
  private readonly openPreferences: () => void;
  private readonly unsubscribe: () => void;

  constructor(settings: Gio.Settings, weather: WeatherSource, openPreferences: () => void) {
    this.settings = settings;
    this.weather = weather;
    this.openPreferences = openPreferences;
    this.unsubscribe = weather.onChange(() => this.check());
    this.check();
  }

  destroy(): void {
    this.unsubscribe();
  }

  private check(): void {
    if (!this.weather.unlocated || this.settings.get_boolean(SHOWN_KEY)) return;
    this.settings.set_boolean(SHOWN_KEY, true);

    const source = new MessageTray.Source({
      title: 'Island',
      iconName: 'weather-few-clouds-symbolic',
    });
    Main.messageTray.add(source);
    const notification = new MessageTray.Notification({
      source,
      title: 'Configure sua cidade para ver o clima',
    });
    const openPreferences = this.openPreferences;
    notification.connect('activated', () => openPreferences());
    source.addNotification(notification);
  }
}
