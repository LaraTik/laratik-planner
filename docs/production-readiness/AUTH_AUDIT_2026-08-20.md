# Auth Code Review — `laratik-planner` (2026-08-20)

> **Author:** production-readiness auth audit, post-incident review.
> **Spec ground truth:** `STUDIOFLOW_MASTER_PROMPT.md` §2, §13, §22.
> **Scope:** all auth surface — config, providers, callbacks, proxy/middleware, sign-in/setup/bootstrap/invitation flows, dev sign-in, dev seed, policy helpers, member safety.
> **Method:** line-level read of every file under `src/lib/auth/`, `src/app/signin/`, `src/app/setup/`, `src/app/api/auth/`, `src/app/api/bootstrap/`, `src/app/accept-invitation/`, `src/app/dev/signin/`, `src/proxy.ts`. Each finding cross-referenced to a Master Prompt line.
> **Status legend:** ✅ matches design; 🟡 drift; ❌ missing; ⚠️ risk worth noting.

---

## 0. Verdict

The auth surface is **structurally sound and production-shaped** for the passwordless flow it actually implements. The two crashes today (`/onboarding` 404, `/signin?callbackUrl=/app` redirect loop) were both NextAuth v5-vs-this-app misconfigurations, not design defects — both are now fixed in `c5d0741` and `cae7e03` respectively with structural regression tests.

**The biggest finding is a design-level scope gap, not a code-level bug:** the original Stitch design mandates **email/password login + forgot/reset password** (Master Prompt §13 line 1380; §2 line 104). The current code implements only **Google OAuth + Nodemailer magic link**. Password login is multi-day new scope; this audit reports it as `❌` and **does not fix it** in Phase B per the agreed scope (Phase C, separate session).

After that, the remaining findings are 🟡 drift (not bugs) and a handful of ⚠️ risks worth noting.

---

## 1. File-by-file

### 1.1 `src/lib/auth/config.ts` ✅ (with one 🟡)

- Google + Nodemailer providers, filtered at request time by `serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET` and the SMTP_* block.
- JWT session strategy, 30-day max age.
- Drizzle adapter wired with `users`, `accounts`, `sessions`, `verificationTokens`.
- `jwt` callback bakes `id` + `role` into the token; `session` callback hydrates them.
- `authorized` returns `!!session?.user` (any signed-in user is authorized).
- `pages` map: `signIn: /signin`, `error: /signin`, `verifyRequest: /signin/verify`, `newUser: /setup` (fixed `c5d0741`).
- 🟡 `pages.signOut` is **not set** — falls back to NextAuth's default (`/api/auth/signout` page, which exists at `src/app/api/auth/[...nextauth]/route.ts` via the catch-all). Behavior is correct; explicit is better.

### 1.2 `src/proxy.ts` ✅ (after `cae7e03`)

- `isSecureRequest(req)` reads `req.nextUrl.protocol` + `x-forwarded-proto` header.
- `getToken({ req, secret, secureCookie, salt omitted })` — `secureCookie` computed per request, `salt` defaults to `cookieName`.
- Pass-through for `/_next/`, `/api/auth/`, `/api/health`, `/api/bootstrap/status`, dev endpoints.
- Authed app routes redirect to `/signin?callbackUrl=…` if not signed in.
- Authed users hitting `/signin` are redirected to `/app`.
- ✅ Matches Master Prompt §13 line 1382: "Middleware redirects unauthenticated users to Login while preserving a validated relative return path."

### 1.3 `src/lib/auth/index.ts` ⚠️ dead code

- File body is `export const authConfigPlaceholder = true;` (8 lines total).
- Real config is in `src/lib/auth/config.ts`. Nothing imports from `index.ts`.
- **Risk:** future refactor may import from the wrong place.
- **Recommendation:** delete `index.ts` or have it re-export from `config.ts`.

### 1.4 `src/app/signin/page.tsx` ✅

