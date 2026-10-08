import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  // autoIndex builds the unique-username, unique-email and session-expiry indexes the app relies on.
  await mongoose.connect(config.mongoUri, { autoIndex: true });
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}
