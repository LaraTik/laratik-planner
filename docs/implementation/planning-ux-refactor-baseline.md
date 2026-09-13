# Planning UX refactor baseline

Baseline captured before the Planning UX refactor on the clean commit
`c34c7e84` in the isolated worktree.

## Current production surfaces

- Planning list: `/app/w/[slug]/planning`
- Workflow board: `/app/w/[slug]/board`
- Calendar: `/app/w/[slug]/calendar`
- Content detail: `/app/w/[slug]/planning/[id]`
- Detail primary tabs: Overview, Content, Copy, Delivery, Publishing
- Detail secondary utilities: Preview, Activity
- Detail compatibility aliases: `#messages`, `#assets-versions`, `#workflow`

The existing implementation already has focused components for the detail
shell, workflow rail, readiness panel, delivery versions, publishing, activity,
and audience copy. It also has separate status-to-stage projections in the
dashboard, next-action, board, and workflow-rail code.

## Baseline behavior recorded

- Internal content statuses remain the 11-value domain enum.
- The dashboard uses a four-stage projection: Planning, Review, Design, Publish.
- The detail workflow rail uses a six-stage projection but currently presents
  blocked and cancelled items against Planning.
- The planning list has a Health concept that mixes readiness and operational
  attention signals.
- The detail page already renders only the active tab panel and preserves the
  documented hash aliases.
- Server readiness evaluation is already available for Detail and Publish;
  list rows use a lightweight health rollup.
- Creative delivery is already available in the detail workspace, but does not
  yet have a dedicated shared presentation contract for current handoff,
  waiting, and next-action states.

## Verification baseline

| Check                     | Result                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| `pnpm test:unit -- --run` | PASS — 376 files, 3,439 tests, 4 TODOs                                        |
| `pnpm verify`             | PASS — format, lint, typecheck, unit suite, production build                  |
| Database/schema           | No changes in this refactor baseline                                          |
| Public routes/APIs        | No changes in this refactor baseline                                          |
| Visual snapshots          | Not promoted or changed; existing visual evidence remains the review baseline |

## Baseline risks carried into implementation

1. Presentation decisions are duplicated across list, dashboard, rail, and
   detail code.
2. The next-action helper repeats a subset of workflow role rules.
3. `blocked` and `cancelled` currently receive an inferred Planning stage in
   some presentation paths.
4. Current and future readiness are not represented as distinct shared data.
5. The current UI wording is not yet guaranteed to be identical across List,
   Board, Calendar, Detail, and Publish.