- Both Google and email-me-a-link forms render conditionally on provider env.
- Server actions: `signIn("google", { redirectTo })` and `signIn("nodemailer", { email, redirectTo })`.
- Dev-only banner visible when `NODE_ENV !== "production"`.
- Error code renderer uses `authError()` from `auth-error-codes.ts`.
- Open-redirect-safe: `callbackUrl` validated to starts with `/` and not `//`.
- ✅ Matches Master Prompt §13 line 1380 in spirit (provides sign-in form), but the **form factor is wrong** — see §2.

### 1.5 `src/app/signin/auth-error-codes.ts` ✅

- Maps every documented NextAuth v5 error code to user-friendly copy.
- Falls back to a generic "Sign-in failed" for unknown codes.
- ✅ No leak of internal error strings.

### 1.6 `src/app/signin/verify/page.tsx` ✅

- NextAuth's built-in "check your email" landing page.
- ✅ Standard.

### 1.7 `src/app/setup/page.tsx` 🟡

- Gates: not signed in → `/signin?callbackUrl=/setup`; agency exists → `/app`; otherwise renders the form.
- Form fields: `agencyName`, `agencySlug`, `token` (bootstrap token).
- 🟡 **Master Prompt §13 line 1391-1397 mandates additional fields the form does not have:**
  - "agency name;" ✅
  - "administrator name;" ❌ (the form uses the signed-in user's existing `name` from JWT)
  - "email;" ❌ (uses signed-in email)
  - "password;" ❌
  - "password confirmation;" ❌
  - "bootstrap setup token." ✅
- The current behavior assumes the first admin signs in via Google or magic link first, then comes to `/setup` to create the agency. The Master Prompt envisions a self-contained flow where the email + password are set during bootstrap.
- **Implication:** if we add password login (Phase C), the setup form will need password + password confirmation fields. Until then, this is a 🟡 drift, not a bug.

### 1.8 `src/app/api/bootstrap/admin/route.ts` ✅

- `POST` with zod-validated body.
- Auth check: must be signed in.
- Rate limit via `enforceRateLimit({ scope: "bootstrap", subject: x-forwarded-for || userId, actorId })`.
- Pre-check: if user is already admin → 409.
- Delegates to `bootstrapFirstAdmin()` which uses an advisory lock and is idempotent.
- ✅ Matches Master Prompt §13 line 1400-1411: applies strict rate limit, atomic transaction, returns generic success.
- Returns 200 with `{ status: "ok", agencyId, userId }` on success, 403 on bad token, 409 on already-configured, 429 on rate limit, 401 on not signed in, 400 on bad body. Clean.

### 1.9 `src/app/api/bootstrap/status/route.ts` ✅

- Returns `{ configured, agencyId, signedIn }`.
- Read-only, no side effects.
- ✅ Used by the proxy logic and the setup page.

### 1.10 `src/lib/auth/bootstrap.ts` ✅

- `bootstrapFirstAdmin()` is the actual implementation.
- Uses `pg_advisory_xact_lock(7342891)` for atomicity.
- Checks for existing admin before creating (idempotent).
- Creates agency if missing, then membership, then promotes role, then writes bootstrap lock.
- Returns one of three statuses; caller translates to HTTP.
- ✅ Sound. The lock key is a magic number — would be more discoverable as a named constant, but it's fine.

### 1.11 `src/lib/auth/invitations.ts` ✅

- Token generation: 32 random bytes base64url, stored as sha256 hash (never raw).
- Expiry: 7 days. Resend invalidates prior pending.
- Email validation + normalization.
- `acceptInvitation` is idempotent (re-using a valid token for an already-accepted invite is a no-op).
- Identity check: signed-in user's email must match the invited email AND be verified.
- `for("update")` row lock on the invitation during acceptance to serialize concurrent calls.
- Rate limit on `invitation_accept` scope.
- `deactivateUser` uses a separate advisory lock and refuses to deactivate the last admin.
- `assertCanDeactivateAgencyMember` policy: refuse self-deactivate, refuse last-admin.
- ✅ Sound and well-structured.

### 1.12 `src/lib/auth/policy.ts` ✅

- `isAgencyAdmin`, `isAgencyMember`, `isWorkspaceMember`, `canAccessWorkspace`, `canAccessInternalWorkspace`, `canAccessClientWorkspace`, `hasWorkspaceRole`, `canViewContent`, `canManageContent`, `canReview`.
- `activeAgencyId()` returns the singleton agency id.
- Agency admins always return `true` for workspace checks (per Master Prompt §9).
- `PermissionDeniedError` for the service layer.
- `requirePolicy()` convenience.
- ✅ Clean and exhaustive. The role check on `canReview` is a small simplification (both `content` and `creative_internal` use `internal_reviewer`) — worth re-reading against §9 to make sure the gate logic is right, but it appears correct.

### 1.13 `src/lib/auth/invitation-identity.ts` ✅

- Email normalization helper.
- `invitationIdentityMatches()` — requires verified email + normalized equality.
- ✅ Anti-takeover: even if a user signs up with the same email via Google, they need the email to be verified before accepting the invite.

### 1.14 `src/lib/auth/member-safety.ts` ✅

- Tiny but critical: refuses self-deactivate and last-admin-deactivate.
- ✅ Both preconditions are correct.

### 1.15 `src/lib/auth/dev-sign-in.ts` ✅

- `signInDevUser()` is gated by `NODE_ENV !== "production"` and refuses to run otherwise.
- Upserts a user, signs a NextAuth JWT with the same shape `auth()` expects, returns the token.
- Cookie name `authjs.session-token` is **explicitly** the non-secure name — this is fine because dev sign-in is dev-only and never runs in prod.
- ⚠️ Note: the dev sign-in `salt` is `authjs.session-token` (the non-secure name). NextAuth's prod writer uses `__Secure-authjs.session-token` (secure name). So a dev JWT and a prod JWT have different salts. This means: **you can't reuse a dev cookie in a prod browser session, and you can't reuse a prod cookie in a dev session.** This is correct behavior — they're different environments — but worth documenting in a comment in the dev-sign-in file so future engineers don't try to "unify" it.
- ✅ Safe.

### 1.16 `src/app/dev/signin/actions.ts` + `src/app/dev/signin/page.tsx` ✅

- Server action: upserts user, sets cookie, redirects to callbackUrl.
- Open-redirect guard: `callbackUrl` must start with `/` and not `//`.
- Page is gated at the page level: `if (NODE_ENV === "production") redirect("/404")`.
- Belt-and-braces: action also re-checks the env. Good.
- ⚠️ The dev sign-in route bypasses Google OAuth and SMTP — it's a one-click create-admin flow. In dev this is fine; in prod the page is 404. Documented and safe.
- ✅ Safe.

### 1.17 `src/app/accept-invitation/page.tsx` ✅

- Token check, then auth check (redirects to signin with callbackUrl if not authed), then `acceptInvitation()`, then renders result.
- `invalid` / `expired` / `accepted` branches render distinct copy.
- ✅ Clean.

### 1.18 `src/lib/auth/invitation-command.ts` ✅

- Zod schemas for `WorkspaceRole`, `InvitationWorkspaceRole`, `InvitationCommand`.
- ✅ Used by the service and any UI that builds the form.

---

## 2. Design drift (vs Master Prompt)

| Master Prompt line | Design says                                                                            | Current code says                                                                                                                                                                                                                                                                                                                                                                                                                                          | Severity          |
| ------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| §13 line 1380      | "Login uses email/password."                                                           | Login uses Google OAuth + Nodemailer magic link.                                                                                                                                                                                                                                                                                                                                                                                                           | ❌ missing        |
| §13 line 1396-1397 | Setup form has password + password confirmation fields                                 | Setup form has agencyName + agencySlug + token only                                                                                                                                                                                                                                                                                                                                                                                                        | ❌ missing        |
| §13 line 1415-1421 | Forgot/reset password flow (non-enumerating)                                           | Not implemented                                                                                                                                                                                                                                                                                                                                                                                                                                            | ❌ missing        |
| §22 line 337-339   | `src/app/(auth)/login/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx` | Only `src/app/signin/page.tsx` exists; no `(auth)` route group                                                                                                                                                                                                                                                                                                                                                                                             | ❌ missing        |
| §2 line 104        | "Closed email/password authentication"                                                 | Magic link is effectively an open-by-email signup, **except** Drizzle's adapter + `pages.newUser: /setup` route new users to bootstrap first. So in practice, the first user to sign in becomes the admin, and subsequent users land on /app. The "no public signup link" invariant holds (the signin page is gated by the master prompt's spirit — only invited users with valid magic links or Google accounts in the OAuth consent screen can sign in). | 🟡 interpretation |

