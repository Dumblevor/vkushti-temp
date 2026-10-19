// Seeds demo profiles across Europe plus a ready-made demo account
// (demo@spotter.eu / spotter-demo). Safe to re-run: it replaces earlier demo data.
import { join, resolve } from 'node:path';
import { CITIES, GOALS, LEVELS, SPORT_IDS, TRAINING_TIMES, type Gender } from '../shared/catalog.js';
import { HOUR, MOVE_WINDOW_MS } from '../shared/rules.js';
import { openDb, tx, type DB } from './db.js';
import { newId, POLICY_VERSION } from './repo.js';
import { hashPassword } from './security.js';
import { DEMO_EMAIL } from './routes/auth.js';

const NAMES: Record<string, Record<Gender, string[]>> = {
  DE: {
    woman: ['Mia', 'Hannah', 'Sophie', 'Johanna', 'Clara', 'Paula', 'Greta', 'Emilia', 'Frieda', 'Ronja', 'Nele', 'Marie'],
    man: ['Jonas', 'Felix', 'Moritz', 'Niklas', 'Lukas', 'Paul', 'Leon', 'Maximilian', 'Tim', 'Jan', 'Finn', 'Julian', 'Ben', 'Elias', 'Tobias', 'Simon', 'Anton', 'Henrik', 'Mats', 'Ole', 'Jakob', 'Vincent', 'Noah', 'Emil'],
    nonbinary: ['Alex', 'Kim', 'Robin', 'Charlie', 'Sascha'],
  },
  FR: { woman: ['Camille', 'Léa', 'Chloé', 'Manon', 'Inès', 'Juliette'], man: ['Louis', 'Hugo', 'Théo', 'Antoine', 'Raphaël', 'Julien'], nonbinary: ['Sacha', 'Dominique'] },
  ES: { woman: ['Lucía', 'Martina', 'Carmen', 'Alba', 'Nerea', 'Elena'], man: ['Pablo', 'Javier', 'Álvaro', 'Diego', 'Mario', 'Adrián'], nonbinary: ['Alex', 'Cris'] },
  IT: { woman: ['Giulia', 'Chiara', 'Francesca', 'Alessia', 'Elisa'], man: ['Lorenzo', 'Matteo', 'Marco', 'Davide', 'Tommaso'], nonbinary: ['Celeste', 'Andrea'] },
  NL: { woman: ['Fleur', 'Sanne', 'Lotte', 'Iris'], man: ['Daan', 'Bram', 'Thijs', 'Ruben'], nonbinary: ['Sam', 'Kris'] },
  AT: { woman: ['Lena', 'Valentina', 'Magdalena'], man: ['Florian', 'Stefan', 'Lorenz'], nonbinary: ['Kai'] },
  CH: { woman: ['Noemi', 'Lara', 'Alina'], man: ['Luca', 'Nico', 'Gian'], nonbinary: ['Robin'] },
  PT: { woman: ['Beatriz', 'Inês', 'Mariana'], man: ['João', 'Tiago', 'Duarte'], nonbinary: ['Ariel'] },
  DK: { woman: ['Freja', 'Ida', 'Karla'], man: ['Mads', 'Frederik', 'Magnus'], nonbinary: ['Nor'] },
  SE: { woman: ['Elsa', 'Astrid', 'Ebba', 'Saga'], man: ['Oscar', 'Erik', 'Axel', 'Viktor'], nonbinary: ['Love'] },
  PL: { woman: ['Zofia', 'Oliwia', 'Natalia', 'Wiktoria'], man: ['Jakub', 'Kacper', 'Filip', 'Michał'], nonbinary: ['Ola'] },
  CZ: { woman: ['Tereza', 'Eliška', 'Kateřina'], man: ['Vojtěch', 'Tomáš', 'Ondřej'], nonbinary: ['Saša'] },
  HU: { woman: ['Hanna', 'Zsófia', 'Luca'], man: ['Bence', 'Máté', 'Levente'], nonbinary: ['Noa'] },
  BG: { woman: ['Йоана', 'Ралица', 'Десислава', 'Гергана'], man: ['Калоян', 'Георги', 'Николай', 'Стоян'], nonbinary: ['Сашо'] },
  IE: { woman: ['Aoife', 'Niamh', 'Saoirse'], man: ['Cian', 'Oisín', 'Darragh'], nonbinary: ['Rory'] },
  GB: { woman: ['Ellie', 'Freya', 'Isla'], man: ['Harry', 'Alfie', 'Callum'], nonbinary: ['Jamie'] },
  BE: { woman: ['Louise', 'Elise', 'Marthe'], man: ['Arthur', 'Jules', 'Wout'], nonbinary: ['Noor'] },
};

