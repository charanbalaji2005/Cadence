# Connect SRM AP

Students can sign in to Cadence with their SRM AP identity. Accounts with a verified link show the
**Cadence × Connect SRM AP** branding, an "SRM AP Connected" badge and their batch.

> **Status: ready on Cadence's side; waiting for the updated PHP API to be uploaded.**
> `docs/php/typingmaster_connectsrmap_api.php` adds a `verify` action that checks the student's password on
> the SRM AP server (`password_verify`) and removes `password` from every response. Once it's uploaded,
> set `SRMAP_VERIFY_URL` to `https://oursrmap.purlyedit.in/api/typingmaster_connectsrmap_api.php?action=verify`.
> Until then the sign-in option shows a notice, and the admin connection test reports that the action isn't on
> the server yet. Treat the integration as production-ready only after a real student has been verified end to end.
>
> Deploying the PHP file:
> 1. Make a new API key (24+ random characters) and a new database password. The old ones were exposed and must be rotated.
> 2. Put them in `connectsrmap_config.php`, copied from `docs/php/connectsrmap_config.example.php`, two folders
>    above the script (outside `public_html`). Environment variables with the same names also work.
> 3. Upload `typingmaster_connectsrmap_api.php` to `public_html/api/`. In Render, set `SRMAP_API_KEY` to the new key,
>    `SRMAP_VERIFY_URL` as above and `SRMAP_ENABLED=true`.
> 4. Admin → Authentication → Connect SRM AP → **Test connection**: both checks should pass.
>
> The new file accepts the API key only in the `X-API-KEY` header or a POST field, never in the URL. It also
> sends no CORS headers, so a browser page that called the old API directly would stop working. Only servers
> should call it. Passwords are checked with `password_verify`, so they must be stored as `password_hash`
> hashes (the `$2y$…` values the API returned). A student whose password is stored in plain text can't sign in.

## SRM AP leaderboard

The Leaderboard page has an **everyone / SRM AP** switch. The SRM AP board (`/api/leaderboard?board=srmap`,
optionally `&batch=2024`) ranks only accounts with an active, verified SRM AP link, read from the server-written
`connectedAccounts.srm_ap`. Students leave it as soon as they're unbound. It uses the same scoring rules as the
main board. Entries on both boards carry only the public badge (`srmap: { batchYear }`), never names, emails or
register numbers.

## What the SRM AP API actually supports (checked 2026-10-09)

`https://oursrmap.purlyedit.in/api/typingmaster_connectsrmap_api.php`, with the key in `X-API-KEY`:

