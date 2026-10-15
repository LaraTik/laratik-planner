# Community & Inbox visual parity matrix

This matrix is the implementation contract for the attached design package.
The package controls hierarchy, panel relationships, control placement,
attention states, and the 13-screen navigation order. LaraTik controls the
shell, route format, tokens, icon system, localization, authorization, and
responsive adaptations.

|   # | Package screen      | Canonical route           | Primary surface and action                                             | Required evidence                                                  |
| --: | ------------------- | ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
|   1 | Overview            | `/engagement`             | Attention banner, KPIs, channel health, workload, automation readiness | EN/AR at 1440, 1280, 1024, 768, 375; loading/empty/error           |
|   2 | Unified inbox       | `/engagement/inbox`       | Three panels, filters, thread, composer, context rail                  | Same widths/locales; keyboard panel navigation; disconnected state |
|   3 | Post comments       | `/engagement/comments`    | Selected post, root-comment thread, public/private response paths      | Same widths/locales; deleted post and permission state             |
|   4 | Review queue        | `/engagement/reviews`     | Queue KPIs, draft explanation, approve/reject/escalate                 | Same widths/locales; stale knowledge and escalation                |
|   5 | Automations         | `/engagement/automations` | Emergency stop, rules, conditions, limits, lifecycle                   | Same widths/locales; stop and unknown-send states                  |
|   6 | Playbooks           | `/engagement/playbooks`   | Section selector, approved answers, revisions, expiry warnings         | Same widths/locales; expired/stale source state                    |
|   7 | AI Test Lab         | `/engagement/test-lab`    | Simulation input, decision preview, scenarios, no-send guarantee       | Same widths/locales; prove no provider action                      |
|   8 | Analytics           | `/engagement/analytics`   | KPI cards, volume, channels, SLA, quality, reliability                 | Same widths/locales; accessible chart/table fallback               |
|   9 | Connections         | `/engagement/connections` | Connection health, capability matrix, validation status                | Same widths/locales; unknown/unavailable capability states         |
|  10 | Team & routing      | `/engagement/team`        | Operators, routing, SLAs, role matrix                                  | Same widths/locales; permission-denied state                       |
|  11 | Settings & safety   | `/engagement/settings`    | Modes, kill switch, sync, privacy, retention, budgets                  | Same widths/locales; disabled controls and audit context           |
|  12 | Activity & delivery | `/engagement/activity`    | Event timeline, filters, sanitized errors, delivery outcomes           | Same widths/locales; failed and unknown outcomes                   |
|  13 | Setup wizard        | `/engagement/setup`       | Five-step setup and readiness checklist                                | Same widths/locales; plan/agency/workspace gate states             |

Intentional differences from the old package are limited to replacing the
226px StudioFlow sidebar/header with the existing LaraTik shell, translating
arbitrary package colors into LaraTik semantic tokens, replacing fictional
data with empty/server-backed states, and adapting mobile to explicit
single-pane navigation at 768px and 375px. These differences are required by
repository governance and are not permission to change the package hierarchy.

No visual baseline is considered accepted until the route is connected to
real data or an explicitly labeled empty/loading/error state and the English
and Arabic RTL checks pass.
