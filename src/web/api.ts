import type { DiscoverCard, MatchSummary, Me, Message, PublicProfile, ReportReason, SportId } from '../shared/types';
import type { TrainingMatch } from '../shared/rules';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const code = res.status === 429 && !data?.error?.includes('limit') ? 'rate_limited' : (data?.error ?? 'error');
    throw new ApiError(res.status, code, data?.message);
  }
  return data as T;
}

export type UserView = PublicProfile & TrainingMatch & { distanceKm: number | null };

export const api = {
  meta: () => request<{ demo: boolean }>('GET', '/api/meta'),
  me: () => request<Me>('GET', '/api/me'),
  signup: (body: object) => request<Me>('POST', '/api/auth/signup', body),
  login: (email: string, password: string) => request<Me>('POST', '/api/auth/login', { email, password }),
  demoLogin: () => request<Me>('POST', '/api/auth/demo', {}),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout', {}),

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
  deleteAccount: (password: string) => request<{ ok: true }>('DELETE', '/api/me', { password }),

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
