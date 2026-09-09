# Trend Radar + AI Drafting UX Audit

Date: 2026-09-09
Scope: Trend Radar and AI-assisted drafting journeys in `laratik-planner`
Design authority: StudioFlow/Stitch tokens, bilingual EN/AR contract, and existing AI governance rules.

## Outcome

The two journeys should reduce time-to-value without taking authorship away from the planner:

1. A planner can move from a trusted trend signal to a linked brief in one clear action.
2. A planner can draft the exact field in context, edit the suggestion locally, and explicitly insert or replace it.

## Findings and changes

### Trend Radar

- The source onboarding copy required four sources, but confirmation was possible after one. The minimum is now four, with visible progress and a disabled primary action until the threshold is met.
- A non-admin visiting an unconfigured workspace previously received an apparently editable wizard even though the API correctly rejected the mutation. The empty state is now read-only and explains the agency-admin ownership boundary.
- Trend cards previously led with raw score/velocity data. The card hierarchy now prioritizes fit, lifecycle, freshness, source/platform, a concise reason-to-care, and the next action.
- Source, lifecycle, vertical, freshness, and mixed-direction values are rendered through the active message catalog and direction-safe markup.
- Boards now support the minimum useful loop: create a board, save a signal, inspect saved signals, remove a signal, and create a brief from a saved signal. Mutations are workspace-scoped and idempotent.
- “For You” is labelled “Highest signal” until real feedback learning exists; current ranking is not presented as personalization.
- Trend-backed angle generation is explicit and on demand. It does not auto-run and it does not write a draft without an apply action.

### AI drafting

- Per-field drafting remains the primary interaction beside the field. Broad actions stay available as secondary tools.
- The preview is locally editable, follows the active field language, displays a language badge, and uses `dir="auto"` through the shared direction-aware primitive.
- Replace confirmation uses the shared Radix dialog rather than `window.confirm`.
- Loading, cancellation, empty results, retry, copy feedback, and failures are announced and recoverable. Aborted or stale requests cannot overwrite a newer field value.
- Mobile presentation uses a full-height surface with a sticky action area; desktop retains the wider dialog/drawer treatment.
- Existing capability allowlists, quota reservations, server-side context loading, and drafts-only behavior are unchanged.

## Acceptance checklist

- [x] Four-source onboarding threshold and visible progress.
- [x] Non-admin read-only setup state.
- [x] Actionable trend card and localized labels.
- [x] Save/view/remove/create-brief board loop.
- [x] Truthful highest-signal copy.
- [x] Editable per-field preview and Radix replace confirmation.
- [x] Request cancellation and stale-result protection.
- [x] Explicit human-controlled trend angle action.
- [ ] Full Playwright evidence at 375/768/1024/1280/1440+ in EN/AR, including axe and reduced-motion runs.
- [ ] Exact-clean-SHA production-readiness evidence bundle after all UI changes are committed.

## Verification baseline

Before this pass, the focused AI/trend unit suites passed: 111 tests across six AI/trend files plus four governance/content/i18n files. The implementation pass must rerun those suites and add coverage for the new board mutations, onboarding threshold, localized presentation helpers, and field-draft state transitions.

## Remaining product recommendation

Do not call the current ranking “personalized” until board saves, brief usage, and explicit dismiss/use feedback are fed into a measured ranking model. Until then, “Highest signal” is both more accurate and more trustworthy.
