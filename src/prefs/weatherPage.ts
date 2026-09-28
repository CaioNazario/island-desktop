import Adw from 'gi://Adw';
import type Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GWeather from 'gi://GWeather?version=4.0';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
  CITY_QUERY_MIN_LENGTH,
  searchCities,
  type CityCandidate,
  type IndexedCity,
} from '../core/citySearch.js';
import {
  clearPreferredLocation,
  GNOME_WEATHER_SCHEMAS,
  LOCATION_SCHEMA,
  lookupSettings,
  readGnomeLocation,
  readPreferredLocation,
  writePreferredLocation,
} from '../system/weatherLocation.js';
import { indexWorldCities } from './cityIndex.js';
import { connectWhileOpen } from './lifetime.js';

interface CurrentCity {
  title: string;
  origin: string;
  chosenHere: boolean;
}

interface ChainSettings {
  island: Gio.Settings;
  gnome: Gio.Settings[];
  location: Gio.Settings | null;
}

const cityName = (location: GWeather.Location): string =>
  location.get_city_name() ?? location.get_name() ?? '';

// Mesma cadeia da extensão (specs/07-clima.md). No passo do Geoclue a janela
// não sabe a cidade que a extensão achou e mostra só "Automática".
function currentCity(world: GWeather.Location | null, chain: ChainSettings): CurrentCity {
  const preferred = readPreferredLocation(world, chain.island);
  if (preferred)
    return { title: cityName(preferred), origin: _('Escolhida aqui'), chosenHere: true };
  const gnome = readGnomeLocation(world, chain.gnome);
  if (gnome) return { title: cityName(gnome), origin: _('Do GNOME'), chosenHere: false };
  if (chain.location?.get_boolean('enabled'))
    return { title: _('Automática'), origin: _('Localização do sistema'), chosenHere: false };
  return { title: _('Nenhuma'), origin: _('Sem cidade, o clima não aparece'), chosenHere: false };
}

function buildCurrentGroup(
  world: GWeather.Location | null,
  chain: ChainSettings,
  window: Gtk.Window,
): Adw.PreferencesGroup {
  const clear = new Gtk.Button({ label: _('Limpar'), valign: Gtk.Align.CENTER });
  clear.connect('clicked', () => clearPreferredLocation(chain.island));
  const row = new Adw.ActionRow({ use_markup: false });
  row.add_suffix(clear);
  const sync = () => {
    const current = currentCity(world, chain);
    row.title = current.title;
    row.subtitle = current.origin;
    clear.visible = current.chosenHere;
  };
  sync();
  connectWhileOpen(window, chain.island, 'changed::weather-location', sync);
  for (const s of chain.gnome) connectWhileOpen(window, s, 'changed::locations', sync);
  if (chain.location) connectWhileOpen(window, chain.location, 'changed::enabled', sync);

  const group = new Adw.PreferencesGroup({ title: _('Cidade atual') });
  group.add(row);
  return group;
}

function resultRow(city: CityCandidate<GWeather.Location>, onPick: () => void): Adw.ActionRow {
  const row = new Adw.ActionRow({
    title: city.name,
    subtitle: [city.region, city.country].filter(Boolean).join(', '),
    use_markup: false,
    activatable: true,
  });
  row.connect('activated', onPick);
  return row;
}

function buildSearchGroup(world: GWeather.Location | null, settings: Gio.Settings) {
  const group = new Adw.PreferencesGroup({ title: _('Escolher cidade') });
  const entry = new Adw.EntryRow({ title: _('Buscar cidade') });
  group.add(entry);
  // O banco tem milhares de cidades: só monta o índice na primeira busca.
  let index: IndexedCity<GWeather.Location>[] | null = null;
  let rows: Gtk.Widget[] = [];
  entry.connect('changed', () => {
    rows.forEach((r) => group.remove(r));
    index ??= world ? indexWorldCities(world) : [];
    const pick = (city: CityCandidate<GWeather.Location>) => () => {
      writePreferredLocation(settings, city.location);
      entry.text = '';
    };
    rows = searchCities(index, entry.text).map((city) => resultRow(city, pick(city)));
    if (rows.length === 0 && entry.text.trim().length >= CITY_QUERY_MIN_LENGTH)
      rows = [new Adw.ActionRow({ title: _('Nenhuma cidade encontrada') })];
    rows.forEach((r) => group.add(r));
  });
  return group;
}

// specs/13-preferencias.md "Clima".
export function buildWeatherPage(settings: Gio.Settings, window: Gtk.Window): Adw.PreferencesPage {
  const world = GWeather.Location.get_world();
  const chain: ChainSettings = {
    island: settings,
    gnome: GNOME_WEATHER_SCHEMAS.map(lookupSettings).filter((s): s is Gio.Settings => s !== null),
    location: lookupSettings(LOCATION_SCHEMA),
  };
  const page = new Adw.PreferencesPage({
    name: 'weather',
    title: _('Clima'),
    icon_name: 'weather-few-clouds-symbolic',
  });
  page.add(buildCurrentGroup(world, chain, window));
  page.add(buildSearchGroup(world, settings));
  return page;
}
