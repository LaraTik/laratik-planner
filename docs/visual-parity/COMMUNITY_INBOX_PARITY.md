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

## Functional review checkpoint (2026-10-19)

| Section             | Current behavior after the local correction                                                                                                      | Remaining product or release gap                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Overview            | Workspace counts and priority buckets use stored values; priority rows no longer repeat the total.                                               | The attention summary is not an SLA or response-time dashboard.                                       |
| Unified inbox       | Search/type filters are URL-backed; selecting a conversation loads its bounded message thread; reply and assignment controls use server actions. | The list is limited to 25 items from the latest 100 conversations and has no pagination yet.          |
| Post comments       | Synced public conversations are listed and deep-link to the shared inbox thread.                                                                 | Post media/context, deleted-post handling, and dedicated Stitch visual evidence remain.               |
| Review queue        | Waiting-review conversations are listed and can be opened in the inbox.                                                                          | Community approval/reject/escalate actions are not implemented; disabled controls must stay disabled. |
| Automations         | Existing rules and their status are shown.                                                                                                       | Rule editing, emergency-stop mutation, and activation are unavailable.                                |
| Playbooks           | Existing playbook names, revisions, and lifecycle states are shown.                                                                              | Editing, expiry/stale-source workflows, and publishing are unavailable.                               |
| AI Test Lab         | Simulation-only form and result preview remain available.                                                                                        | Interaction and no-provider-action evidence remains pending.                                          |
| Analytics           | Displays stored counts and explicitly reports unmeasured metrics; sample chart bars were removed.                                                | Volume charts, SLA, quality, reliability, and export are not implemented.                             |
| Connections         | Capability status, validation, and bounded sync controls are shown.                                                                              | Real-account read/reply UAT and permission review remain.                                             |
| Team & routing      | Active workspace members can be assigned to recent conversations; writes are permission-checked and audited.                                     | Automatic routing rules and SLA workload targets are not implemented.                                 |
| Settings & safety   | Current mode, emergency-stop state, and retention are displayed.                                                                                 | Editable budgets, sync/privacy controls, and emergency-stop mutation are unavailable.                 |
| Activity & delivery | The latest sanitized community events are listed.                                                                                                | Filtering, delivery reconciliation views, export, and dedicated browser evidence remain.              |
| Setup wizard        | Steps navigate to Connections, Playbooks, Settings, and workspace enablement.                                                                    | First-run step-by-step and readiness-gate browser evidence remains.                                   |

The focused Playwright audit checks all 13 route surfaces in both locales at
1440, 1280, 1024, 768, and 375 pixels. Each surface passed the serious/critical
axe check and page-width overflow check. Focused interactions also verify inbox
selection, comments deep-linking, and Team assignment. This is not a visual
baseline or provider UAT verdict. The open items above remain gated by the
evidence contract in `docs/production-readiness/COMMUNITY_INBOX_UAT.md`.
