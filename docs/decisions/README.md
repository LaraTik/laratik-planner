# Architecture decision records

Every material deviation from `STUDIOFLOW_MASTER_PROMPT.md` is recorded here. The ADR template is in `docs/architecture/migrations.md` § 1; `docs/decisions/0005-platform-role-permissions.md` is a worked example.

## Index

Numbers are listed in decision order. **Three numbers are used twice** (`0005`, `0010`, `0016`) — the slugs are the unique identifier, so always cite the slug. The numbers were left as they are deliberately: renumbering would make a September 2026 decision appear to have been taken in October 2026, and ADR numbers are cited in release gates. See ADR 0024 § 5.

| #        | Slug                                              | Title                                                                            | Date       |
| -------- | ------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| 0001     | `0001-vps-port.md`                                | Self-hosted port to the LaraTik VPS (no Supabase, no Vercel)                     | 2026-08-18 |
| 0002     | `0002-multi-agency-saas-entitlements.md`          | Multi-agency SaaS entitlements                                                   | 2026-08-23 |
| 0003     | `0003-setup-form-scope.md`                        | Setup form scope                                                                 | 2026-08-24 |
| 0004     | `0004-social-profile-analytics.md`                | Social profile analytics (M4)                                                    | 2026-08-24 |
| **0005** | `0005-platform-role-permissions.md`               | Platform role permissions                                                        | 2026-08-25 |
| 0006     | `0006-planning-list-at-risk-semantics.md`         | Planning list "At Risk" KPI — strict-overdue semantics                           | 2026-08-30 |
| 0007     | `0007-workspace-overview-dashboard-refactor.md`   | Workspace Overview dashboard — UX/UI and data-semantics refactor                 | 2026-08-30 |
| 0008     | `0008-atomic-agency-switcher-navigation.md`       | Agency switcher must navigate atomically to a URL in the new tenant context      | 2026-08-31 |
| 0009     | `0009-user-interface-locale.md`                   | User-interface locale (Arabic) — precedence, cookie, fonts, formatting, rollback | 2026-09-01 |
| **0005** | `0005-platform-aware-social-metric-contract.md`   | Platform-aware social metric capabilities                                        | 2026-09-02 |
| **0010** | `0010-meta-publishing-readiness.md`               | Meta publishing readiness foundation                                             | 2026-09-04 |
| **0010** | `0010-r2-agency-storage.md`                       | Database-configured agency-scoped R2 storage                                     | 2026-09-06 |
| 0011     | `0011-media-catalog-source-adapters.md`           | Provider-neutral media catalog and source adapters                               | 2026-09-07 |
| 0012     | `0012-agency-owned-r2.md`                         | Agency-owned Cloudflare R2 storage                                               | 2026-09-07 |
| 0013     | `0013-advisory-quality-gates.md`                  | Advisory coverage and browser gates                                              | 2026-09-09 |
| 0014     | `0014-workflow-scenarios.md`                      | Per-workspace workflow scenarios                                                 | 2026-09-19 |
| 0015     | `0015-meta-external-publication-linking.md`       | Semi-automated Meta publication linking                                          | 2026-09-22 |
| **0016** | `0016-agency-tasks-and-global-calendar.md`        | Agency tasks and global calendar                                                 | 2026-09-24 |
| **0016** | `0016-ephemeral-publication-expiry.md`            | Ephemeral publications without a permanent link                                  | 2026-09-27 |
| 0017     | `0017-overview-month-scoping.md`                  | The Overview freezes to a calendar month, including the Command Center           | 2026-10-07 |
| 0018     | `0018-workspace-url-carries-tenant.md`            | Workspace URLs carry the tenant                                                  | 2026-10-07 |
| 0019     | `0019-manual-github-actions.md`                   | Manual-only GitHub Actions                                                       | 2026-10-23 |
| 0020     | `0020-local-integration-validation.md`            | Local review and integration validation                                          | 2026-10-24 |
| 0021     | `0021-local-review-and-release.md`                | Local review and production release                                              | 2026-10-24 |
| 0022     | `0022-main-only-hosted-image-build-and-deploy.md` | Main-only hosted image build and deployment                                      | 2026-10-24 |
| 0023     | `0023-local-production-snapshot.md`               | Reusable local production-data snapshot                                          | 2026-10-25 |
| 0024     | `0024-release-path-and-review-evidence.md`        | Canonical release path, review evidence, and branch lifecycle                    | 2026-10-25 |
| 0025     | `0025-no-pre-merge-gates.md`                      | No independent-review or local-gate prerequisite for merging                     | 2026-10-25 |

## Superseded records

- `0013-advisory-quality-gates.md` — superseded for release execution by ADR 0021.
- `0019-manual-github-actions.md` — superseded for review by ADR 0021 and for main-only hosted build and deploy by ADR 0022.
- ADRs 0020, 0021, 0022, and 0024 — superseded by ADR 0025 only where they make independent review or completed local release gates a prerequisite for merge. Their test-safety, readiness-status, and hard deployment controls remain in force.

## When to write one

An ADR is required when a change materially deviates from the master prompt, when it changes a data model, an authorization rule, a release or deployment control, or a workflow contract. An ADR is **not** a status report — the tracker and the evidence files carry status.
