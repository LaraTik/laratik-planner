# Local dev — getting into the app without a real mailbox

The local `.env` ships with three sign-in paths. Pick the one that fits what you're doing.

## TL;DR

| Path                   | What you do                                                    | When                                             |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| **Dev sign-in page**   | Open `http://localhost:3000/dev/signin`, click "Sign in"       | Fastest. Use for everyday iteration.             |
| **Mailpit magic link** | Type your email on `/signin`, click the link in the Mailpit UI | When you want to test the real magic-link flow.  |
| **Google OAuth**       | Click "Continue with Google" on `/signin`                      | Only if you have a real OAuth client configured. |

The dev sign-in page is the path of least resistance for local dev. The other two exist so the production code paths get exercised before you ship.

## Path 1 — Dev sign-in (zero external dependency)

`src/app/dev/signin/page.tsx` is rendered only when `NODE_ENV !== "production"`. It calls a server action that upserts a user with any email, signs a 30-day NextAuth JWT cookie, and lands you on `/app`.

```
http://localhost:3000/dev/signin
```

Pre-fills `nizam.94@hotmail.com` and role `agency_admin`. Change the email/role if you need a different test user. The form action is a server action — works without client JS.

The 30-day cookie means you only do this once per browser. Restart the dev server and the cookie still works (signed with the same `AUTH_SECRET`).

**Companion API** (used by Playwright E2E): `POST /api/dev/sign-in` with JSON `{ email, name?, role? }`. Returns the user info; the session cookie is set via `Set-Cookie`. Same dev gate, same dev-only behavior. See `tests/e2e/auth-gate.spec.ts` for usage.

## Path 2 — Mailpit magic link (real Nodemailer → real SMTP)

Mailpit is a fake SMTP server that catches every email the app sends and shows them in a web UI. Use this when you need to verify the actual magic-link email content, link expiry, or the production email template.

### Start Mailpit (two options)

**Option A — Docker (matches the rest of the dev stack):**

```
docker compose -f docker-compose.dev.yml up -d mailpit
```

The compose file binds port `1025` (SMTP) and `8025` (web UI) to localhost.

**Option B — Homebrew (no Docker required):**

```
brew install mailpit
mailpit
```

Both produce the same result: SMTP on `localhost:1025`, web UI on `localhost:8025`. The `.env` is already wired to these ports.

### Use the magic link

1. Start the app: `pnpm dev`
2. Start Mailpit (A or B above)
3. Open `http://localhost:3000/signin` — the Google button is hidden (no `GOOGLE_CLIENT_ID`), but the email form is live because SMTP is configured
4. Type any email, click "Email me a sign-in link"
5. Open `http://localhost:8025` in a second tab — the magic-link email is there
6. Click the link in the email — you're signed in

The first user that signs in becomes the agency admin (after running through `/setup` with `BOOTSTRAP_SETUP_TOKEN`). All subsequent users are members.

### Reset Mailpit's inbox

Mailpit's inbox lives in the container. Reset with:

```
docker compose -f docker-compose.dev.yml restart mailpit
```

or just refresh the page (Mailpit clears on restart by default).

## Path 3 — Real Google OAuth

If you have a Google Cloud project and want to test the real OAuth redirect:

1. Visit https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client (Web application)
3. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Paste the Client ID + Client Secret into `.env` as `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
5. Restart `pnpm dev`
6. The "Continue with Google" button now appears on `/signin`

Full production walkthrough (including the prod redirect URI): `docs/operations/auth-setup.md`.

## What's running where

```
localhost:3000  Next.js dev server (HMR)
localhost:1025  Mailpit SMTP
localhost:8025  Mailpit web UI — http://localhost:8025
localhost:5432  Postgres (Docker via docker-compose.dev.yml, OR homebrew)
```

The Postgres port is shared between Docker and a local install. If you run both, change the port mapping in `docker-compose.dev.yml` to avoid the conflict. The repo's AGENTS.md assumes Docker, but the local `.env` works against either — `DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5432/planner` is host-agnostic.

## Troubleshooting

| Symptom                                                | Fix                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `/signin` shows "Sign-in providers are not configured" | One of: `GOOGLE_CLIENT_ID`+`SECRET` empty AND `SMTP_*` empty. The dev sign-in page works regardless.                             |
| Magic-link email never arrives in Mailpit              | Check Mailpit is running on `localhost:1025`. `docker compose -f docker-compose.dev.yml ps mailpit` should show `Up`.            |
| Magic link returns 404 / expired                       | NextAuth v5 magic links expire in 24h by default. Request a new one.                                                             |
| `pnpm dev` says `DATABASE_URL is required`             | `.env` is missing. `cp .env.example .env` and re-fill the keys.                                                                  |
| `pnpm db:migrate` fails with `type "x" already exists` | Half-applied local DB. Drop + recreate the database, then re-migrate. See the agent memory entry on drizzle-kit partial applies. |
| `pnpm dev` won't bind `:3000`                          | Another process owns the port. `lsof -i :3000` to find it.                                                                       |
