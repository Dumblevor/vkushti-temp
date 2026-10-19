// Demo mode: seeded profiles that like you back and chat a little, so the app
// can be explored alone. Never enable this in production.
import type { Message } from '../shared/types.js';
import type { Ctx } from './app.js';
import { tx } from './db.js';
import type { MatchRow, UserRow } from './repo.js';
import { canSend } from '../shared/rules.js';
import { Repo } from './repo.js';

const SPORT_NAMES: Record<string, string> = {
  running: 'running', strength: 'lifting', hiit: 'HIIT', fitness_racing: 'fitness racing', climbing: 'climbing',
  cycling: 'cycling', swimming: 'swimming', triathlon: 'triathlon', yoga: 'yoga', pilates: 'pilates',
  calisthenics: 'calisthenics', martial_arts: 'boxing', tennis: 'tennis', padel: 'padel', football: 'football',
  basketball: 'basketball', volleyball: 'volleyball', rowing: 'rowing', hiking: 'hiking', skiing: 'skiing',
  surfing: 'surfing', dance: 'dancing',
};

const OPENERS = [
  'Hey {name}! A fellow {sport} person — what are you training for at the moment?',
  'Hi {name} 👋 Your profile says {sport}. Morning or evening sessions?',
  'Okay {name}, important question first: post-workout meal of choice?',
  'Hey! I see we both do {sport}. How long have you been at it?',
];

const REPLIES = [
  'Ha, love that. I’m building up for a race in spring, so lots of easy kilometres right now.',
  'Mornings for me — the city is so quiet before 7.',
  'Honestly, anything with carbs. Preferably from a good bakery 🥐',
  'What does a typical training week look like for you?',
  'We should train together sometime — and grab a coffee after?',
  'Deal. Send me a workout invite and I’ll be there 😄',
];

const MAX_BOT_MESSAGES = 7;

export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export class Demo {
  private timers = new Set<NodeJS.Timeout>();

  constructor(private ctx: Ctx) {}

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  private later(fn: () => void, minMs = 1500, maxMs = 4500) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      try {
        fn();
      } catch {
        // The match may have been deleted in the meantime; nothing to do.
      }
    }, minMs + Math.random() * (maxMs - minMs));
    this.timers.add(t);
  }

  /** Called inside the swipe transaction: a demo profile decides whether it likes you back. */
  maybeLikeBack(user: UserRow, target: UserRow, action: 'like' | 'spot') {
    if (!target.is_demo || user.is_demo) return;
    const likes = action === 'spot' || hash(user.id + target.id) % 100 < 70;
    if (!likes) return;
    this.ctx.db
      .prepare("INSERT OR IGNORE INTO swipes (swiper_id, target_id, action, created_at) VALUES (?, ?, 'like', ?)")
      .run(target.id, user.id, this.ctx.now());
  }

  onMatch(match: MatchRow, otherId: string) {
    const bot = this.ctx.repo.user(otherId);
    if (!bot?.is_demo) return;
    const botMovesFirst = match.first_move_by === bot.id || (match.first_move_by === null && hash(match.id) % 2 === 0);
    if (botMovesFirst) this.later(() => this.say(match.id, bot, 'opener'), 2500, 6000);
  }

  onMessage(match: MatchRow, senderId: string, msg: Message) {
    const { repo } = this.ctx;
    const bot = repo.user(repo.otherId(match, senderId));
    if (!bot?.is_demo) return;
    if (msg.kind === 'invite') {
      this.later(() => {
        const current = repo.message(msg.id);
        if (!current?.invite || current.invite.status !== 'pending') return;
        tx(this.ctx.db, () => {
          repo.setInviteStatus(msg.id, { ...current.invite!, status: 'accepted' });
          const m = repo.match(match.id)!;
          if (!m.replied_at && m.first_message_by !== bot.id) {
            this.ctx.db.prepare('UPDATE matches SET replied_at = ?, expires_at = NULL WHERE id = ?').run(this.ctx.now(), m.id);
          }
        });
        this.say(match.id, bot, 'Accepted! See you there — I’ll be the one stretching way too long.');
      });
      return;
    }
    this.later(() => this.say(match.id, bot, 'reply'));
  }

  private say(matchId: string, bot: UserRow, what: 'opener' | 'reply' | (string & {})) {
    const { repo, db } = this.ctx;
    const m = repo.match(matchId);
    if (!m || !canSend(Repo.state(m), bot.id, this.ctx.now())) return;
    const sent = (db.prepare('SELECT COUNT(*) AS n FROM messages WHERE match_id = ? AND sender_id = ?').get(m.id, bot.id) as { n: number }).n;
    if (sent >= MAX_BOT_MESSAGES) return;
    const human = repo.user(repo.otherId(m, bot.id))!;
    let body = what;
    if (what === 'opener' || what === 'reply') {
      const shared = repo.sports(bot.id).find((s) => repo.sports(human.id).some((h) => h.id === s.id)) ?? repo.sports(bot.id)[0];
      const pool = what === 'opener' ? OPENERS : REPLIES;
      const line = what === 'opener' ? pool[hash(m.id) % pool.length] : pool[sent % pool.length];
      body = line.replace('{name}', human.name).replace('{sport}', SPORT_NAMES[shared?.id ?? 'running']);
    }
    tx(db, () => repo.postMessage(m, bot.id, 'text', body, null));
  }
}
