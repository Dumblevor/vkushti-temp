import { randomUUID } from 'node:crypto';
import type { Gender, Goal, Language, Level, SportId, TrainingTime } from '../shared/catalog.js';
import { ageOn, matchStatus, MOVE_WINDOW_MS, trainingMatch, type MatchState } from '../shared/rules.js';
import type { Consents, MatchSummary, Me, Message, PublicProfile, SportEntry, WorkoutInvite } from '../shared/types.js';
import type { DB } from './db.js';

export const POLICY_VERSION = '2026-10';

export interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  name: string;
  birthdate: string;
  gender: Gender | null;
  interested_in: string;
  city_id: string | null;
  bio: string;
  training_times: string;
  frequency: number;
  goals: string;
  gym: string;
  workout_idea: string;
  age_min: number;
  age_max: number;
  max_distance_km: number;
  language: Language;
  onboarded: number;
  snoozed: number;
  verified: number;
  is_demo: number;
  created_at: number;
  last_active_at: number;
}

export interface MatchRow {
  id: string;
  user_a: string;
  user_b: string;
  first_move_by: string | null;
  first_message_by: string | null;
  replied_at: number | null;
  expires_at: number | null;
  extended: number;
  created_at: number;
}

interface MessageRow {
  id: string;
  match_id: string;
  sender_id: string;
  kind: 'text' | 'invite';
  body: string;
  invite: string | null;
  created_at: number;
  read_at: number | null;
}

export const newId = () => randomUUID();
const json = <T,>(value: string): T => JSON.parse(value) as T;

export class Repo {
  constructor(
    readonly db: DB,
    readonly now: () => number,
  ) {}

  user(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  userByEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  }

  sports(userId: string): SportEntry[] {
    return this.db
      .prepare('SELECT sport AS id, level FROM user_sports WHERE user_id = ? ORDER BY position')
      .all(userId) as unknown as SportEntry[];
  }

  photos(userId: string): { id: string; file: string }[] {
    return this.db
      .prepare('SELECT id, file FROM photos WHERE user_id = ? ORDER BY position')
      .all(userId) as unknown as { id: string; file: string }[];
  }

  publicProfile(row: UserRow): PublicProfile {
    return {
      id: row.id,
      name: row.name,
      age: ageOn(row.birthdate, this.now()),
      gender: row.gender,
      cityId: row.city_id,
      bio: row.bio,
      sports: this.sports(row.id),
      trainingTimes: json<TrainingTime[]>(row.training_times),
      frequency: row.frequency,
      goals: json<Goal[]>(row.goals),
      gym: row.gym,
      workoutIdea: row.workout_idea,
      photos: this.photos(row.id).map((p) => ({ id: p.id, url: `/api/photos/${p.id}` })),
      verified: row.verified === 1,
    };
  }

  consents(userId: string): Consents {
    const rows = this.db
      .prepare(
        `SELECT kind, granted FROM consents c WHERE user_id = ?
         AND at = (SELECT MAX(at) FROM consents WHERE user_id = c.user_id AND kind = c.kind)`,
      )
      .all(userId) as { kind: keyof Consents; granted: number }[];
    const consents: Consents = { terms: false, privacy: false, sensitive: false, marketing: false };
    for (const r of rows) consents[r.kind] = r.granted === 1;
    return consents;
  }

  recordConsents(userId: string, consents: Partial<Consents>) {
    const insert = this.db.prepare('INSERT INTO consents (user_id, kind, granted, policy_version, at) VALUES (?, ?, ?, ?, ?)');
    for (const [kind, granted] of Object.entries(consents)) {
      if (granted !== undefined) insert.run(userId, kind, granted ? 1 : 0, POLICY_VERSION, this.now());
    }
  }

  me(row: UserRow, demoEnabled: boolean): Me {
    return {
      ...this.publicProfile(row),
      email: row.email ?? '',
      birthdate: row.birthdate,
      interestedIn: json<Gender[]>(row.interested_in),
      onboarded: row.onboarded === 1,
      snoozed: row.snoozed === 1,
      preferences: {
        ageMin: row.age_min,
        ageMax: row.age_max,
        maxDistanceKm: row.max_distance_km,
        language: row.language,
      },
      consents: this.consents(row.id),
      demo: { enabled: demoEnabled },
    };
  }

  setSports(userId: string, sports: { id: SportId; level: Level }[]) {
    this.db.prepare('DELETE FROM user_sports WHERE user_id = ?').run(userId);
    const insert = this.db.prepare('INSERT INTO user_sports (user_id, sport, level, position) VALUES (?, ?, ?, ?)');
    sports.forEach((s, i) => insert.run(userId, s.id, s.level, i));
  }

  isBlockedEitherWay(a: string, b: string): boolean {
    return !!this.db
      .prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
      .get(a, b, b, a);
  }

  // ---- matches -------------------------------------------------------------

