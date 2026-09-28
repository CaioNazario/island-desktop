import GWeather from 'gi://GWeather?version=4.0';

import { buildCityIndex, type IndexedCity } from '../core/citySearch.js';

type WeatherCity = GWeather.Location;

// Achata o banco do GWeather (mundo → região → país → estado → cidade) nas
// cidades; estado e país vêm dos ancestrais.
export function indexWorldCities(world: GWeather.Location): IndexedCity<WeatherCity>[] {
  const cities: WeatherCity[] = [];
  const pending: GWeather.Location[] = [world];
  for (let node = pending.pop(); node; node = pending.pop()) {
    for (let child = node.next_child(null); child; child = node.next_child(child)) {
      if (child.get_level() === GWeather.LocationLevel.CITY) cities.push(child);
      else pending.push(child);
    }
  }
  return buildCityIndex(cities.map(toCandidate));
}

function toCandidate(city: WeatherCity) {
  const parent = city.get_parent();
  const inState = parent?.get_level() === GWeather.LocationLevel.ADM1;
  return {
    name: city.get_name() ?? '',
    region: inState ? (parent.get_name() ?? '') : '',
    country: city.get_country_name() ?? '',
    location: city,
  };
}
