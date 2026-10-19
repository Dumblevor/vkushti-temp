import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { openDb, type DB } from './db.js';
import { HOUR } from '../shared/rules.js';
import type { Gender } from '../shared/catalog.js';
import { stripJpegMetadata } from './security.js';

let app: FastifyInstance;
let db: DB;
let now: number;
let uploads: string;

beforeEach(async () => {
  now = Date.UTC(2026, 9, 19, 12);
  db = openDb(':memory:');
  uploads = mkdtempSync(join(tmpdir(), 'spotter-test-'));
  app = await buildApp({ db, uploadsDir: uploads, now: () => now });
});

afterEach(async () => {
  await app.close();
  rmSync(uploads, { recursive: true, force: true });
});

interface TestUser {
  id: string;
  headers: { cookie: string };
}

async function signup(name: string, gender: Gender, interestedIn: Gender[], extra: Record<string, unknown> = {}): Promise<TestUser> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: {
      email: `${name.toLowerCase()}@example.eu`,
      password: 'correct horse battery',
      name,
      birthdate: '1995-05-05',
      consents: { terms: true, privacy: true },
    },
  });
  expect(res.statusCode).toBe(201);
  const cookie = res.cookies.find((c) => c.name === 'spotter_session')!;
  const headers = { cookie: `spotter_session=${cookie.value}` };
  const profile = await app.inject({
    method: 'PUT',
    url: '/api/me/profile',
    headers,
    payload: {
      gender,
      interestedIn,
      sensitiveConsent: true,
      cityId: 'berlin',
      sports: [{ id: 'running', level: 'regular' }],
      trainingTimes: ['early'],
      complete: true,
      ...extra,
    },
  });
  expect(profile.statusCode).toBe(200);
  return { id: res.json().id, headers };
}

const get = (u: TestUser, url: string) => app.inject({ method: 'GET', url, headers: u.headers });
const post = (u: TestUser, url: string, payload: object = {}) => app.inject({ method: 'POST', url, headers: u.headers, payload });
const like = (u: TestUser, target: TestUser, action = 'like') => post(u, '/api/swipes', { targetId: target.id, action });
const deckIds = async (u: TestUser) => (await get(u, '/api/discover')).json().cards.map((c: { id: string }) => c.id);

async function matchPair(a: TestUser, b: TestUser) {
  await like(a, b);
  const res = await like(b, a);
  expect(res.json().matched).toBe(true);
  return res.json().match.id as string;
}

describe('signup', () => {
  test('rejects under-18s and missing consent', async () => {
    const base = { email: 'x@example.eu', password: 'long enough pw', name: 'X', consents: { terms: true, privacy: true } };
    const young = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { ...base, birthdate: '2009-01-01' } });
    expect(young.statusCode).toBe(403);
    const noTerms = await app.inject({
      method: 'POST', url: '/api/auth/signup',
      payload: { ...base, birthdate: '1990-01-01', consents: { terms: false, privacy: true } },
    });
    expect(noTerms.statusCode).toBe(400);
  });

  test('gender and orientation need explicit consent', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/signup',
      payload: { email: 'c@example.eu', password: 'long enough pw', name: 'C', birthdate: '1990-01-01', consents: { terms: true, privacy: true } },
    });
    const headers = { cookie: `spotter_session=${res.cookies[0].value}` };
    const denied = await app.inject({ method: 'PUT', url: '/api/me/profile', headers, payload: { gender: 'woman' } });
    expect(denied.statusCode).toBe(409);
    const ok = await app.inject({ method: 'PUT', url: '/api/me/profile', headers, payload: { gender: 'woman', sensitiveConsent: true } });
    expect(ok.json().consents.sensitive).toBe(true);
  });

  test('login works and wrong passwords do not', async () => {
    await signup('Ana', 'woman', ['man']);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ana@example.eu', password: 'nope' } });
    expect(bad.statusCode).toBe(401);
    const good = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ANA@example.eu', password: 'correct horse battery' } });
    expect(good.statusCode).toBe(200);
  });
});