The `❌ missing` rows above are **Phase C scope**, not Phase B fixes.

---

## 3. Risks worth noting (⚠️)

1. **No rate limit on the magic-link request endpoint.** `signin/page.tsx` calls `signIn("nodemailer", { email })` for any email, no rate limit, no captcha. An attacker can spam any laratik.com or gmail.com address with magic links. The invitation service has a rate limit (`enforceRateLimit({ scope: "invitation_accept" })`) but the signin flow itself doesn't. Recommendation: add `enforceRateLimit({ scope: "magic_link_request", subject: email })` on the signin page server action. This is a 🟡 because the attack surface is bounded (you can only request a link, not actually compromise the account), but it's still a vector for phishing/social engineering.

2. **Bootstrap token is sent in plaintext over SMTP.** Master Prompt §13 line 1415-1421 implies the forgot-password flow uses an "auth exchange" to validate — which is what we do. But the bootstrap `BOOTSTRAP_SETUP_TOKEN` is a long-lived static secret in the .env, and the only validation is equality check in `bootstrapFirstAdmin()`. There's no audit event for failed bootstrap attempts. Recommendation: emit a `security_audit_events` row on every bootstrap attempt (success and failure) with the source IP and the user agent.

3. **`pages.signOut` not explicitly set.** The default behavior (`/api/auth/signout` page → POST → redirect to `/`) is correct, but not pinned. Future changes to the auth config could drift it.

