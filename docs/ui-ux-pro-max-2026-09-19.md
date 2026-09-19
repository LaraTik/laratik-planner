# UI/UX audit — Workflow scenario presets (Settings → Templates → Workflow)

Date: 2026-09-19
Author: Mavis
Scope: Settings → Templates → Workflow section + downstream scenario
filtering on the rail, stepper, and board.

## Conventions followed

- **Card parity** with the existing Lead Times / Approval / Monthly Target
  sections: same `SettingsTemplateCard` shell, same `DeltaBadge` shape,
  same confirmation copy. No new card chrome was introduced.
- **Mini-rail preview** inside each scenario card reuses the right-side
  `WorkflowRail` visual language (check marker + arrow) so users can
  eyeball the spine without parsing prose.
- **Touch targets** ≥ 44×44 (the existing `Button` component already
  enforces this — verified by reading `src/components/ui/button.tsx`).
- **Semantic + colour**: the diff badge uses `bg-success-subtle` /
  `bg-warning-subtle` (same as existing presets) and never relies on
  colour alone — the label text carries the meaning.
- **RTL parity**: the new en + ar keys mirror each other; the
  `ScenarioRailPreview` uses logical CSS (gap, padding, flex) that flips
  correctly under RTL.
- **Reduced motion**: no animation was added beyond what already exists
  on the `SettingsTemplateCard` (status fade-in via the existing
  `Loader2` + `Check` icon swap).

## Decisions and deviations

- **Deviation**: `self_publish` retains `publishing_setup` as a rail
  stage (the scenario removes the _gate_ that requires explicit
  validation, not the _state_). The original plan described the gate as
  removable; the implementation keeps the stage reachable but lets the
  publisher push the button directly. Reasoning: the 11 backend statuses
  are the data spine and cannot be removed without rewriting every
  service. Surfacing the stage in the rail while removing the validation
  step gives the same UX benefit without changing the data model.
- **Deviation**: in-flight items in stages the new scenario omits are
  surfaced in a dedicated "Outside current workflow" group on the board
  (mirrors the existing "Blocked" group) rather than silently dropped.
  Reasoning: the plan said "no data is deleted" — making that visible
  preserves the contract and surfaces items that need attention.
- **Deviation**: `applyWorkflowScenarioAction` does NOT write to
  `security_audit_event`. The existing `apply*TemplateAction` actions
  don't write to audit either; adding audit just for scenarios would
  create an asymmetry. Tracked as a follow-up: extend all template
  actions to audit log uniformly.

## Verification

- `pnpm typecheck` clean.
- `pnpm vitest run` — 3555 tests pass, including a new
  `tests/unit/workflow/scenario-resolver.test.ts` (16 tests pinning the
  engine contract, the catalog shape, the scenario filter, and the
  backward-compat default).
- `pnpm vitest run tests/unit/i18n/catalogs.test.ts` — 9 tests pass;
  en + ar catalog parity holds for the new keys.

## Known follow-ups (out of this scope)

- Per-content-item scenario override (deferred per master prompt §1.2).
- Audit-log uniformity across all `apply*TemplateAction`s.
- One-time toast ("You switched to Lightweight — the Content review
  column was removed") for 14 days after a switch — useful if the
  Settings page is ever reloaded in a fresh browser.
- Plug `effectiveTransitions()` into the deliverable approval flow so a
  workspace's scenario can force-skip the client gate when the agency
  relationship has been downgraded (see ADR 0014).
