// Reference data shared by the API and the web app. Display labels live in the
// web app's i18n dictionaries; this file only holds stable ids.

export const GENDERS = ['woman', 'man', 'nonbinary'] as const;
export type Gender = (typeof GENDERS)[number];

export const SPORTS = [
  { id: 'running', emoji: '🏃' },
  { id: 'strength', emoji: '🏋️' },
  { id: 'hiit', emoji: '🔥' },
  { id: 'fitness_racing', emoji: '🏁' },
  { id: 'climbing', emoji: '🧗' },
  { id: 'cycling', emoji: '🚴' },
  { id: 'swimming', emoji: '🏊' },
  { id: 'triathlon', emoji: '🏅' },
  { id: 'yoga', emoji: '🧘' },
  { id: 'pilates', emoji: '🩰' },
  { id: 'calisthenics', emoji: '🤸' },
  { id: 'martial_arts', emoji: '🥊' },
  { id: 'tennis', emoji: '🎾' },
  { id: 'padel', emoji: '🏓' },
  { id: 'football', emoji: '⚽' },
  { id: 'basketball', emoji: '🏀' },
  { id: 'volleyball', emoji: '🏐' },
  { id: 'rowing', emoji: '🚣' },
  { id: 'hiking', emoji: '🥾' },
  { id: 'skiing', emoji: '⛷️' },
  { id: 'surfing', emoji: '🏄' },
  { id: 'dance', emoji: '💃' },
] as const;
export type SportId = (typeof SPORTS)[number]['id'];
export const SPORT_IDS = SPORTS.map((s) => s.id) as SportId[];
export const sportEmoji = (id: string) => SPORTS.find((s) => s.id === id)?.emoji ?? '💪';

export const LEVELS = ['beginner', 'regular', 'advanced', 'competitive'] as const;
export type Level = (typeof LEVELS)[number];

export const TRAINING_TIMES = ['early', 'midday', 'evening', 'weekend'] as const;
export type TrainingTime = (typeof TRAINING_TIMES)[number];

export const GOALS = ['strength', 'endurance', 'mobility', 'competition', 'social', 'outdoors', 'balance'] as const;
export type Goal = (typeof GOALS)[number];

