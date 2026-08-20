# Production UAT and release verdict

> **Read this first.** This file describes the §23 30-step **UAT** gate, which is independent from the **deploy** gate in `PRODUCTION_READINESS_TRACKER.md`. Both gates must pass for `READY`; either failing blocks release. As of 2026-08-19 the deploy gate is `READY TO DEPLOY` (blocked on OPS-001 owner-supplied secrets), and this UAT gate is `NOT PRODUCTION READY` (blocked on the §23 journey with separated accounts plus the owner-supplied external services below). They are not contradictions — they are two different gates.

## Two-gate summary

| Gate                                      | Owner                | Status as of 2026-08-19                | How it flips                                                                                                                                                   |
| ----------------------------------------- | -------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deploy**                                | Implementation       | `READY TO DEPLOY` (blocked on OPS-001) | Add the OPS-001 secrets; push to `main`; deploy workflow fires.                                                                                                |
| **UAT (§23 journey + external services)** | Independent reviewer | `NOT PRODUCTION READY`                 | Run the 30-step primary journey with separated Maya / Omar / Elena / Jon / Sophie / Daniel accounts; complete the owner checks below; sign the final decision. |

## UAT verdict

`NOT PRODUCTION READY`

The complete 30-step primary acceptance journey in `STUDIOFLOW_MASTER_PROMPT.md` §23 must pass with separate Maya, Omar, Elena, Jon, Sophie and Daniel accounts. A failure in any numbered step blocks release. The journey cannot be automated (each step is a real human-in-the-loop action with a different identity), so it stays `Pending` until an operator runs it against the first deployed build.

## External owner gates (UAT-side)

- Rotate all design/development credentials that were shared outside the production secret store.
- Configure and test real Google OAuth redirect/callback settings.
- Configure and test Mailcow magic links and invitation delivery.
- Configure and test MiniMax through a controlled account.
- Configure and test Sentry releases, source maps, scrubbing and alerts.
- Configure encrypted offsite backup and complete a timed disposable restore.

Record only operator, date, environment and result. Never record secret values or real invitation URLs.

## Final decision

| Reviewer           | Commit / image | Date | Verdict | Unresolved risks |
| ------------------ | -------------- | ---- | ------- | ---------------- |
| Independent review | —              | —    | Pending | See tracker      |

The final decision flips to `READY` when **all** of the following are true:

1. The §23 30-step primary journey has been executed with separated accounts and every step passes.
2. Every external owner gate above has a recorded operator + date + result.
3. `PRODUCTION_READINESS_TRACKER.md` shows every P0 and P1 row at `Verified` (independent reviewer sign-off).
4. `docs/production-readiness/SCREEN_PARITY.md` shows every row at `Verified`.
5. The first production deploy to `laratik-vps` has been live for at least one full business week with no P0/P1 incident.
