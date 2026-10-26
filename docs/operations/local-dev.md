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
localhost:3000  Next.js dev server (HMR) — runs natively, never containerised
localhost:1025  Mailpit SMTP
localhost:8025  Mailpit web UI — http://localhost:8025
localhost:5436  Postgres (Docker via docker-compose.dev.yml)
```

**One container.** The planner's local Docker footprint is a single Postgres
container, `laratik-planner-pg-dev`, started with
`docker compose -f docker-compose.dev.yml up -d postgres`. It serves both the
development database (`planner`) and the disposable test database
(`planner_test`). Mailpit is the only other service and it is opt-in — start
it only when you are testing the magic-link email flow.

The container publishes Postgres on **5436**, not the conventional 5432. A
native PostgreSQL (Homebrew, Postgres.app) very often owns `127.0.0.1:5432` on
a developer machine, and the more specific loopback bind beats Docker's
`0.0.0.0` bind — so a 5432 publish silently sends every connection to the
native server while the container still reports itself healthy. The dedicated
port makes the target unambiguous:

```bash
psql "$DATABASE_URL" -tAc 'select current_database(), current_setting($$data_directory$$)'
# planner | /var/lib/postgresql/data   ← the container
```

The local `.env` points at that port:
`DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5436/planner`.
If you prefer a native PostgreSQL, stop the container and point `DATABASE_URL`
at your own server — but never publish the container on 5432 while a native
server holds the loopback bind.

Anything else you start for a one-off job — the production-snapshot server, a
fallback test database — should be removed when that job ends. Leftover
containers are what make the planner look like it owns four or five containers
when it owns one.

For a reusable, credential-scrubbed copy of production data, see
[`local-production-snapshot.md`](local-production-snapshot.md). Its `run`
command uses the isolated `planner_snapshot` database in a separate local
Postgres container (port 5434 by default) and does not point the local app at
production.

## Troubleshooting

| Symptom                                                | Fix                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `/signin` shows "Sign-in providers are not configured" | One of: `GOOGLE_CLIENT_ID`+`SECRET` empty AND `SMTP_*` empty. The dev sign-in page works regardless.                             |
| Magic-link email never arrives in Mailpit              | Check Mailpit is running on `localhost:1025`. `docker compose -f docker-compose.dev.yml ps mailpit` should show `Up`.            |
| Magic link returns 404 / expired                       | NextAuth v5 magic links expire in 24h by default. Request a new one.                                                             |
| `pnpm dev` says `DATABASE_URL is required`             | `.env` is missing. `cp .env.example .env` and re-fill the keys.                                                                  |
| `pnpm db:migrate` fails with `type "x" already exists` | Half-applied local DB. Drop + recreate the database, then re-migrate. See the agent memory entry on drizzle-kit partial applies. |
| `pnpm dev` won't bind `:3000`                          | Another process owns the port. `lsof -i :3000` to find it.                                                                       |
