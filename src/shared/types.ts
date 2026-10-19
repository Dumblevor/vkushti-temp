import type { Gender, Goal, Language, Level, ReportReason, SportId, TrainingTime } from './catalog.js';

export interface SportEntry {
  id: SportId;
  level: Level;
}

export interface PhotoRef {
  id: string;
  url: string;
}

/** What other people see. */
export interface PublicProfile {
  id: string;
  name: string;
  age: number;
  gender: Gender | null;
  cityId: string | null;
  bio: string;
  sports: SportEntry[];
  trainingTimes: TrainingTime[];
  frequency: number;
  goals: Goal[];
  gym: string;
  workoutIdea: string;
  photos: PhotoRef[];
  verified: boolean;
}

export interface Consents {
  terms: boolean;
  privacy: boolean;
  /** GDPR art. 9 explicit consent: gender + who you want to meet reveals sexual orientation. */
  sensitive: boolean;
  marketing: boolean;
}

export interface Preferences {
  ageMin: number;
  ageMax: number;
  /** 0 = anywhere in Europe */
  maxDistanceKm: number;
  language: Language;
}

export interface Me extends PublicProfile {
  email: string;
  birthdate: string;
  interestedIn: Gender[];
  onboarded: boolean;
  snoozed: boolean;
  preferences: Preferences;
  consents: Consents;
  demo: { enabled: boolean };
}

export interface DiscoverCard extends PublicProfile {
  distanceKm: number | null;
  score: number;
  sharedSports: SportId[];
  sharedTimes: TrainingTime[];
  /** Set when this person sent you a Spot request (our "super like"), with their note. */
  spotRequest: { note: string } | null;
}

export type MatchStatus = 'your_move' | 'their_move' | 'active' | 'expired';

export interface MatchSummary {
  id: string;
  other: PublicProfile;
  createdAt: number;
  status: MatchStatus;
  /** Epoch ms when the match expires; null once the conversation is going. */
  expiresAt: number | null;
  canExtend: boolean;
  /** Who must send the first message, null = either of you. */
  firstMoveBy: string | null;
  lastMessage: Message | null;
  unread: number;
  score: number;
}

export type InviteStatus = 'pending' | 'accepted' | 'declined';

export interface WorkoutInvite {
  sport: SportId;
  place: string;
  startsAt: number;
  status: InviteStatus;
}

export interface Message {
  id: string;
  matchId: string;
  senderId: string;
  kind: 'text' | 'invite';
  body: string;
  invite: WorkoutInvite | null;
  createdAt: number;
}

export interface ApiError {
  error: string;
  message?: string;
}

export type { Gender, Goal, Language, Level, ReportReason, SportId, TrainingTime };
