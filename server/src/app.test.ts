import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { Gender } from '@spotter/shared/catalog';
import { HOUR } from '@spotter/shared/rules';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { MatchModel, MessageModel, SessionModel, SwipeModel, UserModel } from './models.js';
import { stripJpegMetadata } from './security.js';

let mongod: MongoMemoryServer;
let app: Express;
let close: () => void;
let now: number;
let uploads: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
}, 120_000);

afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  now = Date.UTC(2026, 9, 19, 12);
  uploads = mkdtempSync(join(tmpdir(), 'spotter-test-'));
  ({ app, close } = createApp({ uploadsDir: uploads, secret: 'test-secret', corsOrigins: ['capacitor://localhost'], now: () => now }));
});

afterEach(() => {
  close();
  rmSync(uploads, { recursive: true, force: true });
});

type Agent = ReturnType<typeof request.agent>;
interface TestUser {
  id: string;
  agent: Agent;
}

const signupBody = (name: string) => ({
  email: `${name.toLowerCase()}@example.eu`,
  password: 'correct horse battery',
  name,
  birthdate: '1995-05-05',
  consents: { terms: true, privacy: true },
});

async function signup(name: string, gender: Gender, interestedIn: Gender[], extra: Record<string, unknown> = {}): Promise<TestUser> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/signup').send(signupBody(name));
  expect(res.status).toBe(201);
  const profile = await agent.put('/api/me/profile').send({
    gender,
    interestedIn,
    sensitiveConsent: true,
    cityId: 'berlin',
    sports: [{ id: 'running', level: 'regular' }],
    trainingTimes: ['early'],
    complete: true,
    ...extra,
  });
  expect(profile.status).toBe(200);
  return { id: res.body.id, agent };
}

const like = (u: TestUser, target: TestUser, action = 'like') => u.agent.post('/api/swipes').send({ targetId: target.id, action });
const deckIds = async (u: TestUser) => (await u.agent.get('/api/discover')).body.cards.map((c: { id: string }) => c.id);
const send = (u: TestUser, matchId: string, body: object) => u.agent.post(`/api/matches/${matchId}/messages`).send(body);
const status = async (u: TestUser, matchId: string) => (await u.agent.get(`/api/matches/${matchId}`)).body.status;

async function matchPair(a: TestUser, b: TestUser) {
  await like(a, b);
  const res = await like(b, a);
  expect(res.body.matched).toBe(true);
  return res.body.match.id as string;
}

describe('signup', () => {
  test('rejects under-18s and missing consent', async () => {
    const young = await request(app).post('/api/auth/signup').send({ ...signupBody('X'), birthdate: '2009-01-01' });
    expect(young.status).toBe(403);
    const noTerms = await request(app).post('/api/auth/signup').send({ ...signupBody('X'), consents: { terms: false, privacy: true } });
    expect(noTerms.status).toBe(400);
  });

  test('gender and orientation need explicit consent', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/signup').send(signupBody('C'));
    expect((await agent.put('/api/me/profile').send({ gender: 'woman' })).status).toBe(409);
    const ok = await agent.put('/api/me/profile').send({ gender: 'woman', sensitiveConsent: true });
    expect(ok.body.consents.sensitive).toBe(true);
  });

  test('login works, wrong passwords and duplicate emails do not', async () => {
    await signup('Ana', 'woman', ['man']);
    expect((await request(app).post('/api/auth/signup').send(signupBody('Ana'))).status).toBe(409);
    expect((await request(app).post('/api/auth/login').send({ email: 'ana@example.eu', password: 'nope' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'nobody@example.eu', password: 'nope' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'ANA@example.eu', password: 'correct horse battery' })).status).toBe(200);
  });
});

describe('native (iOS) clients', () => {
  test('get a bearer token instead of a cookie', async () => {
    const res = await request(app).post('/api/auth/signup').set('X-Spotter-Client', 'native').send(signupBody('Nat'));
    expect(res.status).toBe(201);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.token).toMatch(/^[\w-]{40,}$/);
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.name).toBe('Nat');
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${res.body.token}`);
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.token}`)).status).toBe(401);
  });

  test('the app origin passes CORS and the origin check; unknown origins do not', async () => {
    const preflight = await request(app)
      .options('/api/me/profile')
      .set('Origin', 'capacitor://localhost')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(preflight.headers['access-control-allow-origin']).toBe('capacitor://localhost');
    expect(preflight.headers['access-control-allow-headers']).toMatch(/Authorization/i);

    const fromApp = await request(app).post('/api/auth/signup').set('Origin', 'capacitor://localhost').set('X-Spotter-Client', 'native').send(signupBody('App'));
    expect(fromApp.status).toBe(201);
    const evil = await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({});
    expect(evil.status).toBe(403);
    const opaque = await request(app).post('/api/auth/login').set('Origin', 'null').send({});
    expect(opaque.status).toBe(403);
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

  test('respects distance (via $geoNear) and age ranges', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    await signup('Ben', 'man', ['woman'], { cityId: 'lisbon' });
    expect(await deckIds(ana)).toEqual([]);
    await ana.agent.put('/api/me/preferences').send({ maxDistanceKm: 0 });
    const deck = (await ana.agent.get('/api/discover')).body.cards;
    expect(deck).toHaveLength(1);
    expect(deck[0].distanceKm).toBeGreaterThan(2000);
    await ana.agent.put('/api/me/preferences').send({ ageMin: 40, ageMax: 50 });
    expect(await deckIds(ana)).toEqual([]);
  });

  test('swiped people leave the deck and Spot requests are limited', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const men: TestUser[] = [];
    for (const n of ['Ben', 'Carl', 'Dan', 'Eli']) men.push(await signup(n, 'man', ['woman']));
    await like(ana, men[0], 'pass');
    expect(await deckIds(ana)).not.toContain(men[0].id);
    expect((await like(men[1], ana, 'spot')).status).toBe(200);
    // Spot requests jump the queue and carry the note.
    expect((await ana.agent.get('/api/discover')).body.cards[0].spotRequest).not.toBeNull();
    for (const m of men.slice(1)) expect((await like(ana, m, 'spot')).status).toBe(200);
    const extra = await signup('Finn', 'man', ['woman']);
    expect((await like(ana, extra, 'spot')).status).toBe(429);
    expect((await like(ana, men[1])).status).toBe(409);
  });
});