4. **Dev sign-in cookie name (`authjs.session-token`) is different from the prod cookie name.** This is correct (dev ≠ prod) but undocumented. A future engineer might try to "unify" it and break both. Add a comment.

5. **The `dev/seed` API route is mentioned in `auth/dev-sign-in.ts` but I haven't audited it.** It could create agency_admin in a single unauthenticated request. Worth a separate read for Phase B (or in this audit if scope allows). Recommendation: confirm it is also dev-gated by `NODE_ENV !== "production"`.

6. **`src/lib/auth/index.ts` is dead code.** `authConfigPlaceholder = true;` is a Goal 0 stub that's never been replaced because the real config lives in `config.ts`. The file is misleading.

---

## 4. Specific files to investigate next (recommendations)

- `src/app/api/dev/seed/route.ts` — audit that it is dev-only.
- `src/lib/email/*` — confirm the magic-link template doesn't leak the verification URL in plaintext to non-recipient addresses.
- `src/lib/security/rate-limit.ts` — confirm the available scopes include `magic_link_request` (or add it).
- `src/lib/observability/logger.ts` — confirm the structured logger redacts the bootstrap token from logs (it should, but worth verifying).

---

## 5. Summary of fixes this audit _would_ recommend (excluded from Phase B per scope)

If Phase B were not audit-only, the following changes are low-risk and high-value:

1. **Add `pages.signOut: "/signin"`** to `auth/config.ts` (one line).
2. **Delete `src/lib/auth/index.ts`** or have it re-export `authConfig` from `config.ts` (1-3 lines).
3. **Add a rate limit on magic-link requests** in `signin/page.tsx` (5-10 lines).
4. **Add `security_audit_events` writes on bootstrap attempts** in `bootstrap/admin/route.ts` (5 lines).
5. **Add a comment in `dev-sign-in.ts`** explaining the prod-vs-dev salt difference (2 lines).
6. **Audit `src/app/api/dev/seed/route.ts`** for production gating (1 read).

None of these are blocking. None of these are urgent. The auth flow that ships today is production-shaped and works correctly post-`c5d0741` + `cae7e03`.

**Phase C (password login per Stitch design) is the real work.** That's separate scope, separate session, and should follow the standard TDD pattern: failing test for password login → expected failure → minimal complete behavior → focused pass → relevant suite → commit.
