# Meta Publishing UI Design Brief

Status: implementation baseline, live publishing disabled
Date: 2026-09-04
Product: LaraTik Planner
Design authority: StudioFlow/Stitch captures and `src/app/globals.css`

## Design method

This brief combines the UI/UX Pro Max design-system, accessibility, forms,
responsive, Next.js, and shadcn searches with the frontend-design skill's
composition and refinement review. The generated generic palette and style
recommendations are intentionally not adopted when they conflict with the
StudioFlow/Stitch system. The existing tokens, Inter typography, calm B2B
planner character, and product information hierarchy remain authoritative.

## Experience direction

Meta publishing should feel like a calm operations checkpoint, not a social
feed composer. The interface should answer four questions in order:

1. Which Page or Instagram professional account will receive this content?
2. Is the content editorially complete and approved?
3. Is the Meta connection and media delivery actually ready?
4. What will happen next: save, queue, retry, or reauthorize?

The primary action is always singular and state-specific. Provider readiness
must never be hidden behind a generic connected badge.

## Surfaces

### Agency Meta readiness

Use the existing agency social settings area and present one ordered readiness
card with App configuration, Security, Publishing approval, Operational switch,
and Recovery. Analytics and publishing show separate badges and explanations.

### Workspace channel picker

Group managed destinations as a relationship tree:

```text
Meta
└── Facebook Page
    └── Linked Instagram professional account
```

Each destination shows account type, relationship, analytics status, publishing
status, and a recovery explanation when unavailable. Selection is explicit and
never silently implies publishing permission.

### Publishing setup

The existing content-detail publishing section keeps its three-column desktop
shape, with these logical sections:

- Destination
- Copy
- Media and accessibility
- Platform options
- Schedule
- Approval
- Preview and readiness

Editorial readiness, connection readiness, capability readiness, media readiness,
and queue readiness are separate rows with text and icons. The primary action
changes between Save draft, Confirm ready, Queue for publishing, Retry,
Reauthorize, and Cancel queued publish.

## LTR and RTL contract

- Resolve interface locale through the existing `tForActive()` contract
- Render the same component tree with `dir="ltr"` or `dir="rtl"`
- Use logical spacing and alignment utilities only
- Use `DirAwareInput` and `DirAwareTextarea` for bilingual content
- Use `dir="auto"` or `<bdi>` for handles, URLs, IDs, hashtags, filenames,
  and provider identifiers
- Mirror chevrons, side panels, icon placement, tabs, and action order
- Keep dates, times, percentages, and counts in Latin digits and workspace
  timezone
- Ensure Arabic translations fit without clipping, truncation, or overlap
- Never pass a translator function from a Server Component to a Client Component

## Responsive contract

Review at 360px, 375px, 390px, 768px, 1024px, 1280px, and 1440px or wider.

- Desktop: expanded readiness panel and three-area publishing layout
- Tablet: stacked secondary panels while keeping readiness visible
- Mobile: stacked sections with a preview/readiness sheet or tab
- Tables: accessible card transformation or contained horizontal region
- Sticky actions: must not cover fields, errors, or keyboard focus
- All controls: minimum 44px touch target
- Long Arabic and English labels: wrap naturally without horizontal page scroll
- Focus order: follows the logical order in both writing directions

## UI/UX Pro Max quality gates

- 4.5:1 minimum normal-text contrast
- Visible keyboard focus on every interactive control
- Labels associated with every form field
- Appropriate input types and autofill support
- Validation on blur where useful, with errors near the field
- Loading, success, and failure feedback after every mutation
- No emoji used as an icon
- Reduced-motion behavior for transitions and sheets
- Responsive image sizing and reserved space to avoid layout shifts
- No accidental horizontal scrolling

## Frontend-design quality gates

- One coherent visual point of view that is compatible with StudioFlow
- Distinctive composition through hierarchy, spacing, and preview framing,
  not through an unrelated palette
- CSS variables and shared components for repeated visual decisions
- Motion used sparingly for high-value state changes and disabled under
  `prefers-reduced-motion`
- No cookie-cutter provider cards, generic dashboard decoration, or visual
  effects that compete with readiness information

## Evidence required before enablement

For every surface, capture English/LTR and Arabic/RTL at all required widths.
Pair screenshots with browser behavior, keyboard, axe, and screen-reader
evidence. Review loading, empty, error, queued, published, failed, retry, and
reauthorization states. The feature remains disabled until the exact clean HEAD
has this evidence.