| Request | Answer |
| --- | --- |
| no key | 401 `Unauthorized: Invalid or missing API Key.` |
| `action=get_student&email=…` or `&register_number=…` | 200 with the student record, or 404 `Student not found.` |
| `action=get_student` with no identifier | 400 `Parameter missing…` (Cadence's connection test uses this, so no student data is fetched) |
| `action=list_students&limit=…&offset=…` | 200 with a page of student records |
| `action=verify` / `login` / `authenticate` / `auth` / `verify_student` | 400 `Unknown action provided.` |

It's a **directory lookup**. It has no operation that checks a student's credentials. Records contain
`name`, `email`, `class`, `section`, `gender`, `profile_photo` and **`password` (a bcrypt hash)**.
There's no stable student ID and no register-number field. Every response sends `Access-Control-Allow-Origin: *`.

Cadence never authenticates from this API. It doesn't compare passwords with the returned hashes, create
accounts from `list_students`, or link an account because an email matches. The verification URL check also
refuses this script, so it can't be configured as the verification endpoint by mistake.

## How it works

1. The student enters a register number (`AP24110010895`) or institutional email, plus their SRM AP password.
2. The browser sends these to the Cadence server only. The server forwards them to the SRM AP
   **verification endpoint** (`SRMAP_VERIFY_URL`) with the API key in the `X-API-KEY` header.
   The password is never stored, logged or kept in the browser.
3. The response is validated. Only allow-listed fields are kept, and password-like keys are dropped first.
   The returned record must match what the student typed.
4. What happens next:
   - **Identity already linked:** the student is signed in to that account and the old session is rotated.
   - **New identity:** a 15-minute pending record is created and the student picks a username (with
     suggestions). The account and the link are created only after they confirm.
   - **Email already used by another Cadence account:** nothing is merged. The student is asked to sign in
     to that account and connect SRM AP from **Account settings**, which proves they own both.
   Existing links are matched by the stable `student_id` only. A different `student_id` with the same email
   is treated as a new identity, never as the existing account.
5. **After the account and link exist**, Cadence fetches that one student's record from the directory API
   (`action=get_student`, by the verified register number or verified email) and saves the approved
   attributes on the link: name, class, section, gender and photo. The record's email must match the
   verified email. `password` and every other sensitive key are dropped before parsing.
   The result is recorded in `profileSync` (`synced`, `pending`, `failed` or `not_found`). A failed fetch
   never undoes the account. It's retried on the next verified sign-in, from **Account settings → Try again**,
   or by an admin (**Re-fetch details**). A synced profile is refreshed at most once a day, on sign-in.
6. `User.connectedAccounts.srm_ap` is written only by `server/src/services/srmap/bindings.js`.
   It's exposed as `user.connections.srm_ap` from `/api/auth/me`, and the shared `Logo` component
   reads it. Branding never depends on anything the browser stores.

The directory API (`typingmaster_connectsrmap_api.php`) is used for connection tests and for the individual
`get_student` fetch in step 5. Cadence never calls `list_students`, and it never imports the directory.
Looking up a student's details is not the same as verifying their credentials, so a lookup never signs anyone in.

**Google and GitHub stay separate.** They still attach to an existing email/password account with the same
verified email, as before. But they refuse to sign in to an account created with Connect SRM AP
(`409 srmap_account`) instead of merging into it. A student who wants both links them from Account settings.

## Verification endpoint contract (SRM AP side)

```
POST {SRMAP_VERIFY_URL}
X-API-KEY: <shared secret>
Content-Type: application/json

{ "identifier": "AP24110010895", "identifier_type": "register_number", "password": "…" }
```

`identifier_type` is `register_number` or `email`.

**Success (HTTP 200):**

```json
{
  "status": true,
  "verified": true,
  "student": {
    "student_id": "immutable institutional id",
    "register_number": "AP24110010895",
    "name": "Full Name",
    "email": "name@srmap.edu.in",
    "batch": 2024,
    "class": "optional",
    "section": "optional",
    "photo": "https://… (optional)"
  }
}
```

**Wrong credentials:** HTTP 401, or HTTP 200 with `{ "status": false, "verified": false }`.

**Bad API key:** HTTP 401/403 with `{ "code": "invalid_api_key" }`, or a message that mentions "API key".

Requirements:

- `student_id` must be stable and never reassigned. Cadence binds accounts to it.
- `register_number` or `email` must match what the student typed, or the sign-in is refused.
- `email` is needed to create a new Cadence account.
- `batch` is optional. When it's missing, Cadence derives it from the register number, but only when
  that year is in `SRMAP_BATCH_YEARS`.
- Never include passwords, password hashes, tokens or other credentials in any response.
- Rate-limit by identifier on the SRM AP side too.

## Required changes to the PHP API (owner action)

1. **Urgent:** remove password and password-hash columns from every SQL `SELECT` and every JSON response.
   `list_students` currently returns every student's bcrypt hash to anyone holding the API key.
2. Move hard-coded database credentials and API keys into environment variables.
3. **Rotate** every credential that was ever hard-coded or exposed: database password and API key.
4. Implement and document the verification endpoint above. It must check credentials server-side,
   for example `password_verify` against the stored hash, and return only the allow-listed fields.
5. Replace `Access-Control-Allow-Origin: *` with no CORS at all. Only the Cadence server calls the API.
6. Return an immutable `student_id` and the `register_number` in verification responses.
7. Alternatively, offer standard SSO (OAuth 2.0 / OpenID Connect) through the university identity provider.
   Cadence would then redirect to SRM AP and never see the student's password.

## Configuration

Set these on the Cadence server (Render → Environment). See `server/.env.example`.

| Variable | Purpose |
| --- | --- |
| `SRMAP_ENABLED` | `true` to show the sign-in option |
| `SRMAP_VERIFY_URL` | HTTPS verification endpoint (required for sign-in) |
| `SRMAP_DIRECTORY_URL` | Directory API: connection tests and the per-student `get_student` fetch after verification |
| `SRMAP_API_KEY` | Shared secret, sent only from the server |
| `SRMAP_API_KEY_HEADER` | Header name (default `X-API-KEY`) |
| `SRMAP_TIMEOUT_MS` | Provider timeout (default 8000) |
| `SRMAP_EMAIL_DOMAINS` | Accepted institutional email domains |
| `SRMAP_REGNO_PATTERN` | Register number regex; group 1 is the two-digit admission year |
| `SRMAP_BATCH_YEARS` | Confirmed admission years, e.g. `2017-2026` |
| `INTEGRATION_ENCRYPTION_KEY` | Lets admins save the API key in the panel (stored AES-256-GCM encrypted) |

In **Admin → Authentication → Connect SRM AP**, admins can switch the integration on or off, override the
endpoints, replace the API key, test the connection, and search, inspect and unbind student links.
They can also filter links by profile status and re-fetch one student's details. Re-fetches and unbinds
are audit-logged.
Values saved there override the environment variables. Clearing a field falls back to the environment variable.

## Data stored

The `identitybindings` collection has these unique indexes, which apply to active links only:

- `{ provider, externalStudentId }`: one SRM AP identity maps to at most one Cadence account.
- `{ user, provider }`: one SRM AP identity per Cadence account.

Usernames are protected by the existing unique `usernameNormalized` index.

Each binding stores:

- the stable student ID (`externalStudentId`), the Cadence user (`user`) and `provider: "srm_ap"`
- the masked register number (`Apxxxxxxxxxxx`) and its hash, used for admin search
- the verified email and name
- the batch and its source (`provider` or `register_number`; never guessed)
- class, section and gender, from the student's own directory record
- an https photo URL, if one was provided (an `http` photo on the directory's own host is upgraded to https)
- `identityVerified`, `consentAt`, `boundAt`, `lastAuthenticatedAt`
- `profileSync`: `status`, `syncedAt`, `attemptedAt`, `attempts`, `lastError` (an error code, never a response body)
- a short history (bound, sign-ins, fetches, unbinding)

The account itself (`User.connectedAccounts.srm_ap`) holds only `verified`, `batchYear` and `boundAt`.
`User.provider` is `srm_ap` and `User.createdAt` is the account creation time. Public profiles and friend
cards show only the verified badge and batch. The student sees their own details in Account settings, and
admins see them in the admin panel.

The SRM AP photo is **not** copied into the public avatar, because its URL contains the full register number
(`…/profile_photos/AP24110010895.jpg`). Phone numbers, addresses, full register numbers, passwords, password
hashes and API keys are never stored. Unbinding keeps the record (inactive) for the audit trail. Deleting an
account removes its bindings.

The `pendingsignups` collection deletes its records automatically after 15 minutes. `integrationconfigs`
holds admin overrides, with the API key encrypted.

## Cleaning up data from earlier builds

Earlier builds of this branch created accounts from the directory API and signed students in by comparing
passwords with its hashes. If such a build ever ran against a real database, run this from `server/`
with that database's `MONGO_URI`:

```
node scripts/srmap-cleanup.js           # dry run: counts only
node scripts/srmap-cleanup.js --apply   # end unverified links, delete unused synced accounts, scrub copied details
```

Accounts that have typing history are never deleted. The script also clears avatars that were copied from SRM AP
photo URLs. Run it **once, before** a real verification endpoint is configured: it ends every active link.
