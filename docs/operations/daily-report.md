# Daily planning report

`scripts/daily-report.py` prints a per-person, per-workspace view of what needs
attention, and appends each run to a rolling log so consecutive days can be
compared.

It is a **read-only snapshot**. It never transitions, creates, or edits content.
Running it twice changes nothing.

## Run it

```bash
PLANNER_TOKEN=<token with content:read> python3 scripts/daily-report.py
```

| Variable           | Default                               | Purpose                                            |
| ------------------ | ------------------------------------- | -------------------------------------------------- |
| `PLANNER_TOKEN`    | _(required)_                          | Read-only planner MCP token (`content:read` scope) |
| `PLANNER_ENDPOINT` | `https://planner.laratik.com/api/mcp` | Override for a non-production instance             |
| `REPORT_FROM`      | `2026-10-01T00:00:00.000Z`            | Only items dated on or after this are reported     |
| `REPORT_LOG_DIR`   | `tmp/daily-report`                    | Where `history.md` and `state.json` are written    |

Flags: `--now <ISO-8601>` to pin the report time (useful for replaying a past
day), `--no-log` to print without touching the log or the state file.

No third-party packages — the standard library only.

## What it reports

The report answers one question per person: **what should I do today?** So it
counts each item in exactly one bucket, and routes it to the person who can
actually move it.

| Bucket                      | Statuses                                                | Routed to                                                 |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Still planning              | `draft`, `content_review`, `approved_for_design`        | the content owner (planner)                               |
| Still designing             | `in_design`, `changes_requested`                        | the assigned designer                                     |
| Date passed                 | any open status whose `plannedPublishAt` is in the past | designer if the work is unfinished, otherwise the planner |
| In review _(informational)_ | `creative_review`, `ready_to_publish`                   | nobody — reported as a count, never as someone's action   |

The buckets are evaluated in that order, so an item is never counted twice. The
date check deliberately precedes the review check: an item in `creative_review`
whose publish date has already passed is a **miss**, not a neutral "waiting on a
reviewer", and belongs in _date passed_. The review line therefore only ever
holds work that is not yet late.

### Why the routing is stage-aware

An overdue item goes to a designer _or_ a planner depending on how far it got.
While it is still being designed the designer is the one who can move it. Once
it reaches `ready_to_publish` the design is finished and the next action is
`record_published`, which `WORKFLOW_RULES`
(`src/lib/content/workflow.ts`) restricts to a workspace manager or publisher.

Routing a finished design to the designer would send them to chase work they
already completed — which is exactly the failure mode that makes a daily report
get ignored after a week.

## Window

Only items dated on or after `REPORT_FROM` are included. Earlier items are
excluded deliberately: this reports forward work, not the backlog that has
already slipped. Widen or move the window with `REPORT_FROM`.

## Names

People are resolved with `laratik_planner_list_workspace_members`. On a
deployment that predates that tool the report still runs and falls back to a
short UUID, with a note at the top of the output — so the first report after
rollout is readable in shape even before names are live.

## Deltas

Each run writes `state.json` next to the log. The next run compares its
headline counts against it and prints the change per metric, so a rising
_date passed_ count is visible on the morning it starts to rise rather than
discovered a week later. The first run reports `first run` for every metric.

## Scheduling

The report is designed to run at **08:30 Europe/Berlin** on weekdays, before
the working day starts. It is a snapshot, so a missed run is harmless — the next
run's delta simply spans the gap.

## Notes

- The endpoint sits behind Cloudflare, which rejects urllib's default
  `Python-urllib/3.x` user agent with a 403. The script sends an identifying
  `User-Agent`; do not remove it.
- `Studio30` is intentionally absent from the workspace list — it belongs to a
  different agency. The `test` workspace is included and labelled _(sandbox)_ so
  its items are never mistaken for real client work.
