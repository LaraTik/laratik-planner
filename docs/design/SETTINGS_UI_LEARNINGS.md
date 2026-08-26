# Settings UI — implementation learnings

> Living document. Every per-page pattern + every reusable component
> used across the settings / brand / workspace surfaces lands here.
> New patterns: add a section. New components: add an entry under
> §5.1.2 (common components). If a pattern needs to overwrite one
> listed here, **append** a dated override at the bottom of the
> page section so the canonical pattern stays visible.
>
> Source of truth for visual design: `designs/stitch/DESIGN.md`
> and the per-screen HTMLs under `designs/stitch/`.

## 1. Conventions

- 44×44 px touch targets on all interactive elements (mobile rule
  in `src/app/globals.css`).
- 4.5:1 colour contrast for normal text (project `--fg-muted`
  was darkened from `#7B8495` to `#5B6270` to meet WCAG AA on
  canvas / surface / surface-subtle — see `src/app/globals.css`).
- Visible focus rings via `*:focus-visible { outline: 2px solid
var(--focus-ring) }` — no per-component override.
- Form labels use the `<label for=…>` pattern (the `<Input>`
  component is a styled `forwardRef` over `<input>`).
- Icon-only buttons get `aria-label`.
- Server-action forms disable the submit button while
  `useFormStatus().pending` is true (centralised in
  `FormSubmitButton`).
- No emoji icons — use `lucide-react` (already in deps).
- Smooth transitions 150–300 ms; `prefers-reduced-motion`
  reduces everything to 0.01 ms globally.

## 2. Per-page patterns

Each sub-section below documents one workspace-scoped or
agency-scoped screen. New pages should pick the closest match and
either copy it verbatim or add a "deltas from §N" callout.

### 2.1 Brand Kit (`/app/w/[slug]/brand-kit`)

See §5.1.1 for the canonical 12-col Bento layout, and §5.1.2 for
the `<WorkspaceTopTabs />` component used just below the page
header.

**2026-08-26 (Round 5 — full rebuild):** the page migrated to
4 new shared primitives + 1 new config. See the new §5.1.3 for
the `SectionCard` / `SectionEmptyState` / `useSuccessReset` /
`CharacterCountInput` contracts, and §5.1.4 for the
`BRAND_KIT_SECTIONS` config.

The page is no longer hand-rolled: the 9 Bento section cards
are all `<SectionCard id=… title=… count=…>` and the 7 list
files all use `<SectionEmptyState>`. The AddAssetMenu reads
from `BRAND_KIT_SECTIONS` so the menu and the top tabs cannot
drift apart again.

The destructive action is `<Trash2 />` everywhere. The previous
mix (Trash2 for logo / publishing / linked, Archive for color /
voice) was inconsistent; the new convention is one icon, one
semantics. The `variant` prop on `ArchiveWithUndo` was removed.

The hero no longer renders fake stats. The "Primary Brand" badge
(no underlying field) is gone, replaced by a "Latest logo" badge
that mirrors the actual selection logic. The "Last updated" stat
is now a real `<time dateTime={ISO} title={absolute}>` sourced
from `listRecentBrandUpdates(workspaceId)[0]?.updatedAt`.

### 2.2 Planning Library (`/app/w/[slug]/library`)

Read-only reference surface. Uses a 3-column grid of asset cards
on `lg`, single column on mobile. No top tabs — content fits on a
single screen. Empty states use `<EmptyState />`.

### 2.3 Workspace Settings (`/app/w/[slug]/settings`)

Form-heavy page. The page header sits above a single vertical
stack of `<Card>` sections; each section is a labelled form with
the submit button right-aligned in a footer. No Bento grid, no
top tabs.

**2026-08-24 navigation override:** the compact settings overview
strip was removed because it repeated the Settings group in the
persistent sidebar. Desktop section links remain in that group and
are hash-aware; mobile enters the single settings document from the
More sheet and scrolls naturally. Section targets use `scroll-mt-20`
so the sticky utility bar never covers their headings.

## 3. Accessibility checklist

Use this list as a smoke test before opening a PR that touches a
settings / brand / workspace surface:

- [ ] Every interactive element has a `min-h-11` (44px) on mobile.
- [ ] Every interactive element has a visible focus ring on
      keyboard focus.
- [ ] Every icon-only button has an `aria-label`.
- [ ] Every form `<input>` has an associated `<label for=…>`.
- [ ] `prefers-reduced-motion` honoured (the global stylesheet
      already does this — do not override per-component).
- [ ] Colour is not the only indicator of state (icon + colour,
      or text + colour).
- [ ] Heading levels descend correctly per section
      (one `<h1>` from the PageHeader, `<h2>` from
      `CardTitle`, etc.).

## 4. Visual regression

The Playwright spec at `tests/e2e/visual-regression.spec.ts`
captures each settings / brand / workspace surface on six
viewports (360 / 390 / 768 / 1024 / 1280 / 1440). New surfaces
must add a row to the spec.

## 5. Component catalogue

### 5.1 Workspace layout primitives

These are the building blocks for the modern settings-style
pages. They were introduced / promoted to first-class
components in Brand Kit Round 3 (commit G) so other surfaces
can adopt the same patterns.

#### 5.1.1 Per-section layout — Brand Kit 12-col Bento

The Brand Kit page (`src/app/(app)/app/w/[slug]/brand-kit/page.tsx`)
is the canonical example of the 12-col Bento grid + top-tab
layout. The visual reference is the Stitch screen
`16aaf0a9_northstar-coffee---brand-kit` (HTML + PNG under
`designs/stitch/`).

**Page shell (top to bottom):**

1. `<PageHeader>` — eyebrow = workspace name, title = "Brand
   kit", description includes the timezone pill, action slot
   hosts the secondary "Add asset" + primary "Edit brand kit"
   CTAs.
2. `<WorkspaceTopTabs>` — sticky strip that mirrors the section
   anchors (see §5.1.2 for the component contract).
3. `<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-6">`
   — the Bento grid. `grid-cols-1` keeps mobile readable;
   `sm:grid-cols-2` is the tablet fallback; `lg:grid-cols-12` is
   the desktop Bento.

**Section grid (per the Stitch HTML):**

| Section          | `id`         | col-span | row |
| ---------------- | ------------ | -------- | --- |
| Brand identity   | `overview`   | 12       | 1   |
| Logo Assets      | `logo`       | 8        | 2   |
| Color Palette    | `color`      | 4        | 2   |
| Typography       | `guidelines` | 12       | 3   |
| Voice & tone     | `voice`      | 6        | 4   |
| Content Pillars  | `pillars`    | 6        | 4   |
| Publishing Rules | `publishing` | 4        | 5   |
| Linked Resources | `linked`     | 4        | 5   |
| Recent Updates   | `recent`     | 12       | 6   |

The row-5 grid leaves a 4-col gap in commit G (Publishing +
Linked + empty 4-col). The empty slot is a deliberate breathing
room — Brand Story, Compliance, or Asset Analytics are all
candidate cards for the 4-col slot in a later round.

**Anchor-offset rule:** every section card uses
`className="scroll-mt-20"` so the sticky top tab strip doesn't
cover the section heading on click. `mt-20` is 80px, which is
the strip's height plus breathing room.

**Empty states:** use the existing typography paragraph
(`text-body text-fg-muted py-4`) for simple "no rows yet"
copy. Honest descriptions only — never "coming soon" or
"in a future round" text. The reader can tell an empty
list from a half-built one by whether the create form is
present.

**Per-card data-testid:** every section card carries
`data-testid="brand-kit-section-{id}"` so the unit test can
assert the grid without inspecting translated text. Top tabs
use `data-testid="workspace-top-tab-{id}"`.

#### 5.1.2 Common components

Reusable primitives that the workspace / brand / settings
surfaces share. New components land here; existing ones get a
short usage note when their API changes.

##### `<WorkspaceTopTabs />`

- **Source:** `src/components/workspace/top-tabs.tsx`
- **Test:** `tests/unit/workspace/top-tabs.test.tsx`
- **Replaces:** the per-page 200px left-rail section nav
  (deleted in Brand Kit Round 3 / commit G).
- **Use when:** a page has 3+ in-page sections and the left-rail
  wastes vertical space. Pair with a 12-col Bento grid
  (§5.1.1) so the section density matches the nav density.