describe('women make the first move', () => {
  test('full lifecycle: match, opener, reply', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const matchId = await matchPair(ana, ben);

    expect(await status(ben, matchId)).toBe('their_move');
    expect(await status(ana, matchId)).toBe('your_move');
    expect((await send(ben, matchId, { kind: 'text', body: 'hey' })).status).toBe(403);
    expect((await send(ana, matchId, { kind: 'text', body: 'Run on Sunday?' })).status).toBe(201);
    expect(await status(ben, matchId)).toBe('your_move');
    expect((await send(ben, matchId, { kind: 'text', body: 'Yes!' })).status).toBe(201);
    expect(await status(ana, matchId)).toBe('active');

    const res = await ana.agent.get(`/api/matches/${matchId}/messages`);
    expect(res.body.messages.map((m: { body: string }) => m.body)).toEqual(['Run on Sunday?', 'Yes!']);
    expect((await ben.agent.get('/api/matches')).body.matches[0].unread).toBe(1);
  });

  test('either person can start in same-gender matches', async () => {
    const ana = await signup('Ana', 'woman', ['woman']);
    const bea = await signup('Bea', 'woman', ['woman']);
    const matchId = await matchPair(ana, bea);
    expect((await send(bea, matchId, { kind: 'text', body: 'hi' })).status).toBe(201);
  });

  test('matches expire after 24h, can be extended once, and disappear later', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const matchId = await matchPair(ana, ben);

    now += 20 * HOUR;
    expect((await ben.agent.post(`/api/matches/${matchId}/extend`)).status).toBe(200);
    expect((await ana.agent.post(`/api/matches/${matchId}/extend`)).status).toBe(409);
    now += 10 * HOUR; // 30h in: still alive thanks to the extension
    expect(await status(ana, matchId)).toBe('your_move');
    now += 20 * HOUR;
    expect(await status(ana, matchId)).toBe('expired');
    expect((await send(ana, matchId, { kind: 'text', body: 'sorry!' })).status).toBe(410);
    now += 73 * HOUR;
    expect((await ana.agent.get('/api/matches')).body.matches).toHaveLength(0);
  });

  test('a workout invite can open, and answering it counts as a reply', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const matchId = await matchPair(ana, ben);
    const invite = await send(ana, matchId, {
      kind: 'invite', body: 'Climb?', invite: { sport: 'climbing', place: 'Kreuzberg', startsAt: now + 48 * HOUR },
    });
    expect(invite.status).toBe(201);
    const msgId = invite.body.message.id;
    expect((await ana.agent.post(`/api/matches/${matchId}/invites/${msgId}`).send({ status: 'accepted' })).status).toBe(403);
    const answer = await ben.agent.post(`/api/matches/${matchId}/invites/${msgId}`).send({ status: 'accepted' });
    expect(answer.body.message.invite.status).toBe('accepted');
    expect(answer.body.match.status).toBe('active');
    expect((await ben.agent.post(`/api/matches/${matchId}/invites/${msgId}`).send({ status: 'declined' })).status).toBe(409);
  });
});

describe('safety', () => {
  test('blocking removes the match and hides both people from each other', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const carl = await signup('Carl', 'man', ['woman']);
    await matchPair(ana, ben);
    await ana.agent.post('/api/blocks').send({ userId: ben.id });
    expect((await ana.agent.get('/api/matches')).body.matches).toHaveLength(0);
    expect((await ben.agent.get('/api/matches')).body.matches).toHaveLength(0);
    expect((await ben.agent.get(`/api/users/${ana.id}`)).status).toBe(404);
    expect((await ana.agent.get('/api/blocks')).body.blocks.map((b: { id: string }) => b.id)).toEqual([ben.id]);

    const report = await ana.agent.post('/api/reports').send({ userId: carl.id, reason: 'fake' });
    expect(report.status).toBe(201);
    expect(report.body.reference).toMatch(/^[0-9A-F]{8}$/);
    expect(await deckIds(ana)).toEqual([]);
  });

  test('unknown ids are 404s, not crashes', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    expect((await ana.agent.get('/api/users/not-an-id')).status).toBe(404);
    expect((await ana.agent.get('/api/matches/507f1f77bcf86cd799439011')).status).toBe(404);
    expect((await like(ana, { id: '$where', agent: ana.agent })).status).toBe(404);
  });
});

