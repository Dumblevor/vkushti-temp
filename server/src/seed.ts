// Seeds demo profiles across Europe plus a ready-made demo account
// (demo@spotter.eu / spotter-demo). Safe to re-run: it replaces earlier demo data.
import { Types } from 'mongoose';
import { CITIES, GOALS, LEVELS, SPORT_IDS, TRAINING_TIMES, type Gender, type Goal, type Level, type SportId, type TrainingTime } from '@spotter/shared/catalog';
import { HOUR, MOVE_WINDOW_MS } from '@spotter/shared/rules';
import { POLICY_VERSION } from './dto.js';
import { MatchModel, MessageModel, SwipeModel, UserModel, type Match, type Message, type Swipe, type User } from './models.js';
import { DEMO_EMAIL } from './routes/auth.js';
import { deleteAccount } from './services.js';
import { hashPassword } from './security.js';

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

export async function seed(now = Date.now()) {
  const rand = mulberry32(20261019);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const sample = <T,>(xs: readonly T[], n: number) => [...xs].sort(() => rand() - 0.5).slice(0, n);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const birthdate = (age: number) => new Date(Date.UTC(new Date(now).getUTCFullYear() - age, int(0, 11), int(1, 28)));
  const at = (msAgo: number) => new Date(now - msAgo);
  const consents = (): User['consents'] =>
    (['terms', 'privacy', 'sensitive'] as const).map((kind) => ({ kind, granted: true, policyVersion: POLICY_VERSION, at: new Date(now) }));
  const cityFields = (cityId: string) => {
    const c = CITIES.find((x) => x.id === cityId)!;
    return { cityId, location: { type: 'Point' as const, coordinates: [c.lng, c.lat] as [number, number] } };
  };

  // Remove earlier demo data (cascading to matches, messages and swipes).
  const ctx = { uploadsDir: '/nonexistent', now: () => now } as Parameters<typeof deleteAccount>[0];
  for (const old of await UserModel.find({ $or: [{ isDemo: true }, { email: DEMO_EMAIL }] }).lean<User[]>()) {
    await deleteAccount(ctx, { ...old, photos: [] });
  }

  // ---- the account you log in with -------------------------------------------
  const lena = new Types.ObjectId();
  const users: Partial<User>[] = [
    {
      _id: lena,
      email: DEMO_EMAIL,
      passwordHash: await hashPassword('spotter-demo'),
      name: 'Lena',
      birthdate: birthdate(31),
      gender: 'woman',
      interestedIn: ['man'],
      ...cityFields('berlin'),
      bio: 'Physio by day, trail runner by weekend. Happiest on a long run that ends at a bakery. Currently learning to boulder without screaming.',
      sports: [
        { id: 'running', level: 'advanced' },
        { id: 'climbing', level: 'beginner' },
        { id: 'yoga', level: 'regular' },
      ],
      trainingTimes: ['early', 'weekend'],
      frequency: 5,
      goals: ['endurance', 'outdoors', 'social'],
      gym: 'Boulderhalle in Kreuzberg',
      workoutIdea: 'Sunrise 10k along the Spree, then breakfast',
      photos: [],
      consents: consents(),
      prefs: { ageMin: 26, ageMax: 40, maxDistanceKm: 50, language: 'en' },
      onboarded: true,
      snoozed: false,
      verified: false,
      isDemo: false,
      createdAt: at(0),
      lastActiveAt: at(0),
    },
  ];

  // ---- demo profiles ------------------------------------------------------------
  const bots: { id: Types.ObjectId; gender: Gender; city: string }[] = [];
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
      const id = new Types.ObjectId();
      users.push({
        _id: id,
        name,
        birthdate: birthdate(age),
        gender,
        interestedIn,
        ...cityFields(cityId),
        bio: LOCAL_BIOS[city.country] && rand() < 0.3 ? pick(LOCAL_BIOS[city.country]) : pick(BIOS),
        sports: sample(SPORT_IDS, int(2, 4)).map((s: SportId) => ({ id: s, level: pick(LEVELS) as Level })),
        trainingTimes: sample(TRAINING_TIMES, int(1, 3)) as TrainingTime[],
        frequency: int(2, 7),
        goals: sample(GOALS, int(1, 3)) as Goal[],
        gym: cityId === 'berlin' ? pick(BERLIN_SPOTS) : '',
        workoutIdea: pick(IDEAS),
        photos: [],
        consents: consents(),
        prefs: { ageMin: 20, ageMax: 50, maxDistanceKm: 100, language: 'en' },
        onboarded: true,
        snoozed: false,
        verified: rand() < 0.4,
        isDemo: true,
        createdAt: at(int(1, 60) * 24 * HOUR),
        lastActiveAt: at(int(0, 120) * HOUR),
      });
      bots.push({ id, gender, city: cityId });
    }
  }
  await UserModel.insertMany(users);

  // ---- give Lena an inbox with every match state ----------------------------------
  const swipes: Partial<Swipe>[] = [];
  const matches: Partial<Match>[] = [];
  const messages: Partial<Message>[] = [];
  const match = (bot: Types.ObjectId, createdAgoH: number, extra: Partial<Match> = {}) => {
    const _id = new Types.ObjectId();
    const [userA, userB] = [lena, bot].sort((a, b) => a.toString().localeCompare(b.toString()));
    swipes.push({ swiper: lena, target: bot, action: 'like', note: '', createdAt: at(createdAgoH * HOUR) });
    swipes.push({ swiper: bot, target: lena, action: 'like', note: '', createdAt: at((createdAgoH + 3) * HOUR) });
    matches.push({
      _id, userA, userB, firstMoveBy: lena, firstMessageBy: null, repliedAt: null,
      expiresAt: new Date(now - createdAgoH * HOUR + MOVE_WINDOW_MS), extended: false,
      createdAt: at(createdAgoH * HOUR), lastActivityAt: at(createdAgoH * HOUR), ...extra,
    });
    return _id;
  };
  const msg = (matchId: Types.ObjectId, sender: Types.ObjectId, body: string, agoMs: number, read: boolean, invite: Message['invite'] = null) =>
    messages.push({ match: matchId, sender, kind: invite ? 'invite' : 'text', body, invite, createdAt: at(agoMs), readAt: read ? at(agoMs) : null });

  const berlinMen = bots.filter((b) => b.city === 'berlin' && b.gender === 'man');
  const [fresh, urgent, chatting, waiting, ...rest] = berlinMen;
  match(fresh.id, 2);
  match(urgent.id, 21);

  const t0 = 29 * HOUR;
  const chat = match(chatting.id, 30, { firstMessageBy: lena, repliedAt: at(t0 - 2 * HOUR), expiresAt: null, lastActivityAt: at(45 * 60_000) });
  msg(chat, lena, 'Okay, I have to ask — is the rowing club as early as it sounds?', t0, true);
  msg(chat, chatting.id, 'Worse. 6:15 on the water. But the sunrise on the Müggelsee is worth it 🌅', t0 - 2 * HOUR, true);
  msg(chat, lena, 'Respect. I’m more of a sunrise *run* person. Climbing is my new thing though, still terrified of the top.', t0 - 3 * HOUR, true);
  msg(chat, chatting.id, 'I could spot you on the bouldering wall — I promise to be very encouraging.', 50 * 60_000, false);
  msg(chat, chatting.id, 'Thursday after work?', 45 * 60_000, false, {
    sport: 'climbing', place: 'Boulderhalle in Kreuzberg', startsAt: new Date(nextWeekdayAt(now, 4, 19)), status: 'pending',
  });

  const wait = match(waiting.id, 9, { firstMessageBy: lena, expiresAt: new Date(now - 5 * HOUR + MOVE_WINDOW_MS), lastActivityAt: at(5 * HOUR) });
  msg(wait, lena, 'A fellow trail runner! Which route is your favourite around Berlin?', 5 * HOUR, false);

  // A few people have already liked Lena; one sent a Spot request.
  rest.slice(0, 9).forEach((b, i) =>
    swipes.push({
      swiper: b.id, target: lena, action: i === 0 ? 'spot' : 'like',
      note: i === 0 ? 'Saw you run the Spree loop — fancy a sunrise 10k on Saturday?' : '', createdAt: at(i * HOUR),
    }),
  );

  await Promise.all([SwipeModel.insertMany(swipes), MatchModel.insertMany(matches), MessageModel.insertMany(messages)]);
  return { demoUserId: lena.toString(), bots: bots.length };
}

/** Epoch ms of the next given weekday (0 = Sunday) at hh:00 local time, at least a day away. */
function nextWeekdayAt(now: number, weekday: number, hour: number) {
  const d = new Date(now + 24 * HOUR);
  d.setHours(hour, 0, 0, 0);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d.getTime();
}

if (process.argv[1]?.match(/seed\.(ts|js)$/)) {
  const { config } = await import('./config.js');
  const { connectDb, disconnectDb } = await import('./db.js');
  await connectDb(config.mongoUri);
  const result = await seed();
  console.log(`Seeded ${result.bots} demo profiles. Log in with ${DEMO_EMAIL} / spotter-demo (or use "Try the demo").`);
  await disconnectDb();
}
