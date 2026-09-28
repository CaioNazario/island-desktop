import Geoclue from 'gi://Geoclue';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GWeather from 'gi://GWeather?version=4.0';
import { getLoginManager } from 'resource:///org/gnome/shell/misc/loginManager.js';

import { isFresh, type WeatherReading } from '../core/weather.js';
import { weatherGlyph } from '../core/weatherIcon.js';

export interface WeatherSource {
  /** Leitura com até 3h; `null` some com o clima da ilha. */
  readonly reading: WeatherReading | null;
  /** A cadeia inteira falhou (passo 4 da spec 07); `false` enquanto o Geoclue procura. */
  readonly unlocated: boolean;
  onChange(callback: () => void): () => void;
}

const UPDATE_INTERVAL_SECONDS = 30 * 60;

// MET Norway pede que o cliente se identifique (libgweather monta o
// User-Agent com estes dois).
const APPLICATION_ID = 'dev.caionazario.Island';
const CONTACT_INFO = 'https://github.com/CaioNazario/island-desktop';

// Passo 2 da cadeia: as cidades do clima do Shell e do app GNOME Weather.
const GNOME_WEATHER_SCHEMAS = ['org.gnome.shell.weather', 'org.gnome.Weather'];
const LOCATION_SCHEMA = 'org.gnome.system.location';

// O `geoclue.conf` libera este id com `system=true`: é o que o próprio Shell
// usa (js/misc/weather.js), e a extensão roda no processo dele.
const GEOCLUE_DESKTOP_ID = 'org.gnome.Shell';

function lookupSettings(schemaId: string): Gio.Settings | null {
  const schema = Gio.SettingsSchemaSource.get_default()?.lookup(schemaId, true);
  return schema ? new Gio.Settings({ settings_schema: schema }) : null;
}

// Clima via GWeather/MET Norway (specs/07-clima.md), com a cadeia
// preferência → cidades do GNOME → Geoclue → nada.
export class SystemWeather implements WeatherSource {
  private readonly settings: Gio.Settings;
  private readonly gnomeSettings: Gio.Settings[];
  private readonly locationSettings: Gio.Settings | null;
  private readonly world: GWeather.Location | null;
  private readonly info: GWeather.Info;
  private readonly listeners = new Set<() => void>();
  private location: GWeather.Location | null = null;
  private last: WeatherReading | null = null;
  private geoclue: Geoclue.Simple | null = null;
  private geoclueCancellable: Gio.Cancellable | null = null;
  private timerId: number | null = null;

  constructor(settings: Gio.Settings) {
    this.settings = settings;
    this.world = GWeather.Location.get_world();
    this.info = new GWeather.Info({
      application_id: APPLICATION_ID,
      contact_info: CONTACT_INFO,
      enabled_providers: GWeather.Provider.MET_NO,
    });
    this.info.connectObject('updated', () => this.onUpdated(), this);

    this.settings.connectObject('changed::weather-location', () => this.resolve(), this);
    this.gnomeSettings = GNOME_WEATHER_SCHEMAS.map(lookupSettings).filter(
      (s): s is Gio.Settings => s !== null,
    );
    for (const s of this.gnomeSettings)
      s.connectObject('changed::locations', () => this.resolve(), this);
    this.locationSettings = lookupSettings(LOCATION_SCHEMA);
    this.locationSettings?.connectObject('changed::enabled', () => this.resolve(), this);

    // "ao retomar da suspensão"
    getLoginManager().connectObject(
      'prepare-for-sleep',
      (_manager: unknown, aboutToSuspend: boolean) => {
        if (!aboutToSuspend) this.update();
      },
      this,
    );

    this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, UPDATE_INTERVAL_SECONDS, () => {
      this.update();
      // Reavalia a validade de 3h sem depender de um `updated` que traga dado.
      this.notify();
      return GLib.SOURCE_CONTINUE;
    });

