# 0003 — `/setup` form intentionally omits password fields

> **Status:** Accepted
> **Date:** 2026-08-24
> **Deciders:** Owner (Mavis), LaraTik
> **Supersedes:** none
> **Related:** [`PORT_NOTES.md`](../../PORT_NOTES.md) §2 entry, [`AUTH_AUDIT_2026-08-20.md`](../production-readiness/AUTH_AUDIT_2026-08-20.md) §2 AUDIT-6, [`STUDIOFLOW_MASTER_PROMPT.md` §13 lines 1396-1397](../../STUDIOFLOW_MASTER_PROMPT.md)

## Context

Master Prompt §13 lines 1396-1397 describe the `/setup` (bootstrap-first-admin) form as collecting: `agency name`, `administrator name`, `email`, `password`, `password confirmation`, and `bootstrap setup token`.

The current `src/app/setup/page.tsx` collects only: `agency name`, `agency slug`, and `bootstrap setup token`. The signed-in user's `name` and `email` are read from the NextAuth session; no password is set.

The 2026-08-20 auth audit flagged this as 🟡 drift (`AUTH_AUDIT_2026-08-20.md` §2 AUDIT-6, with the 2026-08-24 re-validation confirming it remains a drift after the post-audit password login landed). The same audit also recommended keeping the deviation (option `b`: document the deliberate scope change rather than add the fields).

## Decision

The `/setup` form will **not** be expanded to collect password + password confirmation. The drift is accepted and documented here and in `PORT_NOTES.md`.

The user must complete first-time setup by:

1. Signing in via Google OAuth or Mailcow magic link (the two providers shipped today), which creates the `user` row.
2. Landing on `/setup` (via `pages.newUser: /setup` in the NextAuth config).
3. Submitting `agencyName + agencySlug + bootstrap token` to claim the first admin row.

If the user wants a password, they set it after bootstrap via `/app/account` ("Set a password" affordance) or via the standard `POST /signin/forgot-password` flow.

## Rationale

1. **The current flow is the only one that works today.** The bootstrap endpoint (`POST /api/bootstrap/admin`) authenticates via `auth()`. The session must exist before bootstrap. Adding a password to the bootstrap form would mean the user is creating a password **without being signed in yet** — the form would need a parallel "create your account first" path, expanding the bootstrap surface from a single atomic transaction to a multi-step wizard with intermediate failure states.

2. **The bootstrap token is the authorization gate, not the password.** The `BOOTSTRAP_SETUP_TOKEN` is the operator-only secret that gates "you can create the first admin." Once a user is signed in (Google or magic link), the bootstrap token decides whether *that* user is the one who gets the admin row. The current shape separates "who am I" (sign-in) from "what am I allowed to do" (bootstrap token). Adding a password would conflate them.

3. **Self-registration is intentionally not supported.** Per Master Prompt §13 and the "Closed email/password authentication" rule, every laratik-planner user is either (a) the first admin (bootstrap) or (b) invited by an existing admin (invitation email with token). There is no `/signup` route, and there will not be one. A password on the bootstrap form would make it look like a public signup, which it is not.

4. **The audit's risk profile is unchanged.** The audit lists this as 🟡 drift, not ❌ missing or 🛑 broken. Closing it does not move the production-readiness verdict from `READY FOR INDEPENDENT REVIEW` to `READY`.

5. **The cost is small but real.** Adding the fields would require:
   - Zod schema extension (5 lines)
   - Two new form inputs + labels + strength hint (15 lines JSX)
   - A new `createUserWithPassword` server action that bypasses the NextAuth credential sign-in (so the form can create the user AND set the password in one shot — but then the user is signed in by NextAuth's session-token flow, which is the magic-link path, not the credentials path)
   - A migration to make `passwordHash` set on bootstrap (currently it relies on the user later visiting `/app/account`)
   - Updated tests for the new path
   - Updated docs (the dev `/dev/signin` page still works for tests)

   This is 30-50 LOC of mostly-boring code. The benefit is "the bootstrap form matches the master prompt literally." The cost is a parallel signup-like surface that the user has to be careful not to treat as a public form.

## Consequences

- ✅ The `/setup` form stays short and focused.
- ✅ There is exactly one way to create the first user (sign in via Google or magic link) and exactly one way to set a password (`/app/account` or forgot-password).
- ✅ The audit's open finding is closed with a written decision, not by muting it.
- 🟡 The master prompt is still wrong for this section. `PORT_NOTES.md` is the source of truth.

## Alternatives considered

- **Add the password fields (option `a` in the audit):** rejected per the rationale above.
- **Defer to a follow-up PR (option `c`):** rejected; the decision needs to be locked so the next round of code reviews stops reopening it.
- **Add a new `/signup` route that handles "first user creates an account with email + password and becomes the admin":** rejected; this would be a public signup, which is explicitly out of scope per Master Prompt §13.

## Verification

- `AUTH_AUDIT_2026-08-20.md` AUDIT-6 is updated to "Closed (ADR-0003)".
- `PRODUCTION_READINESS_TRACKER.md` Goal 14 row references this ADR.
- `git grep "AUDIT-6"` returns only this file and the audit doc.