describe('discovery', () => {
  test('only shows people whose preferences are mutual', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const carl = await signup('Carl', 'man', ['man']);
    const dora = await signup('Dora', 'woman', ['woman']);
    expect(await deckIds(ana)).toEqual([ben.id]);
    expect(await deckIds(carl)).toEqual([]);
    expect(await deckIds(dora)).toEqual([]);
  });

  test('respects distance and age ranges', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    await signup('Ben', 'man', ['woman'], { cityId: 'lisbon' });
    expect(await deckIds(ana)).toEqual([]);
    await app.inject({ method: 'PUT', url: '/api/me/preferences', headers: ana.headers, payload: { maxDistanceKm: 0 } });
    expect(await deckIds(ana)).toHaveLength(1);
    await app.inject({ method: 'PUT', url: '/api/me/preferences', headers: ana.headers, payload: { ageMin: 40, ageMax: 50 } });
    expect(await deckIds(ana)).toEqual([]);
  });

  test('swiped people leave the deck and Spot requests are limited', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const men = [];
    for (const n of ['Ben', 'Carl', 'Dan', 'Eli']) men.push(await signup(n, 'man', ['woman']));
    await like(ana, men[0], 'pass');
    expect(await deckIds(ana)).not.toContain(men[0].id);
    expect((await like(men[1], ana, 'spot')).statusCode).toBe(200);
    expect((await like(men[2], ana, 'spot')).statusCode).toBe(200);
    // Spot requests jump the queue and show the note.
    const deck = (await get(ana, '/api/discover')).json().cards;
    expect(deck[0].spotRequest).not.toBeNull();
    for (const m of men.slice(1)) expect((await like(ana, m, 'spot')).statusCode).toBe(200);
    // Only three Spot requests per day.
    const extra = await signup('Finn', 'man', ['woman']);
    expect((await like(ana, extra, 'spot')).statusCode).toBe(429);
  });
});

describe('women make the first move', () => {
  test('full lifecycle: match, opener, reply', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const matchId = await matchPair(ana, ben);

    const benView = (await get(ben, `/api/matches/${matchId}`)).json();
    expect(benView.status).toBe('their_move');
    expect((await get(ana, `/api/matches/${matchId}`)).json().status).toBe('your_move');

    const early = await post(ben, `/api/matches/${matchId}/messages`, { kind: 'text', body: 'hey' });
    expect(early.statusCode).toBe(403);

    expect((await post(ana, `/api/matches/${matchId}/messages`, { kind: 'text', body: 'Run on Sunday?' })).statusCode).toBe(201);
    expect((await get(ben, `/api/matches/${matchId}`)).json().status).toBe('your_move');
    expect((await post(ben, `/api/matches/${matchId}/messages`, { kind: 'text', body: 'Yes!' })).statusCode).toBe(201);
    expect((await get(ana, `/api/matches/${matchId}`)).json().status).toBe('active');

    const msgs = (await get(ana, `/api/matches/${matchId}/messages`)).json().messages;
    expect(msgs.map((m: { body: string }) => m.body)).toEqual(['Run on Sunday?', 'Yes!']);
  });

  test('either person can start in same-gender matches', async () => {
    const ana = await signup('Ana', 'woman', ['woman']);
    const bea = await signup('Bea', 'woman', ['woman']);
    const matchId = await matchPair(ana, bea);
    expect((await post(bea, `/api/matches/${matchId}/messages`, { kind: 'text', body: 'hi' })).statusCode).toBe(201);
  });

  test('matches expire after 24h, can be extended once, and disappear later', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const matchId = await matchPair(ana, ben);

    now += 20 * HOUR;
    expect((await post(ben, `/api/matches/${matchId}/extend`)).statusCode).toBe(200);
    expect((await post(ana, `/api/matches/${matchId}/extend`)).statusCode).toBe(409);
    now += 10 * HOUR; // 30h in: still alive thanks to the extension
    expect((await get(ana, `/api/matches/${matchId}`)).json().status).toBe('your_move');
    now += 20 * HOUR;
    expect((await get(ana, `/api/matches/${matchId}`)).json().status).toBe('expired');
    expect((await post(ana, `/api/matches/${matchId}/messages`, { kind: 'text', body: 'sorry!' })).statusCode).toBe(410);
    now += 73 * HOUR;
    expect((await get(ana, '/api/matches')).json().matches).toHaveLength(0);
  });

  test('a workout invite can open, and answering it counts as a reply', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const matchId = await matchPair(ana, ben);
    const invite = await post(ana, `/api/matches/${matchId}/messages`, {
      kind: 'invite', body: 'Climb?', invite: { sport: 'climbing', place: 'Kreuzberg', startsAt: now + 48 * HOUR },
    });
    expect(invite.statusCode).toBe(201);
    const msgId = invite.json().message.id;
    expect((await post(ana, `/api/matches/${matchId}/invites/${msgId}`, { status: 'accepted' })).statusCode).toBe(403);
    const answer = await post(ben, `/api/matches/${matchId}/invites/${msgId}`, { status: 'accepted' });
    expect(answer.json().message.invite.status).toBe('accepted');
    expect(answer.json().match.status).toBe('active');
  });
});

describe('safety', () => {
  test('blocking removes the match and hides both people from each other', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const carl = await signup('Carl', 'man', ['woman']);
    await matchPair(ana, ben);
    await post(ana, '/api/blocks', { userId: ben.id });
    expect((await get(ana, '/api/matches')).json().matches).toHaveLength(0);
    expect((await get(ben, '/api/matches')).json().matches).toHaveLength(0);
    expect((await get(ben, `/api/users/${ana.id}`)).statusCode).toBe(404);

    const report = await post(ana, '/api/reports', { userId: carl.id, reason: 'fake' });
    expect(report.statusCode).toBe(201);
    expect(report.json().reference).toMatch(/^[0-9A-F]{8}$/);
    expect(await deckIds(ana)).toEqual([]);
  });

  test('cross-origin writes are refused', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: 'https://evil.example', host: 'spotter.eu' }, payload: {} });
    expect(res.statusCode).toBe(403);
    const opaque = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: 'null', host: 'spotter.eu' }, payload: {} });
    expect(opaque.statusCode).toBe(403);
  });
});