describe('GDPR', () => {
  test('export is a short-lived signed link with my data and no secrets', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const matchId = await matchPair(ana, ben);
    await send(ana, matchId, { kind: 'text', body: 'Run on Sunday?' });
    await send(ben, matchId, { kind: 'text', body: 'secret reply' });

    const { url } = (await ana.agent.post('/api/me/export-link')).body;
    const res = await request(app).get(url); // no session: the signature authorises it
    expect(res.headers['content-disposition']).toContain('attachment');
    const data = JSON.parse(res.text);
    expect(data.account.email).toBe('ana@example.eu');
    expect(res.text).not.toContain('scrypt');
    expect(data.messagesSent.map((m: { body: string }) => m.body)).toEqual(['Run on Sunday?']);
    expect(res.text).not.toContain('secret reply');
    expect(data.account.consents.map((c: { kind: string }) => c.kind)).toEqual(expect.arrayContaining(['terms', 'privacy', 'sensitive']));

    expect((await request(app).get(url.replace(/s=[^&]+/, 's=forged'))).status).toBe(404);
    now += 11 * 60_000;
    expect((await request(app).get(url)).status).toBe(404);
  });

  test('withdrawing explicit consent erases gender data and leaves discovery', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const me = (await ana.agent.put('/api/me/consents').send({ sensitive: false })).body;
    expect(me.gender).toBeNull();
    expect(me.interestedIn).toEqual([]);
    expect(me.onboarded).toBe(false);
    expect(await deckIds(ben)).toEqual([]);
  });

  test('account deletion needs the password and removes everything', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const ben = await signup('Ben', 'man', ['woman']);
    const matchId = await matchPair(ana, ben);
    await send(ana, matchId, { kind: 'text', body: 'hi' });
    expect((await ana.agent.delete('/api/me').send({ password: 'nope' })).status).toBe(403);
    expect((await ana.agent.delete('/api/me').send({ password: 'correct horse battery' })).status).toBe(200);

    expect(await UserModel.countDocuments({ _id: ana.id })).toBe(0);
    expect(await SessionModel.countDocuments({ user: ana.id })).toBe(0);
    expect(await SwipeModel.countDocuments({ $or: [{ swiper: ana.id }, { target: ana.id }] })).toBe(0);
    expect(await MatchModel.countDocuments({})).toBe(0);
    expect(await MessageModel.countDocuments({})).toBe(0);
    expect((await ana.agent.get('/api/me')).status).toBe(401);
    expect((await ben.agent.get('/api/matches')).body.matches).toHaveLength(0);
  });
});

describe('photos', () => {
  // SOI, APP1 "Exif" with a fake GPS payload, SOS + data, EOI.
  const exif = Buffer.from('Exif\0\0GPS:52.52,13.40');
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.from([0, exif.length + 2]), exif,
    Buffer.from([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]),
  ]);

  test('strips EXIF on upload and serves photos only through signed URLs', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const res = await ana.agent.post('/api/me/photos').attach('photo', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    const [photo] = res.body.photos;
    expect(readdirSync(uploads)).toHaveLength(1);

    const served = await request(app).get(photo.url).buffer(true);
    expect(served.status).toBe(200);
    expect(served.body.includes(Buffer.from('GPS'))).toBe(false);
    expect(served.body[0]).toBe(0xff);

    expect((await request(app).get(photo.url.split('?')[0])).status).toBe(404);
    now += 3 * 24 * HOUR;
    expect((await request(app).get(photo.url)).status).toBe(404);
  });

  test('rejects things that are not JPEGs and caps the count', async () => {
    const ana = await signup('Ana', 'woman', ['man']);
    const svg = await ana.agent.post('/api/me/photos').attach('photo', Buffer.from('<svg/>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
    expect(svg.status).toBe(415);
    for (let i = 0; i < 6; i++) await ana.agent.post('/api/me/photos').attach('photo', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
    const seventh = await ana.agent.post('/api/me/photos').attach('photo', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(seventh.status).toBe(409);
    expect(readdirSync(uploads)).toHaveLength(6);
  });

  test('stripJpegMetadata keeps colour profiles', () => {
    const icc = Buffer.from('ICC_PROFILE\0\x01\x01data');
    const withIcc = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe2, 0, icc.length + 2]), icc, Buffer.from([0xff, 0xd9])]);
    expect(stripJpegMetadata(withIcc)).toEqual(withIcc);
    expect(stripJpegMetadata(Buffer.from('nope'))).toBeNull();
  });
});
