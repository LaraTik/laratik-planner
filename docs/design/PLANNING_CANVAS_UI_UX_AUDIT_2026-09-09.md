# Planning canvas UI/UX audit — 2026-09-09

Scope: the monthly planning canvas, complete content intake, monthly planning copilot, Brand Profile, and planning-pack administration.

## Design basis

- StudioFlow/Stitch remains the visual source of truth.
- The UI/UX Pro Max review emphasized data-dense SaaS layouts, progressive disclosure, visible focus, 44px touch targets, inline validation, mobile card fallbacks, logical RTL spacing, and locale-aware date formatting.
- Existing `formatPayload`, translation sidecars, Brand Kit sections, and bilingual catalogs were retained.

## Findings addressed

| Priority | Finding                                                                          | Resolution                                                                               |
| -------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P1       | New-row channel defaults allowed only one channel                                | Added an accessible multi-channel picker and inherited it into new rows.                 |
| P1       | Changing a row format could discard its content language                         | Preserved the language sidecar when the format changes.                                  |
| P1       | Stale proposals did not clearly communicate that apply was blocked               | Added stale status, localized messaging, and blocked action state.                       |
| P1       | Batch guidance said production details were only completed after saving          | Reworded the template and format guidance to make pre-save creative completion explicit. |
| P1       | Prefix matching highlighted parent/sibling navigation items together             | Made Planning List and Agency Settings General exact routes.                             |
| P2       | Proposal review hid assumptions, missing information, risks, and quality outcome | Added compact, responsive review panels with semantic warning/danger treatment.          |
| P2       | Format and session status values could appear as technical enums                 | Added localized labels, including archived sessions.                                     |
| P2       | “Current month” used UTC rather than workspace timezone                          | Derived month defaults using the workspace timezone.                                     |
| P2       | Native selects and alerts were inconsistent with the design tokens               | Added shared focus/cursor treatment and semantic surface tokens.                         |
| P2       | Full import/template lacked an explicit content-language column                  | Added a validated `Content language` column and payload merge behavior.                  |

## Verification evidence

- Focused regression checks: 78 tests passed across navigation, catalogs, batch parsing/templates, and monthly-planning contracts.
- Full unit suite: 355 files passed — 3,322 tests passed, 4 todo.
- Chromium accessibility checks: batch, monthly sessions, Brand Profile, and planning packs passed with no critical/serious axe violations.
- Batch responsive workflow: passed at 1024px and 375px, including overflow and mobile-card assertions.
- Arabic/RTL route contract: passed for planning, batch, monthly planning, Brand Profile, and planning packs with no horizontal overflow.
- Typecheck, lint, formatting checks, diff check, and production build passed after the audit changes.

The full repository `pnpm verify` aggregate remains subject to the repository’s existing formatting gate for seven pre-existing dirty project-control documents; those unrelated files were preserved.
