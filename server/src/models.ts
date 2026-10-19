import { model, Schema, Types } from 'mongoose';
import { GENDERS, LANGUAGES, LEVELS, REPORT_REASONS, type Gender, type Goal, type Language, type Level, type SportId, type TrainingTime } from '@spotter/shared/catalog';
import type { InviteStatus } from '@spotter/shared/types';

type Id = Types.ObjectId;

// ---- users -------------------------------------------------------------------

export interface Consent {
  kind: 'terms' | 'privacy' | 'sensitive' | 'marketing';
  granted: boolean;
  policyVersion: string;
  at: Date;
}

export interface Photo {
  _id: Id;
  file: string;
  createdAt: Date;
}

export interface User {
  _id: Id;
  email?: string;
  passwordHash?: string;
  name: string;
  birthdate: Date;
  gender: Gender | null;
  interestedIn: Gender[];
  cityId: string | null;
  /** GeoJSON point of the city centre — never the person's real position. */
  location?: { type: 'Point'; coordinates: [number, number] };
  bio: string;
  sports: { id: SportId; level: Level }[];
  trainingTimes: TrainingTime[];
  frequency: number;
  goals: Goal[];
  gym: string;
  workoutIdea: string;
  photos: Photo[];
  /** Append-only log: GDPR art. 7(1) requires being able to demonstrate consent. */
  consents: Consent[];
  prefs: { ageMin: number; ageMax: number; maxDistanceKm: number; language: Language };
  onboarded: boolean;
  snoozed: boolean;
  verified: boolean;
  isDemo: boolean;
  createdAt: Date;
  lastActiveAt: Date;
}

const userSchema = new Schema<User>(
  {
    email: { type: String, lowercase: true, trim: true },
    passwordHash: String,
    name: { type: String, required: true },
    birthdate: { type: Date, required: true },
    gender: { type: String, enum: [...GENDERS, null], default: null },
    interestedIn: { type: [String], enum: GENDERS, default: [] },
    cityId: { type: String, default: null },
    location: {
      type: new Schema({ type: { type: String, enum: ['Point'], required: true }, coordinates: { type: [Number], required: true } }, { _id: false }),
      default: undefined,
    },
    bio: { type: String, default: '' },
    sports: { type: [new Schema({ id: String, level: { type: String, enum: LEVELS } }, { _id: false })], default: [] },
    trainingTimes: { type: [String], default: [] },
    frequency: { type: Number, default: 3 },
    goals: { type: [String], default: [] },
    gym: { type: String, default: '' },
    workoutIdea: { type: String, default: '' },
    photos: { type: [new Schema({ file: String, createdAt: Date })], default: [] },
    consents: {
      type: [new Schema({ kind: String, granted: Boolean, policyVersion: String, at: Date }, { _id: false })],
      default: [],
    },
    prefs: {
      ageMin: { type: Number, default: 18 },
      ageMax: { type: Number, default: 99 },
      maxDistanceKm: { type: Number, default: 50 },
      language: { type: String, enum: LANGUAGES, default: 'en' },
    },
    onboarded: { type: Boolean, default: false },
    snoozed: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false },
    createdAt: { type: Date, required: true },
    lastActiveAt: { type: Date, required: true },
  },
  { versionKey: false },
);
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ location: '2dsphere' });
userSchema.index({ onboarded: 1, snoozed: 1, gender: 1 });
export const UserModel = model<User>('User', userSchema);

// ---- sessions ------------------------------------------------------------------

export interface Session {
  tokenHash: string;
  user: Id;
  createdAt: Date;
  expiresAt: Date;
}
const sessionSchema = new Schema<Session>(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, required: true, index: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);
// MongoDB deletes expired sessions by itself.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const SessionModel = model<Session>('Session', sessionSchema);

// ---- swipes ------------------------------------------------------------------------

