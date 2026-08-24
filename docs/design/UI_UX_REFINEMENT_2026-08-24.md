# UI/UX refinement — navigation-first pass

Date: 2026-08-24  
Scope: every current route, with authenticated navigation as priority one  
References: StudioFlow master prompt §§3, 17, 18; 41 active Stitch captures; UI/UX Pro Max accessibility, touch, and responsive guidance

## Design decisions

- Keep the approved StudioFlow indigo/Inter token system. The generated UI/UX Pro Max rose palette and display face conflict with the product source of truth.
- Use one persistent route-navigation model per viewport: expanded sidebar at `xl`, 72px icon rail at `md–lg`, context-aware bottom bar plus a More sheet below `md`.
- Keep in-page navigation only where it describes sections within one document (Brand Kit and agency detail). Remove route toggles and overview strips that repeat the sidebar.
- Show a primary create action only when it is valid in the current context and the actor has the capability.
- Replace desktop compression on mobile with a task-shaped alternative. Calendar is the first corrected surface: month grid on tablet/desktop, agenda on mobile.

## Screen-by-screen structural review

| Surface                    | Route(s)                                       | Refinement outcome                                                                                                                            |
| -------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| My Work                    | `/app`                                         | Stable global primary destination on all viewports; no dead search field above it.                                                            |
| Workspaces                 | `/app/workspaces`, `/new`                      | Global mobile create action points to workspace creation; workspace switcher remains the context control.                                     |
| User Management            | `/app/users`                                   | Direct desktop/admin and mobile-admin destination; responsive table behavior retained.                                                        |
| Account                    | `/app/account`                                 | Reachable from the mobile More sheet as well as the user menu.                                                                                |
| Agency settings            | `/app/agency-settings`, `/plan`, `/ai`         | One sidebar route group on desktop and one Agency group in mobile More; no additional page-level route rail.                                  |
| Platform administration    | `/app/platform/*`                              | All four destinations are reachable in the tablet rail, expanded sidebar, and mobile Platform group.                                          |
| Workspace Overview         | `/app/w/[slug]`                                | Removed the Calendar button that repeated navigation; retained the dominant create action and batch operation.                                |
| Monthly Planning           | `/planning`                                    | Planning is now one route family in the sidebar; redundant List/Board/Calendar page toggle removed. Filters and creation remain page actions. |
| Workflow Board             | `/board`                                       | Direct Planning sub-destination on desktop and direct entry in mobile More; existing mobile list alternative retained.                        |
| Editorial Calendar         | `/calendar`                                    | Direct Planning sub-destination; redundant route toggle removed; 760px grid replaced by a no-overflow agenda below 768px.                     |
| Quick Create               | `/planning/new`                                | Mobile floating create action now lands here for authorized workspace actors. Existing four-field contract retained.                          |
| Batch Add                  | `/planning/batch`                              | Retained as a contextual Planning action instead of persistent navigation.                                                                    |
| Content Detail/Edit        | `/planning/[id]`, `/edit/[id]`                 | Planning parent stays active throughout the task; mobile bottom navigation preserves route context.                                           |
| Publish Package            | `/planning/[id]/publish`                       | Planning context remains active; selected-state colors now use valid StudioFlow tokens.                                                       |
| Reviews                    | `/reviews`                                     | Stable primary destination on desktop and mobile; removed unrelated planning view toggle.                                                     |
| Design Queue / Publishing  | `/design-queue`                                | Previously missing from the shell; now direct desktop and mobile-More navigation.                                                             |
| Planning Library           | `/library`                                     | Previously missing from the shell; now direct desktop and mobile-More navigation.                                                             |
| Social Channels            | `/channels`                                    | Grouped under Workspace in the expanded sidebar and available in mobile More.                                                                 |
| Brand Kit                  | `/brand-kit`                                   | Route navigation is centralized; section anchors remain because they navigate within a long document rather than duplicate routes.            |
| Team                       | `/team`                                        | Workspace-group destination across desktop and mobile.                                                                                        |
| Workspace Settings         | `/settings`                                    | Duplicate overview strip removed; sidebar anchors are hash-aware; sections receive scroll offset and clearer separators.                      |
| Workspace AI               | `/ai-settings`                                 | Lives under Settings on desktop and in mobile More, matching ownership rules.                                                                 |
| Client Review              | `/client`                                      | Restricted mobile primary navigation remains Reviews + Calendar; internal destinations and create action are absent.                          |
| Client Calendar            | `/client/calendar`                             | Client-only direct mobile destination retained.                                                                                               |
| Sign-in / recovery / setup | `/signin`, `/signin/forgot-password`, `/setup` | Public surfaces do not render the authenticated shell; existing focused forms remain appropriate.                                             |
| Operational states         | shared loading/empty/error routes              | Shell spacing and reachability changes apply without altering state semantics.                                                                |

## Shell corrections applied to every authenticated screen

- Recovered 64px of wasted vertical space by removing duplicate main-area top padding below the sticky utility bar.
- Replaced the falsely documented 248px tablet sidebar with the required 72px icon rail.
- Added accessible labels and titles to icon-rail links, and kept 44px targets at tablet/mobile sizes.
- Added missing Board, Design Queue, and Library destinations.
- Removed workspace-name duplication from the product brand block; the workspace switcher owns that identity on desktop, while the mobile header shows it directly.
- Hide a single-agency switcher from the desktop footer; it appears when switching is possible or platform authority needs it.
- Replaced undefined Material-style color utilities (`primary-container`, `on-primary`) with valid StudioFlow tokens.
- Added safe-area-aware bottom spacing and a 56px context-sensitive mobile create action.

## Verification contract

- Unit: sidebar hierarchy/capabilities, mobile primary routes, More-sheet authorization, Calendar event rendering.
- Browser: tablet rail width, mobile touch targets, More-sheet reachability, Calendar agenda, and horizontal-overflow checks.
- Full gate: `pnpm verify`, focused authenticated Playwright, accessibility scan, and production dependency audit.
