# Auth setup — Google OAuth and Mailcow SMTP for production

Goal 2 of the master prompt is "closed auth, bootstrap, reset, invitation onboarding" — NextAuth v5 with **Google OAuth** _or_ **email magic link** (no passwords). This runbook walks through getting both providers live on `planner.laratik.com`.

Local dev uses the dev sign-in page and Mailpit instead. See [`local-dev.md`](./local-dev.md).

## Overview

| Provider                | Who configures it                | Time   | Where the secret lives                                    |
| ----------------------- | -------------------------------- | ------ | --------------------------------------------------------- |
| Google OAuth            | You, in Google Cloud Console     | ~5 min | `.env` (local) and `docker-compose.yml` env section (VPS) |
| Mailcow SMTP            | You, in `mail.laratik.com` admin | ~5 min | Same as above                                             |
| `BOOTSTRAP_SETUP_TOKEN` | You, generate locally            | ~30 s  | Same as above                                             |

The VPS deploy workflow reads the runtime env from the host's `.env` (mounted into the container). Locally, the `.env` you have already has the right keys — you just need to fill the empty values.

---

## 1. Google OAuth

### 1.1 — Create the OAuth client

1. Open https://console.cloud.google.com/apis/credentials
2. At the top, pick (or create) the project that owns `planner.laratik.com`. The project is separate from any other LaraTik project — one project per app keeps the OAuth consent screen scoped.
3. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
4. Application type: **Web application**
5. Name: `laratik-planner (prod)` (and a second one called `laratik-planner (local)` if you also want it on your dev box)
6. **Authorized JavaScript origins** (for local dev):
   ```
   http://localhost:3000
   ```
7. **Authorized redirect URIs** (BOTH must be added):
   ```
   http://localhost:3000/api/auth/callback/google
   https://planner.laratik.com/api/auth/callback/google
   ```
8. Click **Create**. Copy the **Client ID** and **Client Secret** that appear.

### 1.2 — Configure the OAuth consent screen (first time only)

If you haven't already:

1. https://console.cloud.google.com/apis/credentials/consent
2. User type: **External** (unless this is for a Google Workspace org — then **Internal**)
3. App name: `laratik-planner`
4. Support email: your LaraTik admin email
5. Scopes: `email`, `profile`, `openid` (the defaults)
6. Test users: add the agency staff who'll be using it pre-launch
7. **Publish app** when ready (otherwise it stays in "Testing" mode and only test users can sign in)

### 1.3 — Fill the secrets

Local `.env`:

```
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
```

VPS `/opt/laratik-planner/.env` (the one mounted into the container):

```
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
```

Both must match the redirect URIs you registered. Restart the app after each edit:

- Local: stop and re-run `pnpm dev`
- VPS: `./scripts/project.sh restart app`

---

## 2. Mailcow SMTP

`mail.laratik.com` is already running on the VPS per `PORT_NOTES.md`. The mailbox `no-reply@planner.laratik.com` should already be provisioned (check Mailcow admin). If not, create it.

### 2.1 — Get the SMTP password

1. Log into `https://mail.laratik.com` as the domain admin
2. **Mailcow UI → Mailboxes → Edit `no-reply@planner.laratik.com`**
3. Set a new password (or copy the existing one)
4. Copy the value

### 2.2 — Verify the SMTP port is reachable from the VPS

From the VPS:

```
$ nc -zv mail.laratik.com 587
Connection to mail.laratik.com 587 port [tcp/submission] succeeded!
$ openssl s_client -starttls smtp -connect mail.laratik.com:587 < /dev/null 2>&1 | grep "Verify return code"
```

If the second command returns `Verify return code: 0 (ok)`, the certificate is valid. If it returns a code other than 0, the SSL chain is broken — fix that before going further.

### 2.3 — Fill the secrets

Local `.env` (for testing the prod SMTP from your dev box — optional but useful):

```
SMTP_HOST=mail.laratik.com
SMTP_PORT=587
SMTP_USER=no-reply@planner.laratik.com
SMTP_PASSWORD=<value from step 2.1>
SMTP_FROM="laratik-planner <no-reply@planner.laratik.com>"
```

VPS `/opt/laratik-planner/.env`:

```
SMTP_HOST=mail.laratik.com
SMTP_PORT=587
SMTP_USER=no-reply@planner.laratik.com
SMTP_PASSWORD=<value from step 2.1>
SMTP_FROM="laratik-planner <no-reply@planner.laratik.com>"
```

Restart after each edit.

### 2.4 — Test the magic link end-to-end

From the VPS:

```
$ ./scripts/project.sh shell app
# inside the container:
$ node -e "
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ host: 'mail.laratik.com', port: 587, auth: { user: 'no-reply@planner.laratik.com', pass: process.env.SMTP_PASSWORD }, requireTLS: true });
  t.sendMail({ from: 'no-reply@planner.laratik.com', to: 'YOUR_REAL_INBOX@example.com', subject: 'test', text: 'hi' }).then(r => console.log('ok', r.messageId)).catch(e => { console.error(e); process.exit(1); });
"
```

If that succeeds, the production magic-link flow is wired.

---

## 3. `BOOTSTRAP_SETUP_TOKEN`

A pre-shared secret that the first user must enter at `/setup` to bootstrap the agency admin. After the first admin exists, the token is operationally irrelevant (the bootstrap function refuses to run a second time).

### 3.1 — Generate

```
$ node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Copy the output.

### 3.2 — Fill

Local `.env` and VPS `.env`:

```
BOOTSTRAP_SETUP_TOKEN=<value from step 3.1>
```

### 3.3 — Bootstrap

The first time you sign in (via Google or magic link), NextAuth redirects to `/setup`. Enter:

- Agency name
- Agency slug (lowercase, used in URLs)
- The `BOOTSTRAP_SETUP_TOKEN` from `.env`

After submit: agency exists, you're `agency_admin`, JWT carries `role: "agency_admin"`. Future bootstrap attempts are refused by `bootstrapFirstAdmin()` (advisory lock + admin-exists check).

---

## 4. Verify

After restarting the app with all four secrets in place:

```
# From the VPS
$ curl -sS https://planner.laratik.com/api/health | jq
{
  "ok": true,
  "version": "0.1.0",
  "env": "production",
  "db": "up",
  "schema": "ready"
}

# Open https://planner.laratik.com/signin in a browser
# "Continue with Google" button is visible
# "Email me a sign-in link" form is visible (no "not configured" warning)
```

Both buttons working = Goal 2 is done.

## 5. Rotate

| Secret                  | Rotation cadence                    | How                                                                                         |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_SECRET`  | If leaked, or every 12 months       | Regenerate in Google Cloud Console, update `.env` on VPS, restart.                          |
| `SMTP_PASSWORD`         | If leaked, or every 12 months       | Reset in Mailcow admin, update `.env` on VPS, restart.                                      |
| `AUTH_SECRET`           | If leaked, or every 12 months       | New value, update `.env` on VPS, restart. **Note: this invalidates all existing sessions.** |
| `BOOTSTRAP_SETUP_TOKEN` | Not needed after first admin exists | Leave alone.                                                                                |
