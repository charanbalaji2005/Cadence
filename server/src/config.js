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
  // Encrypts integration secrets saved from the admin panel. Without it, secrets can only come from env vars.
  integrationKey: process.env.INTEGRATION_ENCRYPTION_KEY || '',
  // Connect SRM AP. Admin panel settings override these; sign-in stays off until a verification endpoint is set.
  srmap: {
    enabled: process.env.SRMAP_ENABLED === 'true',
    directoryUrl: process.env.SRMAP_DIRECTORY_URL || 'https://oursrmap.purlyedit.in/api/typingmaster_connectsrmap_api.php',
    // Credential verification only. The directory API above just looks students up, so it never belongs here.
    verifyUrl: process.env.SRMAP_VERIFY_URL || '',
    // Secret: set in the environment (Render) or sealed from the admin panel. Never a default in source.
    apiKey: process.env.SRMAP_API_KEY || '',
    apiKeyHeader: process.env.SRMAP_API_KEY_HEADER || 'X-API-KEY',
    timeoutMs: Number(process.env.SRMAP_TIMEOUT_MS || 8000),
    emailDomains: (process.env.SRMAP_EMAIL_DOMAINS || 'srmap.edu.in').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    // Full register number format; capture group 1 must be the two-digit admission year.
    regnoPattern: process.env.SRMAP_REGNO_PATTERN || '^AP(\\d{2})\\d{9}$',
    // Admission years the institution has confirmed for that year code ("2017-2026" or "2023,2024").
    batchYears: process.env.SRMAP_BATCH_YEARS || `2017-${new Date().getFullYear()}`
  },
  cookieName: 'tf_session',
  sessionDays: 7,
  shortSessionHours: 24
};