    this.resolve();
  }

  get reading(): WeatherReading | null {
    return this.last && isFresh(this.last, Date.now()) ? this.last : null;
  }

  get unlocated(): boolean {
    return this.location === null && this.geoclue === null && this.geoclueCancellable === null;
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    if (this.timerId !== null) {
      GLib.Source.remove(this.timerId);
      this.timerId = null;
    }
    getLoginManager().disconnectObject(this);
    this.settings.disconnectObject(this);
    this.gnomeSettings.forEach((s) => s.disconnectObject(this));
    this.locationSettings?.disconnectObject(this);
    this.stopGeoclue();
    this.info.disconnectObject(this);
    this.info.abort();
    this.listeners.clear();
  }

  // Resolve a cadeia na ordem, parando na primeira que der resultado.
  private resolve(): void {
    const preferred = this.preferredLocation();
    if (preferred) {
      this.stopGeoclue();
      this.setLocation(preferred);
      return;
    }
    const gnome = this.gnomeLocation();
    if (gnome) {
      this.stopGeoclue();
      this.setLocation(gnome);
      return;
    }
    if (this.locationSettings?.get_boolean('enabled')) {
      this.startGeoclue();
      return;
    }
    this.stopGeoclue();
    this.setLocation(null);
  }

  private preferredLocation(): GWeather.Location | null {
    // `v` guardando o `serialize()` da cidade; o padrão `@mv nothing` é vazio.
    const stored = this.settings.get_value('weather-location').get_variant();
    if (stored.is_of_type(new GLib.VariantType('mv'))) return null;
    return this.deserialize(stored);
  }

  private gnomeLocation(): GWeather.Location | null {
    for (const s of this.gnomeSettings) {
      const locations = s.get_value('locations').deep_unpack() as GLib.Variant[];
      for (const serialized of locations) {
        const location = this.deserialize(serialized);
        if (location) return location;
      }
    }
    return null;
  }

  private deserialize(serialized: GLib.Variant): GWeather.Location | null {
    try {
      return this.world?.deserialize(serialized) ?? null;
    } catch (e) {
      console.error(`Island: invalid weather location: ${(e as Error).message}`);
      return null;
    }
  }

  private startGeoclue(): void {
    if (this.geoclue) {
      this.onGeoclueLocation();
      return;
    }
    if (this.geoclueCancellable) return;
    const cancellable = new Gio.Cancellable();
    this.geoclueCancellable = cancellable;
    // A cidade do passo anterior sai enquanto o Geoclue procura; o
    // cancellable já existe, então isso não conta como "sem localização".
    this.setLocation(null);
    Geoclue.Simple.new(GEOCLUE_DESKTOP_ID, Geoclue.AccuracyLevel.CITY, cancellable, (_s, res) => {
      if (cancellable.is_cancelled()) return;
      this.geoclueCancellable = null;
      try {
        this.geoclue = Geoclue.Simple.new_finish(res);
      } catch (e) {
        console.error(`Island: Geoclue unavailable: ${(e as Error).message}`);
        this.setLocation(null);
        return;
      }
      this.geoclue.connectObject('notify::location', () => this.onGeoclueLocation(), this);
      this.onGeoclueLocation();
    });
  }

  private onGeoclueLocation(): void {
    const coords = this.geoclue?.get_location();
    if (!coords || !this.world) return;
    this.setLocation(this.world.find_nearest_city(coords.latitude, coords.longitude));
  }

  private stopGeoclue(): void {
    this.geoclueCancellable?.cancel();
    this.geoclueCancellable = null;
    this.geoclue?.disconnectObject(this);
    this.geoclue = null;
  }

  private setLocation(location: GWeather.Location | null): void {
    if (location && this.location && location.equal(this.location)) return;
    this.location = location;
    // A leitura de outra cidade não vale para a nova.
    this.last = null;
    this.info.abort();
    this.info.set_location(location);
    this.update();
    this.notify();
  }

  private update(): void {
    if (this.location) this.info.update();
  }

  private onUpdated(): void {
    if (this.info.is_valid()) {
      const [hasTemp, celsius] = this.info.get_value_temp(GWeather.TemperatureUnit.CENTIGRADE);
      const glyph = weatherGlyph(this.info.get_symbolic_icon_name());
      if (hasTemp && glyph) this.last = { glyph, celsius, receivedAt: Date.now() };
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }
}
