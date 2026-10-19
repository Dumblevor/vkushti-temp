import mongoose from 'mongoose';
import { ALL_MODELS } from './models.js';

export async function connectDb(uri: string) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Build indexes up front (2dsphere for discovery, TTL for sessions, uniqueness constraints).
  await Promise.all(ALL_MODELS.map((m) => m.syncIndexes()));
  return mongoose.connection;
}

export const disconnectDb = () => mongoose.disconnect();
