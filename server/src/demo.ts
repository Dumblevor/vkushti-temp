// Demo mode: seeded profiles that like you back and chat a little, so the app
// can be explored alone. Never enable this in production.
import type { Types } from 'mongoose';
import { canSend } from '@spotter/shared/rules';
import type { Ctx } from './context.js';
import { matchState, otherId } from './dto.js';
import { MatchModel, MessageModel, SwipeModel, UserModel, type Match, type Message, type User } from './models.js';
import { markReplied, postMessage } from './services.js';

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

const INVITE_ACCEPTED = 'Accepted! See you there — I’ll be the one stretching way too long.';
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

  private later(fn: () => Promise<void>, minMs = 1500, maxMs = 4500) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn().catch(() => {
        // The match may have been deleted in the meantime; nothing to do.
      });
    }, minMs + Math.random() * (maxMs - minMs));
    this.timers.add(t);
  }

  /** A demo profile decides (deterministically) whether it likes you back. */
  async maybeLikeBack(user: User, target: User, action: 'like' | 'spot') {
    if (!target.isDemo || user.isDemo) return;
    if (action !== 'spot' && hash(user._id.toString() + target._id.toString()) % 100 >= 70) return;
    await SwipeModel.updateOne(
      { swiper: target._id, target: user._id },
      { $setOnInsert: { action: 'like', note: '', createdAt: new Date(this.ctx.now()) } },
      { upsert: true },
    );
  }

  onMatch(match: Match, botId: Types.ObjectId) {
    this.later(async () => {
      const bot = await UserModel.findById(botId).lean<User>();
      if (!bot?.isDemo) return;
      const movesFirst = match.firstMoveBy?.equals(bot._id) || (match.firstMoveBy === null && hash(match._id.toString()) % 2 === 0);
      if (movesFirst) await this.say(match._id, bot, 'opener');
    }, 2500, 6000);
  }

  onMessage(match: Match, senderId: Types.ObjectId, msg: Message) {
    this.later(async () => {
      const bot = await UserModel.findById(otherId(match, senderId)).lean<User>();
      if (!bot?.isDemo) return;
      if (msg.kind !== 'invite') return this.say(match._id, bot, 'reply');
      const answered = await MessageModel.findOneAndUpdate({ _id: msg._id, 'invite.status': 'pending' }, { $set: { 'invite.status': 'accepted' } });
      if (!answered) return;
      await markReplied(this.ctx, match._id, bot._id);
      await this.say(match._id, bot, INVITE_ACCEPTED);
    });
  }

  private async say(matchId: Types.ObjectId, bot: User, what: 'opener' | 'reply' | (string & {})) {
    const m = await MatchModel.findById(matchId).lean<Match>();
    if (!m || !canSend(matchState(m), bot._id.toString(), this.ctx.now())) return;
    const sent = await MessageModel.countDocuments({ match: m._id, sender: bot._id });
    if (sent >= MAX_BOT_MESSAGES) return;
    const human = await UserModel.findById(otherId(m, bot._id)).lean<User>();
    if (!human) return;
    let body = what;
    if (what === 'opener' || what === 'reply') {
      const shared = bot.sports.find((s) => human.sports.some((h) => h.id === s.id)) ?? bot.sports[0];
      const line = what === 'opener' ? OPENERS[hash(m._id.toString()) % OPENERS.length] : REPLIES[sent % REPLIES.length];
      body = line.replace('{name}', human.name).replace('{sport}', SPORT_NAMES[shared?.id ?? 'running']);
    }
    await postMessage(this.ctx, m, bot._id, 'text', body, null);
  }
}
