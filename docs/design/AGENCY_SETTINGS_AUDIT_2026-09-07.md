# Agency settings UX audit — 2026-09-07

## Scope

This review covers the global Admin navigation and every agency-settings
surface:

- `/app/agency-settings`
- `/app/agency-settings/plan`
- `/app/agency-settings/ai`
- `/app/agency-settings/social`
- `/app/agency-settings/social/providers`
- `/app/agency-settings/storage`

The review follows the `ui-ux-pro-max` priority order: information
architecture, accessibility and keyboard operation, responsive behavior,
RTL/localization, then visual consistency.

## Findings and decisions

| Area                        | Finding                                                                                                                                                                             | Decision                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Navigation completeness     | The desktop sidebar exposed only General, Plan, and AI even though Social, provider credentials, and Storage were live admin routes. The mobile More sheet had the same omission.   | Add all six destinations to the Admin → Agency settings group and keep their order identical on desktop and mobile.        |
| Information architecture    | Provider setup is a meaningful operational destination, not an incidental action hidden inside Social analytics.                                                                    | Make provider setup a first-class sub-route and add a direct action from Social analytics.                                 |
| Service truthfulness        | The overview described all services as environment-managed and treated storage as configured even when the database-backed agency configuration was disabled or unhealthy.          | Read social and storage status from their existing services; keep deployment-only services explicitly environment-managed. |
| Access control              | Storage usage was rendered before the agency-admin decision, unlike the other sensitive agency settings pages. Plan access redirected away without a useful in-context explanation. | Return localized forbidden states before loading sensitive data, with a clear route back to Agency Settings.               |
| Action ergonomics           | Plan, Social, Provider, and Storage actions did not consistently meet the 44px touch target or provide a focus ring.                                                                | Normalize action links/buttons to the shared touch target and visible focus treatment.                                     |
| Localization and formatting | Plan resource/status labels were generated from technical keys and dates used raw ISO/browser formatting. Storage health dates used server locale defaults.                         | Resolve resource/status labels through both catalogs and format dates/numbers with the active locale and Latin digits.     |
| Failure and loading states  | The route family had no agency-settings loading or error boundary.                                                                                                                  | Add a skeleton that preserves layout and a localized retry boundary.                                                       |

## Navigation contract

The canonical agency settings order is:

1. General
2. Plan and usage
3. AI configuration
4. Social analytics
5. Social provider setup
6. Media storage

All entries remain agency-admin gated by the existing server authorization
checks. The sidebar is the primary navigation; pages use only a compact
contextual back/action link and do not add a second vertical settings rail.

## Verification matrix

The implementation adds unit coverage for:

- all six agency-settings destinations in the typed desktop navigation model;
- desktop sidebar hrefs;
- mobile More-sheet hrefs.

Before promoting this audit to independent review, run the required route
evidence at the exact clean commit:

- English/LTR and Arabic/RTL;
- 375, 768, 1024, 1280, and 1440px layouts;
- keyboard focus order and visible focus;
- axe across the supported browser projects;
- loading, populated, quota-warning, disabled, forbidden, and error/retry
  states;
- visual comparison against the existing Stitch responsive references.

Automated unit and repository verification are evidence for this change, not
a replacement for the manual accessibility, visual, UAT, and independent
review gates in `docs/i18n/CONTRACT.md` and
`docs/production-readiness/README.md`.