export const REPORT_REASONS = ['fake', 'photos', 'harassment', 'underage', 'scam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'pl', 'bg'] as const;
export type Language = (typeof LANGUAGES)[number];

export const MAX_SPORTS = 6;
export const MAX_PHOTOS = 6;
export const MIN_AGE = 18;
/** Max distance value meaning "anywhere in Europe". */
export const ANYWHERE_KM = 0;

export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

// Location is stored at city granularity on purpose: we never collect precise GPS.
export const CITIES: City[] = [
  { id: 'berlin', name: 'Berlin', country: 'DE', lat: 52.52, lng: 13.405 },
  { id: 'hamburg', name: 'Hamburg', country: 'DE', lat: 53.551, lng: 9.994 },
  { id: 'munich', name: 'München', country: 'DE', lat: 48.137, lng: 11.575 },
  { id: 'cologne', name: 'Köln', country: 'DE', lat: 50.938, lng: 6.96 },
  { id: 'frankfurt', name: 'Frankfurt', country: 'DE', lat: 50.11, lng: 8.682 },
  { id: 'stuttgart', name: 'Stuttgart', country: 'DE', lat: 48.776, lng: 9.183 },
  { id: 'dusseldorf', name: 'Düsseldorf', country: 'DE', lat: 51.227, lng: 6.773 },
  { id: 'leipzig', name: 'Leipzig', country: 'DE', lat: 51.34, lng: 12.375 },
  { id: 'paris', name: 'Paris', country: 'FR', lat: 48.857, lng: 2.352 },
  { id: 'lyon', name: 'Lyon', country: 'FR', lat: 45.764, lng: 4.836 },
  { id: 'marseille', name: 'Marseille', country: 'FR', lat: 43.297, lng: 5.369 },
  { id: 'bordeaux', name: 'Bordeaux', country: 'FR', lat: 44.838, lng: -0.579 },
  { id: 'toulouse', name: 'Toulouse', country: 'FR', lat: 43.605, lng: 1.444 },
  { id: 'nice', name: 'Nice', country: 'FR', lat: 43.71, lng: 7.262 },
  { id: 'lille', name: 'Lille', country: 'FR', lat: 50.629, lng: 3.057 },
  { id: 'madrid', name: 'Madrid', country: 'ES', lat: 40.417, lng: -3.704 },
  { id: 'barcelona', name: 'Barcelona', country: 'ES', lat: 41.385, lng: 2.173 },
  { id: 'valencia', name: 'València', country: 'ES', lat: 39.47, lng: -0.376 },
  { id: 'seville', name: 'Sevilla', country: 'ES', lat: 37.389, lng: -5.984 },
  { id: 'malaga', name: 'Málaga', country: 'ES', lat: 36.721, lng: -4.421 },
  { id: 'bilbao', name: 'Bilbao', country: 'ES', lat: 43.263, lng: -2.935 },
  { id: 'rome', name: 'Roma', country: 'IT', lat: 41.903, lng: 12.496 },
  { id: 'milan', name: 'Milano', country: 'IT', lat: 45.464, lng: 9.19 },
  { id: 'turin', name: 'Torino', country: 'IT', lat: 45.07, lng: 7.687 },
  { id: 'naples', name: 'Napoli', country: 'IT', lat: 40.852, lng: 14.268 },
  { id: 'bologna', name: 'Bologna', country: 'IT', lat: 44.494, lng: 11.343 },
  { id: 'florence', name: 'Firenze', country: 'IT', lat: 43.77, lng: 11.256 },
  { id: 'amsterdam', name: 'Amsterdam', country: 'NL', lat: 52.368, lng: 4.904 },
  { id: 'rotterdam', name: 'Rotterdam', country: 'NL', lat: 51.924, lng: 4.478 },
  { id: 'utrecht', name: 'Utrecht', country: 'NL', lat: 52.091, lng: 5.122 },
  { id: 'the_hague', name: 'Den Haag', country: 'NL', lat: 52.07, lng: 4.3 },
  { id: 'brussels', name: 'Bruxelles / Brussel', country: 'BE', lat: 50.85, lng: 4.352 },
  { id: 'antwerp', name: 'Antwerpen', country: 'BE', lat: 51.219, lng: 4.402 },
  { id: 'ghent', name: 'Gent', country: 'BE', lat: 51.054, lng: 3.717 },
  { id: 'luxembourg', name: 'Luxembourg', country: 'LU', lat: 49.611, lng: 6.13 },
  { id: 'vienna', name: 'Wien', country: 'AT', lat: 48.208, lng: 16.373 },
  { id: 'graz', name: 'Graz', country: 'AT', lat: 47.071, lng: 15.439 },
  { id: 'innsbruck', name: 'Innsbruck', country: 'AT', lat: 47.269, lng: 11.404 },
  { id: 'zurich', name: 'Zürich', country: 'CH', lat: 47.377, lng: 8.541 },
  { id: 'geneva', name: 'Genève', country: 'CH', lat: 46.204, lng: 6.143 },
  { id: 'basel', name: 'Basel', country: 'CH', lat: 47.56, lng: 7.589 },
  { id: 'lisbon', name: 'Lisboa', country: 'PT', lat: 38.722, lng: -9.139 },
  { id: 'porto', name: 'Porto', country: 'PT', lat: 41.158, lng: -8.629 },
  { id: 'dublin', name: 'Dublin', country: 'IE', lat: 53.35, lng: -6.26 },
  { id: 'cork', name: 'Cork', country: 'IE', lat: 51.899, lng: -8.476 },
  { id: 'london', name: 'London', country: 'GB', lat: 51.507, lng: -0.128 },
  { id: 'manchester', name: 'Manchester', country: 'GB', lat: 53.48, lng: -2.242 },
  { id: 'edinburgh', name: 'Edinburgh', country: 'GB', lat: 55.953, lng: -3.188 },
  { id: 'copenhagen', name: 'København', country: 'DK', lat: 55.676, lng: 12.568 },
  { id: 'aarhus', name: 'Aarhus', country: 'DK', lat: 56.163, lng: 10.204 },
  { id: 'stockholm', name: 'Stockholm', country: 'SE', lat: 59.329, lng: 18.069 },
  { id: 'gothenburg', name: 'Göteborg', country: 'SE', lat: 57.709, lng: 11.975 },
  { id: 'malmo', name: 'Malmö', country: 'SE', lat: 55.605, lng: 13.004 },
  { id: 'oslo', name: 'Oslo', country: 'NO', lat: 59.914, lng: 10.752 },
  { id: 'bergen', name: 'Bergen', country: 'NO', lat: 60.391, lng: 5.322 },
  { id: 'helsinki', name: 'Helsinki', country: 'FI', lat: 60.17, lng: 24.938 },
  { id: 'reykjavik', name: 'Reykjavík', country: 'IS', lat: 64.147, lng: -21.942 },
  { id: 'tallinn', name: 'Tallinn', country: 'EE', lat: 59.437, lng: 24.754 },
  { id: 'riga', name: 'Rīga', country: 'LV', lat: 56.95, lng: 24.105 },
  { id: 'vilnius', name: 'Vilnius', country: 'LT', lat: 54.687, lng: 25.28 },
  { id: 'warsaw', name: 'Warszawa', country: 'PL', lat: 52.23, lng: 21.012 },
  { id: 'krakow', name: 'Kraków', country: 'PL', lat: 50.065, lng: 19.945 },
  { id: 'wroclaw', name: 'Wrocław', country: 'PL', lat: 51.108, lng: 17.039 },
  { id: 'gdansk', name: 'Gdańsk', country: 'PL', lat: 54.352, lng: 18.646 },
  { id: 'prague', name: 'Praha', country: 'CZ', lat: 50.076, lng: 14.438 },
  { id: 'brno', name: 'Brno', country: 'CZ', lat: 49.195, lng: 16.607 },
  { id: 'bratislava', name: 'Bratislava', country: 'SK', lat: 48.149, lng: 17.107 },
  { id: 'budapest', name: 'Budapest', country: 'HU', lat: 47.498, lng: 19.04 },
  { id: 'ljubljana', name: 'Ljubljana', country: 'SI', lat: 46.056, lng: 14.506 },
  { id: 'zagreb', name: 'Zagreb', country: 'HR', lat: 45.815, lng: 15.982 },
  { id: 'split', name: 'Split', country: 'HR', lat: 43.508, lng: 16.44 },
  { id: 'bucharest', name: 'București', country: 'RO', lat: 44.427, lng: 26.103 },
  { id: 'cluj', name: 'Cluj-Napoca', country: 'RO', lat: 46.771, lng: 23.624 },
  { id: 'sofia', name: 'София', country: 'BG', lat: 42.698, lng: 23.322 },
  { id: 'plovdiv', name: 'Пловдив', country: 'BG', lat: 42.135, lng: 24.745 },
  { id: 'varna', name: 'Варна', country: 'BG', lat: 43.214, lng: 27.915 },
  { id: 'athens', name: 'Αθήνα', country: 'GR', lat: 37.984, lng: 23.728 },
  { id: 'thessaloniki', name: 'Θεσσαλονίκη', country: 'GR', lat: 40.64, lng: 22.944 },
  { id: 'nicosia', name: 'Nicosia', country: 'CY', lat: 35.186, lng: 33.382 },
  { id: 'valletta', name: 'Valletta', country: 'MT', lat: 35.899, lng: 14.514 },
];

export const cityById = (id: string | null | undefined) => CITIES.find((c) => c.id === id);

/** Great-circle distance in km between two cities. */
export function distanceKm(a: City, b: City): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}