const BIOS = [
  'Marathon PB hunter. Will trade pacing duties for pasta.',
  'Bouldering three times a week — there is chalk on everything I own.',
  'Morning swims, evening espresso. Looking for someone to drag me to leg day.',
  'Ex-footballer, current padel addict. Competitive, but I’ll let you win the first set.',
  'Yoga teacher who secretly loves heavy deadlifts.',
  'Training for my first triathlon and the transitions are lonely.',
  'Weekend hiker, weekday lifter. Mountains over beaches, fight me.',
  'Bike commuter turned gravel nerd. Coffee stops are mandatory.',
  'Calisthenics in the park, sunsets after.',
  'Swing dancer and Sunday runner. I know every bakery on my route.',
  'HIIT before work so I can be nice to people. Works most days.',
  'Rowing club, early alarms, big breakfasts.',
  'Climber looking for a belay partner — and maybe more.',
  'Recovering couch potato, eight months into lifting. Very proud of my first 100 kg deadlift.',
  'Ski instructor in winter, trail runner in summer.',
  'Pilates, long walks and good wine. Balance is a training goal.',
  'Boxing keeps me sane. Very gentle outside the ring, promise.',
  'Surf trips whenever the forecast says so.',
];

const LOCAL_BIOS: Record<string, string[]> = {
  DE: ['Laufe jeden Morgen an der Spree. Suche jemanden, der mithält – oder mich überholt.', 'Bouldern, Brezeln, Biergarten. In der Reihenfolge.'],
  FR: ['Course à pied le matin, croissant le dimanche. L’équilibre, quoi.'],
  ES: ['Pádel los martes, montaña los findes. ¿Te apuntas?'],
  IT: ['Ciclismo, espresso e salite impossibili. Cerco compagna/o di allenamento.'],
  PL: ['Biegam, pływam, gotuję. Szukam kogoś na wspólne treningi i śniadania.'],
  BG: ['Катеря се през уикенда, тичам през седмицата. Витоша е моята фитнес зала.'],
  NL: ['Fietsen in de regen is ook gewoon training.'],
};

const IDEAS = [
  'Sunrise run, then a bakery breakfast',
  'Bouldering session followed by dumplings',
  'Park workout and a picnic',
  'Padel doubles — losers buy the drinks',
  'Lake swim, then a beer garden',
  'Gravel ride to a lakeside café',
  'Yoga in the park, then flat whites',
  'Hike to a viewpoint, sandwiches at the top',
  'Leg day. Honestly. Then pizza.',
];

const BERLIN_SPOTS = ['Boulderhalle in Kreuzberg', 'Tempelhofer Feld', 'Running club in Mitte', 'Calisthenics park in Friedrichshain', 'Rowing club at the Müggelsee', ''];

const CITY_PLAN: [string, number][] = [
  ['berlin', 30], ['munich', 5], ['hamburg', 4], ['paris', 6], ['lyon', 3], ['madrid', 5], ['barcelona', 6], ['rome', 4],
  ['milan', 4], ['amsterdam', 5], ['vienna', 5], ['zurich', 3], ['lisbon', 4], ['copenhagen', 4], ['stockholm', 4],
  ['warsaw', 4], ['krakow', 3], ['prague', 4], ['budapest', 3], ['sofia', 5], ['dublin', 3], ['london', 4], ['brussels', 3],
];

