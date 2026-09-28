import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type GWeather from 'gi://GWeather?version=4.0';

// Passos 1 e 2 da cadeia de localização (specs/07-clima.md), sem nada do
// Shell, para rodar também fora do processo dele.

const PREFERRED_KEY = 'weather-location';

// Passo 2 da cadeia: as cidades do clima do Shell e do app GNOME Weather.
export const GNOME_WEATHER_SCHEMAS = ['org.gnome.shell.weather', 'org.gnome.Weather'];
export const LOCATION_SCHEMA = 'org.gnome.system.location';

export function lookupSettings(schemaId: string): Gio.Settings | null {
  const schema = Gio.SettingsSchemaSource.get_default()?.lookup(schemaId, true);
  return schema ? new Gio.Settings({ settings_schema: schema }) : null;
}

export function deserializeLocation(
  world: GWeather.Location | null,
  serialized: GLib.Variant,
): GWeather.Location | null {
  try {
    return world?.deserialize(serialized) ?? null;
  } catch (e) {
    console.error(`Island: invalid weather location: ${(e as Error).message}`);
    return null;
  }
}

export function readPreferredLocation(
  world: GWeather.Location | null,
  settings: Gio.Settings,
): GWeather.Location | null {
  // `v` guardando o `serialize()` da cidade; o padrão `@mv nothing` é vazio.
  const stored = settings.get_value(PREFERRED_KEY).get_variant();
  if (stored.is_of_type(new GLib.VariantType('mv'))) return null;
  return deserializeLocation(world, stored);
}

export function writePreferredLocation(settings: Gio.Settings, location: GWeather.Location): void {
  settings.set_value(PREFERRED_KEY, new GLib.Variant('v', location.serialize()));
}

export function clearPreferredLocation(settings: Gio.Settings): void {
  settings.reset(PREFERRED_KEY);
}

export function readGnomeLocation(
  world: GWeather.Location | null,
  gnomeSettings: Gio.Settings[],
): GWeather.Location | null {
  for (const s of gnomeSettings) {
    const locations = s.get_value('locations').deep_unpack() as GLib.Variant[];
    for (const serialized of locations) {
      const location = deserializeLocation(world, serialized);
      if (location) return location;
    }
  }
  return null;
}
