import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/typeflow',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  adminPassword: process.env.ADMIN_PASSWORD || 'CadenceAdmin#2026!SecureKey',
  // Secure cookies need HTTPS. Set COOKIE_SECURE=false only for local production builds served over plain HTTP.
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  // Comma-separated emails that become SUPER_ADMIN (how the first admin is created). Promotes only.
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  appVersion: process.env.APP_VERSION || process.env.npm_package_version || '2.0.0',
  cookieName: 'tf_session',
  sessionDays: 7,
  shortSessionHours: 24
};