- **Don't use when:** the page has ≤ 2 sections, the page is
  a single form (use `<SectionHeader>` inside a single `<Card>`
  instead), or the page is on a global route (no workspace
  context → no anchor nav needed).

**Props:**

```ts
interface WorkspaceTopTabsProps {
  tabs: { id: string; label: string; icon?: LucideIcon; count?: number }[];
  ariaLabel: string; // required — the <nav aria-label>
  observerRootMargin?: string; // optional IntersectionObserver rootMargin
  className?: string; // optional extra classes for the <nav>
}
```

**Behaviour:**

- Sticky under the page header (`top-0` on the `<nav>`).
- The initial active tab is the URL hash if it matches a
  known id; otherwise the first tab.
- `hashchange` flips the active state when the user navigates
  back / forward or pastes a deep link.
- A scroll listener (rAF-throttled) marks the tab whose
  section is nearest the top of the viewport as active.
  Pass `observerRootMargin="-80px 0px -50% 0px"` to swap the
  scroll listener for an `IntersectionObserver` (more
  accurate when a sticky header is involved).
- Smooth scroll is delegated to `html { scroll-behavior:
smooth }`; the global `prefers-reduced-motion` block
  flips it back to `auto` automatically.

**A11y notes:**

- `<nav aria-label={ariaLabel}>` wraps the strip.
- Each tab is `<a href="#{id}">`, not a `<button>` — anchor
  semantics give us deep links, middle-click, and
  screen-reader rotor for free.
- The active tab carries `aria-current="true"`. The visual
  state is a 2px bottom border in `--primary` plus the
  `--primary` text colour.
- Every tab has `min-h-11` (44px) on mobile.
- Focus ring is the global `--focus-ring` (no override).

**Usage example:**

```tsx
import { Sparkles, Tag, Type } from "lucide-react";
import { WorkspaceTopTabs } from "@/components/workspace/top-tabs";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "logo", label: "Assets", icon: Sparkles, count: 3 },
  { id: "voice", label: "Voice & tone", icon: Type },
  { id: "publishing", label: "Publishing rules", icon: Tag },
];

<WorkspaceTopTabs
  tabs={tabs}
  ariaLabel="Brand kit sections"
  observerRootMargin="-80px 0px -50% 0px"
/>;
```

#### 5.1.3 New primitives (Round 5 — 2026-08-26 rebuild)

The brand-kit rebuild introduced 4 new shared primitives and 1
shared hook. They live in `components/workspace/` (not
`components/brand/`) so future surfaces (Channels, Library,
Settings) can adopt the same pattern.

**`<SectionCard>`** — Bento section wrapper.

```tsx
interface SectionCardProps {
  id: string; // for scroll-mt anchor
  title: React.ReactNode;
  count?: number;
  countMuted?: boolean; // archived-view mode
  managerActions?: React.ReactNode;
  previewMode?: boolean; // hides manager controls
  fullWidth?: boolean; // lg:col-span-12
  className?: string;
  "data-testid"?: string; // pass-through
  "aria-label"?: string; // pass-through
}
```

- Sets `scroll-mt-20` automatically (sticky top-tab strip never
  covers the heading on click).
- Renders title + count badge consistently.
- Reserves a manager-only actions slot.
- Use for every Bento section card on the brand-kit page; 9
  call sites in `page.tsx`.

**`<SectionEmptyState>`** — uniform "no rows yet" placeholder.

```tsx
interface SectionEmptyStateProps {
  icon: LucideIcon; // Lucide component, not JSX
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean; // inlined, no border
  testId?: string;
}
```

- Standard variant wraps the existing `<EmptyState>`; compact
  variant drops the dashed border.
- Use in every list file (logo, color, typography, voice,
  publishing, linked, recent).

**`useSuccessReset(state, ref)`** — drop-in hook for inline forms
that should clear their inputs after a successful server-action
submission.

```tsx
const [state, action] = useActionState(myAction, {});
const formRef = React.useRef<HTMLFormElement>(null);
useSuccessReset(state, formRef);

<form ref={formRef} action={action}>
  ...
</form>;
```