// Deterministic PRNG so every seed produces the same people.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seed(db: DB, now = Date.now()) {
  const rand = mulberry32(20261019);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const sample = <T,>(xs: readonly T[], n: number) => [...xs].sort(() => rand() - 0.5).slice(0, n);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const birthdate = (age: number) => `${new Date(now).getUTCFullYear() - age}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;

  const insertUser = db.prepare(
    `INSERT INTO users (id, email, password_hash, name, birthdate, gender, interested_in, city_id, bio, training_times,
       frequency, goals, gym, workout_idea, age_min, age_max, max_distance_km, language, onboarded, verified, is_demo,
       created_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  );
  const insertSport = db.prepare('INSERT INTO user_sports (user_id, sport, level, position) VALUES (?, ?, ?, ?)');
  const insertConsent = db.prepare('INSERT INTO consents (user_id, kind, granted, policy_version, at) VALUES (?, ?, 1, ?, ?)');
  const consentAll = (id: string) =>
    ['terms', 'privacy', 'sensitive'].forEach((k) => insertConsent.run(id, k, POLICY_VERSION, now));

  const passwordHash = await hashPassword('spotter-demo');

  return tx(db, () => {
    db.prepare('DELETE FROM users WHERE is_demo = 1 OR email = ?').run(DEMO_EMAIL);

    // ---- the account you log in with -----------------------------------------
    const lena = newId();
    insertUser.run(
      lena, DEMO_EMAIL, passwordHash, 'Lena', birthdate(31), 'woman', JSON.stringify(['man']), 'berlin',
      'Physio by day, trail runner by weekend. Happiest on a long run that ends at a bakery. Currently learning to boulder without screaming.',
      JSON.stringify(['early', 'weekend']), 5, JSON.stringify(['endurance', 'outdoors', 'social']),
      'Boulderhalle in Kreuzberg', 'Sunrise 10k along the Spree, then breakfast', 26, 40, 50, 'en', 0, 0, now, now,
    );
    [['running', 'advanced'], ['climbing', 'beginner'], ['yoga', 'regular']].forEach(([s, l], i) => insertSport.run(lena, s, l, i));
    consentAll(lena);

    // ---- demo profiles ---------------------------------------------------------
    const bots: { id: string; name: string; gender: Gender; city: string }[] = [];
    for (const [cityId, count] of CITY_PLAN) {
      const city = CITIES.find((c) => c.id === cityId)!;
      const pool = NAMES[city.country] ?? NAMES.GB;
      // Shuffled per city and handed out in order, so names only repeat once a pool runs out.
      const queues = { woman: sample(pool.woman, 99), man: sample(pool.man, 99), nonbinary: sample(pool.nonbinary, 99) };
      const counters = { woman: 0, man: 0, nonbinary: 0 };
      for (let i = 0; i < count; i++) {
        // Berlin is weighted towards men into women so the demo account has a full deck.
        const gender: Gender =
          cityId === 'berlin' ? (i < 22 ? 'man' : i < 27 ? 'woman' : 'nonbinary') : pick(['woman', 'woman', 'man', 'man', 'nonbinary'] as const);
        const name = queues[gender][counters[gender]++ % queues[gender].length];
        const interestedIn: Gender[] =
          gender === 'man' ? (rand() < 0.85 ? ['woman'] : ['woman', 'man']) :
          gender === 'woman' ? (rand() < 0.75 ? ['man'] : rand() < 0.5 ? ['woman'] : ['man', 'woman', 'nonbinary']) :
          sample(['woman', 'man', 'nonbinary'] as const, int(1, 3));
        if (cityId === 'berlin' && gender === 'nonbinary' && !interestedIn.includes('woman')) interestedIn.push('woman');

        const age = cityId === 'berlin' && gender === 'man' ? int(27, 39) : int(22, 44);
        const sports = sample(SPORT_IDS, int(2, 4));
        const bio = LOCAL_BIOS[city.country] && rand() < 0.3 ? pick(LOCAL_BIOS[city.country]) : pick(BIOS);
        const id = newId();
        insertUser.run(
          id, null, null, name, birthdate(age), gender, JSON.stringify(interestedIn), cityId, bio,
          JSON.stringify(sample(TRAINING_TIMES, int(1, 3))), int(2, 7), JSON.stringify(sample(GOALS, int(1, 3))),
          cityId === 'berlin' ? pick(BERLIN_SPOTS) : '', pick(IDEAS), 20, 50, 100, 'en', rand() < 0.4 ? 1 : 0, 1,
          now - int(1, 60) * 24 * HOUR, now - int(0, 120) * HOUR,
        );
        sports.forEach((s, j) => insertSport.run(id, s, pick(LEVELS), j));
        consentAll(id);
        bots.push({ id, name, gender, city: cityId });
      }
    }

    // ---- give Lena an inbox with every match state ------------------------------
    const berlinMen = bots.filter((b) => b.city === 'berlin' && b.gender === 'man');
    const swipe = db.prepare('INSERT INTO swipes (swiper_id, target_id, action, note, created_at) VALUES (?, ?, ?, ?, ?)');
    const match = (bot: string, createdAgoH: number) => {
      const id = newId();
      const [a, b] = [lena, bot].sort();
      swipe.run(lena, bot, 'like', '', now - createdAgoH * HOUR);
      swipe.run(bot, lena, 'like', '', now - (createdAgoH + 3) * HOUR);
      db.prepare(
        'INSERT INTO matches (id, user_a, user_b, first_move_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, a, b, lena, now - createdAgoH * HOUR + MOVE_WINDOW_MS, now - createdAgoH * HOUR);
      return id;
    };
    const msg = db.prepare('INSERT INTO messages (id, match_id, sender_id, kind, body, invite, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

    const [fresh, urgent, chatting, waiting, ...rest] = berlinMen;
    match(fresh.id, 2);
    match(urgent.id, 21);

    const chat = match(chatting.id, 30);
    const t0 = now - 29 * HOUR;
    msg.run(newId(), chat, lena, 'text', 'Okay, I have to ask — is the rowing club as early as it sounds?', null, t0, t0);
    msg.run(newId(), chat, chatting.id, 'text', 'Worse. 6:15 on the water. But the sunrise on the Müggelsee is worth it 🌅', null, t0 + 2 * HOUR, t0 + 3 * HOUR);
    msg.run(newId(), chat, lena, 'text', 'Respect. I’m more of a sunrise *run* person. Climbing is my new thing though, still terrified of the top.', null, t0 + 3 * HOUR, t0 + 3 * HOUR);
    msg.run(newId(), chat, chatting.id, 'text', 'I could spot you on the bouldering wall — I promise to be very encouraging.', null, now - 50 * 60_000, null);
    msg.run(
      newId(), chat, chatting.id, 'invite', 'Thursday after work?',
      JSON.stringify({ sport: 'climbing', place: 'Boulderhalle in Kreuzberg', startsAt: nextWeekdayAt(now, 4, 19), status: 'pending' }),
      now - 45 * 60_000, null,
    );
    db.prepare('UPDATE matches SET first_message_by = ?, replied_at = ?, expires_at = NULL WHERE id = ?').run(lena, t0 + 2 * HOUR, chat);

    const wait = match(waiting.id, 9);
    msg.run(newId(), wait, lena, 'text', 'A fellow trail runner! Which route is your favourite around Berlin?', null, now - 5 * HOUR, null);
    db.prepare('UPDATE matches SET first_message_by = ?, expires_at = ? WHERE id = ?').run(lena, now - 5 * HOUR + MOVE_WINDOW_MS, wait);

    // A few people have already liked Lena; one sent a Spot request.
    rest.slice(0, 9).forEach((b, i) =>
      swipe.run(b.id, lena, i === 0 ? 'spot' : 'like', i === 0 ? 'Saw you run the Spree loop — fancy a sunrise 10k on Saturday?' : '', now - i * HOUR),
    );

    return { demoUserId: lena, bots: bots.length };
  });
}

/** Epoch ms of the next given weekday (0 = Sunday) at hh:00 local time, at least a day away. */
function nextWeekdayAt(now: number, weekday: number, hour: number) {
  const d = new Date(now + 24 * HOUR);
  d.setHours(hour, 0, 0, 0);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d.getTime();
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed.ts')) {
  const dataDir = resolve(process.env.DATA_DIR ?? 'data');
  const result = await seed(openDb(join(dataDir, 'spotter.db')));
  console.log(`Seeded ${result.bots} demo profiles. Log in with ${DEMO_EMAIL} / spotter-demo (or use "Try the demo").`);
}