describe('GDPR', () => {
  test('export contains my data and no secrets', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const matchId = await matchPair(ana, ben);
    await post(ana, `/api/matches/${matchId}/messages`, { kind: 'text', body: 'Run on Sunday?' });
    await post(ben, `/api/matches/${matchId}/messages`, { kind: 'text', body: 'secret reply' });
    const res = await get(ana, '/api/me/export');
    expect(res.headers['content-disposition']).toContain('attachment');
    const data = res.json();
    expect(data.account.email).toBe('ana@example.eu');
    expect(JSON.stringify(data)).not.toContain('scrypt');
    expect(data.messagesSent.map((m: { body: string }) => m.body)).toEqual(['Run on Sunday?']);
    expect(JSON.stringify(data)).not.toContain('secret reply');
    expect(data.consentHistory.map((c: { kind: string }) => c.kind)).toEqual(expect.arrayContaining(['terms', 'privacy', 'sensitive']));
  });

  test('withdrawing explicit consent erases gender data and leaves discovery', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const me = (await app.inject({ method: 'PUT', url: '/api/me/consents', headers: ana.headers, payload: { sensitive: false } })).json();
    expect(me.gender).toBeNull();
    expect(me.interestedIn).toEqual([]);
    expect(me.onboarded).toBe(false);
    expect(await deckIds(ben)).toEqual([]);
  });

  test('account deletion needs the password and removes everything', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const matchId = await matchPair(ana, ben);
    await post(ana, `/api/matches/${matchId}/messages`, { kind: 'text', body: 'hi' });
    const wrong = await app.inject({ method: 'DELETE', url: '/api/me', headers: ana.headers, payload: { password: 'nope' } });
    expect(wrong.statusCode).toBe(403);
    const ok = await app.inject({ method: 'DELETE', url: '/api/me', headers: ana.headers, payload: { password: 'correct horse battery' } });
    expect(ok.statusCode).toBe(200);
    for (const table of ['users', 'messages', 'matches', 'swipes', 'consents', 'sessions', 'user_sports']) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === 'users' ? 'id' : table === 'matches' ? 'user_a' : table === 'messages' ? 'sender_id' : table === 'swipes' ? 'swiper_id' : 'user_id'} = ?`).get(ana.id) as { n: number };
      expect(row.n, table).toBe(0);
    }
    expect((await get(ana, '/api/me')).statusCode).toBe(401);
    expect((await get(ben, '/api/matches')).json().matches).toHaveLength(0);
  });
});

describe('photos', () => {
  const multipart = (data: Buffer, type: string) => {
    const boundary = '----spotter';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="p.jpg"\r\nContent-Type: ${type}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { body, contentType: `multipart/form-data; boundary=${boundary}` };
  };
  // SOI, APP1 "Exif" with a fake GPS payload, SOS + data, EOI.
  const exif = Buffer.from('Exif\0\0GPS:52.52,13.40');
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.from([0, exif.length + 2]), exif,
    Buffer.from([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]),
  ]);

  test('strips EXIF on upload and only shows photos to signed-in users', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const { body, contentType } = multipart(jpeg, 'image/jpeg');
    const res = await app.inject({ method: 'POST', url: '/api/me/photos', headers: { ...ana.headers, 'content-type': contentType }, payload: body });
    expect(res.statusCode).toBe(201);
    const [photo] = res.json().photos;
    const stored = readdirSync(uploads);
    expect(stored).toHaveLength(1);
    const served = await get(ana, photo.url);
    expect(served.rawPayload.includes(Buffer.from('GPS'))).toBe(false);
    expect(served.rawPayload[0]).toBe(0xff);
    expect((await app.inject({ method: 'GET', url: photo.url })).statusCode).toBe(401);
  });

  test('rejects things that are not JPEGs', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const { body, contentType } = multipart(Buffer.from('<svg/>'), 'image/svg+xml');
    const res = await app.inject({ method: 'POST', url: '/api/me/photos', headers: { ...ana.headers, 'content-type': contentType }, payload: body });
    expect(res.statusCode).toBe(415);
  });

  test('stripJpegMetadata keeps colour profiles', () => {
    const icc = Buffer.from('ICC_PROFILE\0\x01\x01data');
    const withIcc = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe2, 0, icc.length + 2]), icc, Buffer.from([0xff, 0xd9])]);
    expect(stripJpegMetadata(withIcc)).toEqual(withIcc);
    expect(stripJpegMetadata(Buffer.from('nope'))).toBeNull();
  });
});