export type SwipeAction = 'like' | 'pass' | 'spot';
export interface Swipe {
  swiper: Id;
  target: Id;
  action: SwipeAction;
  note: string;
  createdAt: Date;
}
const swipeSchema = new Schema<Swipe>(
  {
    swiper: { type: Schema.Types.ObjectId, required: true },
    target: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, enum: ['like', 'pass', 'spot'], required: true },
    note: { type: String, default: '' },
    createdAt: { type: Date, required: true },
  },
  { versionKey: false },
);
swipeSchema.index({ swiper: 1, target: 1 }, { unique: true });
swipeSchema.index({ target: 1, action: 1 });
export const SwipeModel = model<Swipe>('Swipe', swipeSchema);

// ---- matches -----------------------------------------------------------------------

export interface Match {
  _id: Id;
  /** The pair, sorted, so (userA, userB) is unique. */
  userA: Id;
  userB: Id;
  firstMoveBy: Id | null;
  firstMessageBy: Id | null;
  repliedAt: Date | null;
  expiresAt: Date | null;
  extended: boolean;
  createdAt: Date;
  lastActivityAt: Date;
}
const matchSchema = new Schema<Match>(
  {
    userA: { type: Schema.Types.ObjectId, required: true },
    userB: { type: Schema.Types.ObjectId, required: true },
    firstMoveBy: { type: Schema.Types.ObjectId, default: null },
    firstMessageBy: { type: Schema.Types.ObjectId, default: null },
    repliedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    extended: { type: Boolean, default: false },
    createdAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true },
  },
  { versionKey: false },
);
matchSchema.index({ userA: 1, userB: 1 }, { unique: true });
matchSchema.index({ userB: 1 });
export const MatchModel = model<Match>('Match', matchSchema);

// ---- messages ----------------------------------------------------------------------

export interface Message {
  _id: Id;
  match: Id;
  sender: Id;
  kind: 'text' | 'invite';
  body: string;
  invite: { sport: SportId; place: string; startsAt: Date; status: InviteStatus } | null;
  createdAt: Date;
  readAt: Date | null;
}
const messageSchema = new Schema<Message>(
  {
    match: { type: Schema.Types.ObjectId, required: true },
    sender: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ['text', 'invite'], required: true },
    body: { type: String, default: '' },
    invite: {
      type: new Schema(
        { sport: String, place: String, startsAt: Date, status: { type: String, enum: ['pending', 'accepted', 'declined'] } },
        { _id: false },
      ),
      default: null,
    },
    createdAt: { type: Date, required: true },
    readAt: { type: Date, default: null },
  },
  { versionKey: false },
);
messageSchema.index({ match: 1, createdAt: 1 });
messageSchema.index({ sender: 1 });
export const MessageModel = model<Message>('Message', messageSchema);

// ---- safety --------------------------------------------------------------------------

export interface Block {
  blocker: Id;
  blocked: Id;
  createdAt: Date;
}
const blockSchema = new Schema<Block>(
  {
    blocker: { type: Schema.Types.ObjectId, required: true },
    blocked: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { versionKey: false },
);
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
blockSchema.index({ blocked: 1 });
export const BlockModel = model<Block>('Block', blockSchema);

/** Kept (without the reporter) when accounts are deleted, so moderators can still act — DSA art. 16. */
export interface Report {
  _id: Id;
  reporter: Id | null;
  reported: Id | null;
  reason: (typeof REPORT_REASONS)[number];
  details: string;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: Date;
}
const reportSchema = new Schema<Report>(
  {
    reporter: { type: Schema.Types.ObjectId, default: null },
    reported: { type: Schema.Types.ObjectId, default: null },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, default: '' },
    status: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open' },
    createdAt: { type: Date, required: true },
  },
  { versionKey: false },
);
reportSchema.index({ status: 1, createdAt: 1 });
export const ReportModel = model<Report>('Report', reportSchema);

export const ALL_MODELS = [UserModel, SessionModel, SwipeModel, MatchModel, MessageModel, BlockModel, ReportModel];
