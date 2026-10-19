import { LEVELS, type Gender, type Goal, type SportId, type TrainingTime } from './catalog.js';
import type { MatchStatus, SportEntry } from './types.js';

export const HOUR = 60 * 60 * 1000;
/** How long the first mover has to say hello, and how long the other person has to reply. */
export const MOVE_WINDOW_MS = 24 * HOUR;

/**
 * Bumble-style rule: when a woman and a man match, she makes the first move.
 * Any other pairing — either person can start. Returns the user id that must
 * move first, or null if either may.
 */
export function firstMoveBy(a: { id: string; gender: Gender | null }, b: { id: string; gender: Gender | null }): string | null {
  if (a.gender === 'woman' && b.gender === 'man') return a.id;
  if (b.gender === 'woman' && a.gender === 'man') return b.id;
  return null;
}

export interface MatchState {
  firstMoveBy: string | null;
  firstMessageBy: string | null;
  repliedAt: number | null;
  expiresAt: number | null;
}

export function matchStatus(m: MatchState, viewerId: string, now: number): MatchStatus {
  if (m.repliedAt) return 'active';
  if (m.expiresAt !== null && now >= m.expiresAt) return 'expired';
  if (!m.firstMessageBy) return m.firstMoveBy === null || m.firstMoveBy === viewerId ? 'your_move' : 'their_move';
  return m.firstMessageBy === viewerId ? 'their_move' : 'your_move';
}

/** Whether `senderId` may post into the match right now. */
export function canSend(m: MatchState, senderId: string, now: number): boolean {
  const status = matchStatus(m, senderId, now);
  if (status === 'expired') return false;
  if (status === 'active') return true;
  // Before the first message only the designated first mover (or anyone, if unset) may write.
  if (!m.firstMessageBy) return status === 'your_move';
  // After the opener the first mover can add follow-ups while waiting for a reply.
  return true;
}

export function ageOn(birthdate: string, now: number): number {
  const [y, m, d] = birthdate.split('-').map(Number);
  const today = new Date(now);
  let age = today.getUTCFullYear() - y;
  const monthDiff = today.getUTCMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < d)) age--;
  return age;
}

export interface TrainingProfile {
  sports: SportEntry[];
  trainingTimes: TrainingTime[];
  frequency: number;
  goals: Goal[];
}

export interface TrainingMatch {
  score: number;
  sharedSports: SportId[];
  sharedTimes: TrainingTime[];
}

const intersect = <T,>(a: readonly T[], b: readonly T[]) => a.filter((x) => b.includes(x));
const jaccard = <T,>(a: readonly T[], b: readonly T[]) => {
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersect(a, b).length / union;
};

/**
 * "Training match" — how well two people would fit as training partners.
 * Deliberately ignores bodies and looks: it's about what you do, when, and why.
 */
export function trainingMatch(a: TrainingProfile, b: TrainingProfile): TrainingMatch {
  const bSports = new Map(b.sports.map((s) => [s.id, s.level]));
  const shared = a.sports.filter((s) => bSports.has(s.id));
  const levelGap = (x: SportEntry) => Math.abs(LEVELS.indexOf(x.level) - LEVELS.indexOf(bSports.get(x.id)!)) / (LEVELS.length - 1);
  const sharedWeight = shared.reduce((sum, s) => sum + 0.6 + 0.4 * (1 - levelGap(s)), 0);
  const minSports = Math.max(1, Math.min(a.sports.length, b.sports.length));
  const sports = 0.7 * (sharedWeight / minSports) + 0.3 * jaccard(a.sports.map((s) => s.id), b.sports.map((s) => s.id));

  const sharedTimes = intersect(a.trainingTimes, b.trainingTimes);
  const times = sharedTimes.length / Math.max(1, Math.min(a.trainingTimes.length, b.trainingTimes.length));
  const frequency = 1 - Math.min(6, Math.abs(a.frequency - b.frequency)) / 6;
  const goals = jaccard(a.goals, b.goals);

  const raw = 0.5 * sports + 0.25 * times + 0.1 * frequency + 0.15 * goals;
  return {
    score: Math.max(1, Math.min(99, Math.round(raw * 100))),
    sharedSports: shared.map((s) => s.id),
    sharedTimes,
  };
}
