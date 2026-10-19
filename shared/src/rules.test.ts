import { describe, expect, test } from 'vitest';
import { ageOn, canSend, firstMoveBy, HOUR, matchStatus, trainingMatch, type MatchState } from './rules.js';

const W = { id: 'w', gender: 'woman' as const };
const M = { id: 'm', gender: 'man' as const };
const N = { id: 'n', gender: 'nonbinary' as const };

describe('firstMoveBy', () => {
  test('woman moves first with a man, in either order', () => {
    expect(firstMoveBy(W, M)).toBe('w');
    expect(firstMoveBy(M, W)).toBe('w');
  });
  test('anyone can start otherwise', () => {
    expect(firstMoveBy(W, { id: 'w2', gender: 'woman' })).toBeNull();
    expect(firstMoveBy(M, { id: 'm2', gender: 'man' })).toBeNull();
    expect(firstMoveBy(N, M)).toBeNull();
    expect(firstMoveBy(N, W)).toBeNull();
  });
});

describe('match state machine', () => {
  const t = 1_000_000;
  const fresh: MatchState = { firstMoveBy: 'w', firstMessageBy: null, repliedAt: null, expiresAt: t + 24 * HOUR };

  test('before the opener only the first mover may write', () => {
    expect(matchStatus(fresh, 'w', t)).toBe('your_move');
    expect(matchStatus(fresh, 'm', t)).toBe('their_move');
    expect(canSend(fresh, 'w', t)).toBe(true);
    expect(canSend(fresh, 'm', t)).toBe(false);
  });

  test('after the opener the other person must reply', () => {
    const opened = { ...fresh, firstMessageBy: 'w', expiresAt: t + 30 * HOUR };
    expect(matchStatus(opened, 'm', t)).toBe('your_move');
    expect(matchStatus(opened, 'w', t)).toBe('their_move');
    expect(canSend(opened, 'm', t)).toBe(true);
    expect(canSend(opened, 'w', t)).toBe(true);
  });

  test('expires when the clock runs out, but never once both have written', () => {
    expect(matchStatus(fresh, 'w', t + 24 * HOUR)).toBe('expired');
    expect(canSend(fresh, 'w', t + 24 * HOUR)).toBe(false);
    const active = { ...fresh, firstMessageBy: 'w', repliedAt: t, expiresAt: null };
    expect(matchStatus(active, 'm', t + 1000 * HOUR)).toBe('active');
  });

  test('either person can open when no first mover is set', () => {
    const open = { ...fresh, firstMoveBy: null };
    expect(canSend(open, 'w', t)).toBe(true);
    expect(canSend(open, 'm', t)).toBe(true);
  });
});

describe('trainingMatch', () => {
  const runner = { sports: [{ id: 'running' as const, level: 'advanced' as const }], trainingTimes: ['early' as const], frequency: 5, goals: ['endurance' as const] };

  test('identical training profiles score near the top', () => {
    const r = trainingMatch(runner, runner);
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.sharedSports).toEqual(['running']);
    expect(r.sharedTimes).toEqual(['early']);
  });

  test('nothing in common scores low', () => {
    const swimmer = { sports: [{ id: 'swimming' as const, level: 'beginner' as const }], trainingTimes: ['evening' as const], frequency: 1, goals: ['social' as const] };
    expect(trainingMatch(runner, swimmer).score).toBeLessThan(10);
  });

  test('is symmetric and level-aware', () => {
    const casual = { ...runner, sports: [{ id: 'running' as const, level: 'beginner' as const }] };
    expect(trainingMatch(runner, casual).score).toBe(trainingMatch(casual, runner).score);
    expect(trainingMatch(runner, casual).score).toBeLessThan(trainingMatch(runner, runner).score);
  });
});

test('ageOn handles birthdays', () => {
  const now = Date.UTC(2026, 9, 19);
  expect(ageOn('2008-10-19', now)).toBe(18);
  expect(ageOn('2008-10-20', now)).toBe(17);
  expect(ageOn('1990-01-01', now)).toBe(36);
});