  matchBetween(a: string, b: string): MatchRow | undefined {
    const [x, y] = [a, b].sort();
    return this.db.prepare('SELECT * FROM matches WHERE user_a = ? AND user_b = ?').get(x, y) as MatchRow | undefined;
  }

  match(id: string): MatchRow | undefined {
    return this.db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
  }

  matchesFor(userId: string): MatchRow[] {
    return this.db
      .prepare('SELECT * FROM matches WHERE user_a = ? OR user_b = ? ORDER BY created_at DESC')
      .all(userId, userId) as unknown as MatchRow[];
  }

  createMatch(a: { id: string; gender: Gender | null }, b: { id: string; gender: Gender | null }, firstMove: string | null): MatchRow {
    const [x, y] = [a.id, b.id].sort();
    const now = this.now();
    const row: MatchRow = {
      id: newId(),
      user_a: x,
      user_b: y,
      first_move_by: firstMove,
      first_message_by: null,
      replied_at: null,
      expires_at: now + MOVE_WINDOW_MS,
      extended: 0,
      created_at: now,
    };
    this.db
      .prepare(
        `INSERT INTO matches (id, user_a, user_b, first_move_by, first_message_by, replied_at, expires_at, extended, created_at)
         VALUES (?, ?, ?, ?, NULL, NULL, ?, 0, ?)`,
      )
      .run(row.id, x, y, firstMove, row.expires_at, now);
    return row;
  }

  static state(m: MatchRow): MatchState {
    return {
      firstMoveBy: m.first_move_by,
      firstMessageBy: m.first_message_by,
      repliedAt: m.replied_at,
      expiresAt: m.expires_at,
    };
  }

  otherId(m: MatchRow, me: string) {
    return m.user_a === me ? m.user_b : m.user_a;
  }

  matchSummary(m: MatchRow, viewer: UserRow): MatchSummary | null {
    const otherRow = this.user(this.otherId(m, viewer.id));
    if (!otherRow) return null;
    const other = this.publicProfile(otherRow);
    const now = this.now();
    const status = matchStatus(Repo.state(m), viewer.id, now);
    const last = this.db
      .prepare('SELECT * FROM messages WHERE match_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
      .get(m.id) as MessageRow | undefined;
    const unread = this.db
      .prepare('SELECT COUNT(*) AS n FROM messages WHERE match_id = ? AND sender_id != ? AND read_at IS NULL')
      .get(m.id, viewer.id) as { n: number };
    return {
      id: m.id,
      other,
      createdAt: m.created_at,
      status,
      expiresAt: status === 'active' ? null : m.expires_at,
      canExtend: m.extended === 0 && (status === 'your_move' || status === 'their_move'),
      firstMoveBy: m.first_move_by,
      lastMessage: last ? toMessage(last) : null,
      unread: unread.n,
      score: trainingMatch(this.publicProfile(viewer), other).score,
    };
  }

  // ---- messages ------------------------------------------------------------

  messages(matchId: string, after?: number): Message[] {
    const rows = (
      after === undefined
        ? this.db.prepare('SELECT * FROM messages WHERE match_id = ? ORDER BY created_at, rowid').all(matchId)
        : // >= so a message sharing the cursor's millisecond isn't skipped; the client de-dupes by id.
          this.db.prepare('SELECT * FROM messages WHERE match_id = ? AND created_at >= ? ORDER BY created_at, rowid').all(matchId, after)
    ) as unknown as MessageRow[];
    return rows.map(toMessage);
  }

  message(id: string): Message | undefined {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined;
    return row && toMessage(row);
  }

  /** Inserts a message and advances the match's first-move / reply state machine. */
  postMessage(m: MatchRow, senderId: string, kind: 'text' | 'invite', body: string, invite: WorkoutInvite | null): Message {
    const now = this.now();
    const msg: Message = { id: newId(), matchId: m.id, senderId, kind, body, invite, createdAt: now };
    this.db
      .prepare('INSERT INTO messages (id, match_id, sender_id, kind, body, invite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(msg.id, m.id, senderId, kind, body, invite ? JSON.stringify(invite) : null, now);
    if (!m.first_message_by) {
      // The opener starts the reply clock for the other person.
      this.db.prepare('UPDATE matches SET first_message_by = ?, expires_at = ? WHERE id = ?').run(senderId, now + MOVE_WINDOW_MS, m.id);
    } else if (!m.replied_at && senderId !== m.first_message_by) {
      this.db.prepare('UPDATE matches SET replied_at = ?, expires_at = NULL WHERE id = ?').run(now, m.id);
    }
    return msg;
  }

  setInviteStatus(messageId: string, invite: WorkoutInvite) {
    this.db.prepare('UPDATE messages SET invite = ? WHERE id = ?').run(JSON.stringify(invite), messageId);
  }
}

function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    matchId: r.match_id,
    senderId: r.sender_id,
    kind: r.kind,
    body: r.body,
    invite: r.invite ? (JSON.parse(r.invite) as WorkoutInvite) : null,
    createdAt: r.created_at,
  };
}
