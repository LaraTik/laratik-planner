# Security policy

## Reporting a vulnerability

**Please do not file a public issue for security vulnerabilities.**

Report privately to the LaraTik security team:

- **Email:** `security@laratik.com`
- **Response SLA:** initial acknowledgement within 3 business days;
  triage and severity rating within 5 business days.
- **Encryption (optional):** if you need to send sensitive proof of
  concept, request the PGP key from `security@laratik.com`. A
  response will include the key fingerprint for verification.

Include in the report:

- A clear description of the vulnerability and the impact.
- A reproduction recipe (URL, request, payload) — minimum viable.
- The affected version (commit SHA or release tag — see
  [`CHANGELOG.md`](./CHANGELOG.md)).
- Your name / handle for credit in the fix release notes, or
  `anonymous` to stay unattributed.

We follow responsible disclosure: we will not pursue legal action
against researchers who act in good faith, comply with this policy,
and give us a reasonable window to investigate before any public
disclosure.

## Supported versions

| Version stream       | Supported        | Notes                                                          |
| -------------------- | ---------------- | -------------------------------------------------------------- |
| Latest release tag   | ✅ Yes           | See the "Latest" section of [`CHANGELOG.md`](./CHANGELOG.md).  |
| Previous release tag | ✅ Yes (90 days) | Security fixes back-ported; new features land on `main` first. |
| Anything older       | ❌ No            | Upgrade to the latest tag.                                     |

The exact list of release tags is in the `releases/` namespace —
`git tag -l 'releases/*' | sort -V`.

## Security model and threat surface

- The app runs on a single VPS (`laratik-vps`) behind Traefik with
  Let's Encrypt certs. See
  [`docs/operations/runbook.md`](./docs/operations/runbook.md) for
  the deploy topology.
- Authorization is enforced at the service layer; see
  [`docs/architecture/authorization.md`](./docs/architecture/authorization.md).
- The migration ledger is forward-only and is hardened against the
  2026-08-24 skipped-migration class of issue (see
  [`docs/production-readiness/MIGRATION_DEPLOYMENT.md`](./docs/production-readiness/MIGRATION_DEPLOYMENT.md)
  § "2026-08-24 incident").
- AI capabilities and provider secrets are per-agency when the
  agency supplies its own key, with a global MiniMax fallback
  behind `MINIMAX_API_KEY`. See
  [`docs/architecture/ai-governance-and-support-access.md`](./docs/architecture/ai-governance-and-support-access.md).
- Social provider tokens are wrapped with per-agency DEKs
  (M4.5). The platform KEK rotation procedure is in
  [`docs/operations/runbook.md`](./docs/operations/runbook.md) §
  Rotation.

## Hardening checklist (per-deploy)

- `pnpm audit --prod` returns 0 critical / 0 high. Required by CI.
- No secrets in `.env` on the VPS without `chmod 600`.
- GHCR PAT is a fine-scoped read:packages token; rotate on the same
  cadence as the deploy SSH key.
- `SOCIAL_TOKEN_ENCRYPTION_KEY` rotation must re-wrap every
  `agency_social_dek` row — never overwrite the env var without
  running the re-wrap script first.

## Coordinated disclosure timeline

- **Day 0** — report received at `security@laratik.com`.
- **Day 3** — acknowledgement with triage owner.
- **Day 5** — severity rating + planned fix window.
- **Day 14 (default)** — patch released; coordinated disclosure
  date set 7 days out by default, or 30 days for high-severity
  issues that need a longer mitigation window.
- **Day D** — public disclosure + CVE (if applicable) + release
  notes credit (if requested).

We are happy to negotiate the disclosure window for legitimate
research constraints; communicate early.
