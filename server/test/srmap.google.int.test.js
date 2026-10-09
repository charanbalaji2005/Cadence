/**
 * Google sign-in and Connect SRM AP stay separate: Google never lands in an account created with
 * Connect SRM AP just because the email matches, and ordinary Google sign-in is unchanged.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import express from 'express';
import cookieParser from 'cookie-parser';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { OAuth2Client } from 'google-auth-library';

process.env.GOOGLE_CLIENT_ID = 'test-google-client';
const { loadSession, csrfGuard } = await import('../src/middleware/auth.js');
const { default: authRoutes } = await import('../src/routes/auth.js');
const { User } = await import('../src/models/User.js');
const { IdentityBinding } = await import('../src/models/IdentityBinding.js');

let mongo, server, base;
let ipSeq = 1;
// The "Google token" is the email it vouches for.
OAuth2Client.prototype.verifyIdToken = async ({ idToken }) => ({ getPayload: () => ({ sub: `g-${idToken}`, email: idToken, email_verified: true, name: 'Test Person' }) });

const google = async email => {
  const res = await fetch(`${base}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'TypeFlow', 'X-Forwarded-For': `10.8.0.${ipSeq++}` },
    body: JSON.stringify({ credential: email })
  });
  return { status: res.status, body: await res.json(), cookie: res.headers.getSetCookie?.().find(c => c.startsWith('tf_session=')) };
};

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(mongo.getUri(), { autoIndex: true });
  await Promise.all(mongoose.modelNames().map(n => mongoose.model(n).init()));
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', loadSession, csrfGuard);
  app.use('/api/auth', authRoutes);
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const srm = await User.create({ username: 'srmstudent', usernameLower: 'srmstudent', usernameNormalized: 'srmstudent', email: 'student@srmap.edu.in', provider: 'srm_ap', profileCompleted: true, connectedAccounts: { srm_ap: { verified: true, batchYear: 2024, boundAt: new Date() } } });
  await IdentityBinding.create({ user: srm._id, provider: 'srm_ap', externalStudentId: 'STU-1', verifiedEmail: 'student@srmap.edu.in' });
  await User.create({ username: 'emailperson', usernameLower: 'emailperson', usernameNormalized: 'emailperson', email: 'person@example.com', provider: 'email', profileCompleted: true });
});

after(async () => {
  await new Promise(r => server.close(r));
  await mongoose.disconnect();
  await mongo.stop();
});

describe('Google and Connect SRM AP stay separate', () => {
  test('Google with the email of an SRM AP account is refused, not merged', async () => {
    const r = await google('student@srmap.edu.in');
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'srmap_account');
    assert.match(r.body.error, /Connect SRM AP/);
    assert.equal(r.cookie, undefined, 'no session');
    const u = await User.findOne({ email: 'student@srmap.edu.in' }).lean();
    assert.equal(u.googleId, undefined, 'Google was not attached');
    assert.equal(await User.countDocuments({ email: 'student@srmap.edu.in' }), 1);
  });

  test('new Google users sign up as before, without SRM AP branding', async () => {
    const r = await google('newgoogle@gmail.com');
    assert.equal(r.status, 201);
    assert.equal(r.body.user.provider, 'google');
    assert.equal(r.body.user.connections.srm_ap, null);
    assert.ok(r.cookie);
  });

  test('returning Google users sign in as before', async () => {
    const r = await google('newgoogle@gmail.com');
    assert.equal(r.status, 200);
    assert.equal(r.body.user.connections.srm_ap, null);
  });

  test('existing email/password accounts still pick up Google as before', async () => {
    const r = await google('person@example.com');
    assert.equal(r.status, 200);
    assert.equal(r.body.user.username, 'emailperson');
  });
});
