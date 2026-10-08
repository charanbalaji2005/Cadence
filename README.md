# TypeFlow (MERN)

A typing test with accounts, a live leaderboard, stats and history, 32 themes and a mobile layout.

- **MongoDB** with Mongoose: users, sessions, results, key stats, personal bests
- **Express 5** API: email and Google sign-in, 7-day session cookies, results, leaderboard
- **React 18** with Vite and React Router: the typing test, login and register pages, stats, settings, account
- **Node 20+**

## Project layout

```
typeflow-mern/
├── server/                 Express API
│   └── src/
│       ├── index.js        app setup, security headers, CORS, rate limits, serves the client in production
│       ├── config.js       environment settings
│       ├── db.js           MongoDB connection
│       ├── models/         User, Session (auto-expiring), Result
│       ├── routes/         auth, me, results, leaderboard
│       ├── middleware/     session loading, login guard, CSRF guard
│       └── utils/          validation (zod), sessions, ranking and anti-cheat rules
├── client/                 React app
│   └── src/
│       ├── pages/          Test, Login/Register, Leaderboard, Stats, Settings, Account, About
│       ├── components/     header, tab bar, config bar, results, charts, theme picker, command palette, dialogs
│       ├── context/        auth, settings (synced to the account), UI (toasts, overlays, Caps Lock)
│       └── lib/            typing engine, data store, themes, charts, sounds, achievements, API client
├── Dockerfile
└── docker-compose.yml
```

## Run it locally

You need Node 20 or newer and MongoDB (installed locally, in Docker, or a free MongoDB Atlas cluster).

```bash
npm run install:all
cp server/.env.example server/.env      # then set MONGO_URI if you're not using a local MongoDB
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the API on port 5000, so the session cookie works without extra setup.

To start only MongoDB with Docker: `docker run -d -p 27017:27017 --name typeflow-mongo mongo:7`

## Google sign-in

1. In Google Cloud Console, open **APIs & Services > Credentials** and create an **OAuth client ID** of type **Web application**.
2. Under **Authorized JavaScript origins**, add every address the site runs on, for example `http://localhost:5173`, `http://localhost:5000` and `https://yourdomain.com`.
3. Put the client ID in `server/.env` as `GOOGLE_CLIENT_ID=...` and restart the server.

The browser gets an ID token from Google, and the server verifies it with `google-auth-library` before creating the session. No client secret is needed. Until a client ID is set, the Google button explains that it's not configured.

## Sessions

- Logging in creates a session document in MongoDB and sets an `HttpOnly`, `SameSite=Lax` cookie named `tf_session`. The cookie is `Secure` in production.
- With **Keep me signed in** checked, the session lasts **7 days**. Without it, the cookie ends when the browser closes, and the server drops the session after 24 hours.
- MongoDB deletes expired sessions automatically through a TTL index. Signing out deletes the session straight away, and **Sign out everywhere** on the Account page ends every session.
- Only a SHA-256 hash of the session token is stored, so a database leak doesn't expose live sessions.

## Production

### One container (simplest)

```bash
docker compose up --build
```

Open http://localhost:5000. Express serves the built React app and the API from the same origin. Put it behind HTTPS (a reverse proxy or your host's TLS), then remove `COOKIE_SECURE: "false"` from `docker-compose.yml`.

### Without Docker

```bash
npm run build                 # builds client/dist
NODE_ENV=production npm start # Express serves client/dist and /api
```

Set `MONGO_URI`, `CLIENT_ORIGIN` (your site's URL) and `GOOGLE_CLIENT_ID` in the environment. Render, Railway, Fly.io or a VPS with MongoDB Atlas all work.

### Client and API on different hosts

Build the client with `VITE_API_URL=https://api.yourdomain.com` and set the server's `CLIENT_ORIGIN=https://yourdomain.com`. Keep both on the same site (for example `app.yourdomain.com` and `api.yourdomain.com`) so the `SameSite=Lax` session cookie is still sent.

## API

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| GET | `/api/auth/me` | anyone | Current user, session expiry, saved settings, Google client ID |
| GET | `/api/auth/username-available?username=` | anyone | Live username check for the register page |
| POST | `/api/auth/register` | anyone | `{ username, email, password, remember }` |
| POST | `/api/auth/login` | anyone | `{ email, password, remember }` |
| POST | `/api/auth/google` | anyone | `{ credential, remember }`: verifies the Google ID token |
| POST | `/api/auth/logout` | anyone | Ends this session |
| POST | `/api/auth/logout-all` | signed in | Ends every session for the account |
| PATCH | `/api/me` | signed in | Change username |
| PUT | `/api/me/settings` | signed in | Save settings so they follow the account |
| GET | `/api/me/keys` | signed in | Per-key accuracy and timing, personal bests |
| DELETE | `/api/me` | signed in | Delete the account, its results and sessions |
| GET | `/api/results` | signed in | Result history (latest 2000) |
| POST | `/api/results` | signed in | Save a result; returns personal best and leaderboard rank |
| POST | `/api/results/import` | signed in | Move guest results into the account (never ranked) |
| DELETE | `/api/results` | signed in | Clear history, key stats and personal bests |
| GET | `/api/leaderboard?length=15\|60&range=all\|today&tz=` | anyone | Top 100 plus your own rank |

All POST, PUT, PATCH and DELETE requests must send `X-Requested-With: TypeFlow`. Browsers can't add that header cross-site without passing CORS, which protects against CSRF.

## Leaderboard rules

Only signed-in players appear. A result counts when it's a 15 or 60 second English test without punctuation or numbers, has at least 75% accuracy, and passes the server's consistency checks. Those checks reject results whose speed, raw speed, character counts and duration don't agree. Guests can view the board.

## Security summary

- Passwords hashed with bcrypt (cost 12); login timing doesn't reveal which emails exist
- Every request body validated with zod
- Rate limits on the whole API and stricter ones on sign-in routes
- Helmet security headers with a Content Security Policy that allows only Google sign-in and Google Fonts
- CORS restricted to `CLIENT_ORIGIN`, with credentials
- Results carry a client ID, so a retried save never creates a duplicate
