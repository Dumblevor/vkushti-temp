import type { DiscoverCard, MatchSummary, Me, Message, PublicProfile, ReportReason, SportId } from '@spotter/shared/types';
import type { TrainingMatch } from '@spotter/shared/rules';
import { API_URL, isNative, tokenStore } from './native';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

// Native session token (see native.ts); loaded from the Keychain at startup.
let token: string | null = null;
export async function restoreToken() {
  token = await tokenStore.get().catch(() => null);
}
async function setToken(next: string | null) {
  token = next;
  await (next ? tokenStore.set(next) : tokenStore.clear()).catch(() => {});
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (isNative) headers['X-Spotter-Client'] = 'native';
  if (token) headers.Authorization = `Bearer ${token}`;
  const init: RequestInit = { method, headers, credentials: isNative ? 'omit' : 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(API_URL + path, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && token) await setToken(null);
    throw new ApiError(res.status, data?.error ?? 'error', data?.message);
  }
  return data as T;
}

/** Login-type responses carry a token for native clients; keep it and hand back the profile. */
async function session(promise: Promise<Me & { token?: string }>): Promise<Me> {
  const { token: next, ...me } = await promise;
  if (next) await setToken(next);
  return me;
}

export type UserView = PublicProfile & TrainingMatch & { distanceKm: number | null };

export const api = {
  meta: () => request<{ demo: boolean }>('GET', '/api/meta'),
  me: () => request<Me>('GET', '/api/me'),
  signup: (body: object) => session(request('POST', '/api/auth/signup', body)),
  login: (email: string, password: string) => session(request('POST', '/api/auth/login', { email, password })),
  demoLogin: () => session(request('POST', '/api/auth/demo', {})),
  logout: async () => {
    await request<{ ok: true }>('POST', '/api/auth/logout', {}).finally(() => setToken(null));
  },

  updateProfile: (body: object) => request<Me>('PUT', '/api/me/profile', body),
  updatePreferences: (body: object) => request<Me>('PUT', '/api/me/preferences', body),
  snooze: (snoozed: boolean) => request<Me>('PUT', '/api/me/snooze', { snoozed }),
  consents: (body: { marketing?: boolean; sensitive?: boolean }) => request<Me>('PUT', '/api/me/consents', body),
  uploadPhoto: (blob: Blob) => {
    const form = new FormData();
    form.append('photo', blob, 'photo.jpg');
    return request<Me>('POST', '/api/me/photos', form);
  },
  deletePhoto: (id: string) => request<Me>('DELETE', `/api/me/photos/${id}`),
  exportLink: () => request<{ url: string }>('POST', '/api/me/export-link', {}),
  deleteAccount: async (password: string) => {
    await request<{ ok: true }>('DELETE', '/api/me', { password });
    await setToken(null);
  },

  discover: (sport?: SportId | '') =>
    request<{ cards: DiscoverCard[]; snoozed: boolean }>('GET', `/api/discover${sport ? `?sport=${sport}` : ''}`),
  swipe: (targetId: string, action: 'like' | 'pass' | 'spot', note?: string) =>
    request<{ matched: boolean; match?: MatchSummary }>('POST', '/api/swipes', { targetId, action, note }),

  matches: () => request<{ matches: MatchSummary[] }>('GET', '/api/matches'),
  messages: (matchId: string, after?: number) =>
    request<{ messages: Message[]; match: MatchSummary }>(
      'GET',
      `/api/matches/${matchId}/messages${after !== undefined ? `?after=${after}` : ''}`,
    ),
  send: (matchId: string, body: object) =>
    request<{ message: Message; match: MatchSummary }>('POST', `/api/matches/${matchId}/messages`, body),
  answerInvite: (matchId: string, messageId: string, status: 'accepted' | 'declined') =>
    request<{ message: Message; match: MatchSummary }>('POST', `/api/matches/${matchId}/invites/${messageId}`, { status }),
  extend: (matchId: string) => request<MatchSummary>('POST', `/api/matches/${matchId}/extend`, {}),
  unmatch: (matchId: string) => request<{ ok: true }>('DELETE', `/api/matches/${matchId}`),

  user: (id: string) => request<UserView>('GET', `/api/users/${id}`),
  blocks: () => request<{ blocks: { id: string; name: string; createdAt: number }[] }>('GET', '/api/blocks'),
  block: (userId: string) => request<{ ok: true }>('POST', '/api/blocks', { userId }),
  unblock: (userId: string) => request<{ ok: true }>('DELETE', `/api/blocks/${userId}`),
  report: (userId: string, reason: ReportReason, details: string) =>
    request<{ ok: true; reference: string }>('POST', '/api/reports', { userId, reason, details }),
};