- Resets on the success transition (not on every render).
- No-op on error.
- Re-arms on error-then-success.
- Use in every brand-kit form (6 call sites).

**`<CharacterCountInput>`** — Input/Textarea with live character
counter.

```tsx
interface CharacterCountInputProps {
  as?: "input" | "textarea";
  name: string;
  maxLength: number;
  value?: string;
  defaultValue?: string;
  onChange?: (e) => void;
  placeholder?: string;
  required?: boolean;
  rows?: number; // textarea only
  className?: string; // applied to the input/textarea
  id?: string;
  "aria-describedby"?: string;
}
```

- Counter is `aria-live=polite` and `aria-describedby`-linked.
- Switches to warning color at 90% of the cap.
- Switches to danger color when over the cap.
- Always sets `min-h-[44px]` (touch-target compliance).
- Use in any form with a `maxLength` (6 brand-kit forms today).

#### 5.1.4 `BRAND_KIT_SECTIONS` config

The single source of truth for every section on the brand-kit
page. `page.tsx`, the top tabs, the AddAssetMenu, and the
keyboard-shortcut handler all read from this list. Adding a new
section is a one-line change here, not a 5-file change.

```ts
// src/lib/brand/sections.ts
export const BRAND_KIT_SECTIONS: readonly BrandKitSection[] = [
  {
    id: "overview",
    label: "Overview",
    icon: Sparkles,
    managerOnlyAdd: false,
    supportsEdit: false,
    supportsArchive: false,
  },
  {
    id: "logo",
    label: "Logos",
    icon: ImageIcon,
    addMenuLabel: "Logo",
    addMenuDescription: "…",
    managerOnlyAdd: true,
    supportsEdit: true,
    supportsArchive: true,
  },
  // … 7 more …
];
```

The `addMenuLabel` / `addMenuDescription` are both set or both
unset (read-only sections like `overview` and `recent` omit
both and never appear in `ADD_MENU_SECTIONS`).

#### 5.1.5 Archive-icon convention

Every destructive action on the brand-kit surface uses the
`<Trash2 />` icon. The previous mix (Trash2 for some sections,
Archive for others) was inconsistent; the rebuild locked the
icon to Trash2 across all 5 entity types. The `variant` prop on
`ArchiveWithUndo` was removed.

## 6. Open questions

- **Sticky bar height on `lg+`.** Today the top tab strip
  height varies with the active state's bottom border. We
  measured 56–64px in the design. If a future surface needs
  a taller strip (e.g. for filters), add a `size` prop to
  `<WorkspaceTopTabs />` and bump `scroll-mt-*` on the
  section cards.
- **Reduced-motion + IntersectionObserver.** When
  `prefers-reduced-motion: reduce` is set, the scroll
  listener still fires — the strip's state is still useful
  for sighted users who reduced the motion. We do not gate
  the observer on the media query.

---

### Brand Kit — publishing rules + linked resources (2026-08-21)

- The 12-col Stitch Bento is preserved: Publishing (4) + Linked
  (4) still sit in row 5 with a deliberate 4-col breathing room
  on the right; the gap is intentional, not a missing card.
- Both new sections use the existing `<Card>` primitive for
  the outer shell, `<Badge>` for the rule-type pill, and
  `<Button size="icon" variant="ghost">` for the per-row
  archive control. The form layer
  (`<PublishingRuleForm>` / `<LinkedResourceForm>`) was added
  in Task 4 and is invoked the same way as the asset / voice
  forms: `canManage ? <Form slug={slug} /> : null`.
- Archive controls are gated to `canManage` (workspace_manager
  or agency admin via the policy helper). The rule/resource
  _content_ is visible to every workspace member, including
  viewers and client reviewers — the read-only surface is
  intact.
- Linked-resource URLs render as `<a target="_blank"
rel="noreferrer">` and are never fetched server-side. The
  recent-updates feed strips the URL out of the activity row
  for the same privacy reason.
- Empty states are honest. The "no publishing rules yet" /
  "no linked resources yet" copy is a single sentence that
  describes what to do next, not a roadmap placeholder.

---

_Document version: 2026-08-21 (Brand Kit Round 3 / commit G)_
