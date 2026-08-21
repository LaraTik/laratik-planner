# StudioFlow Stitch Production Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish every open item from the 2026-08-21 audit so all StudioFlow surfaces are functionally complete, every captured Stitch design is classified and reviewed, every active canonical/responsive/supporting design is matched, and the result is covered by enforced visual and behavioral tests, accessibility/UAT evidence, production-grade coverage, and independent verification.

**Architecture:** Deliver the work as dependency-ordered vertical milestones. Complete the Brand Kit data model and UI before seeding deterministic visual states; use one typed Stitch manifest to drive both reference coverage and Playwright screenshots; keep human approvals in evidence documents rather than pretending they are automated; restore quality thresholds with tests before changing the release verdict. Each milestone ends with focused tests, `pnpm verify`, evidence updates, an atomic commit, and a push to `main`.

**Tech Stack:** Next.js 16.3 App Router, React 19 Server Components and Server Actions, TypeScript strict, Drizzle ORM, PostgreSQL 16, Zod, Tailwind 4, shadcn/Radix, Vitest, Playwright, axe-core, GitHub Actions, Docker/GHCR.

---

## Program rules

- Work on a clean, up-to-date `main`; stop if unrelated local changes overlap the milestone.
- Read `STUDIOFLOW_MASTER_PROMPT.md`, `PRODUCTION_READINESS_TRACKER.md`, `PORT_NOTES.md`, `docs/production-readiness/README.md`, the relevant captured Stitch HTML/PNG, and applicable Next.js 16 docs before each milestone.
- Use the in-repository `designs/stitch/` capture. Refresh from the live Stitch MCP only when the user reports an upstream change and only via `docs/visual-parity/MCP.md`.
- Use TDD: failing test, confirmed failure, minimal implementation, passing focused test, broader verification.
- Never lower or remove a test, coverage threshold, authorization check, migration invariant, or visual assertion to make CI green.
- Database changes are additive first. Record forward, compatibility, backup, rollback, and restore evidence.
- `Implemented` is not `Tested`; `Tested` is not `Verified`. Only an independent reviewer assigns `Verified`.
- A local build is not sufficient evidence. The milestone must pass CI and, when applicable, the E2E workflow.
- Use atomic commits in the repository format and push each finished milestone to `main`.

## Dependency and release order

1. Establish the 49-capture manifest, distinguish active references from historical/superseded captures, and correct the screen count.
2. Add Brand Kit Publishing Rules and Linked Resources tables and migration evidence.
3. Add Brand Kit domain commands, services, authorization, actions, forms, and page rendering.
4. Add the administration E2E journey and deterministic content/visual fixtures.
5. Replace skipped visual tests with committed, reviewable baselines.
6. Prepare the accessibility, separated-account UAT, and external-service evidence contracts; run automated accessibility immediately.
7. Restore coverage thresholds through tests and make critical visual checks deploy-gating.
8. Reconcile all status documentation.
9. Complete the targeted architecture cleanup without visual changes.
10. After the code freeze, execute manual accessibility/UAT/external checks, then run independent review, final release gates, deployment, and post-deploy observation.

## File map

### New files

- `src/lib/db/schema/brand-kit.ts` — Publishing Rules and Linked Resources tables.
- `src/app/(app)/app/w/[slug]/brand-kit/publishing-rule-form.tsx` — accessible create form.
- `src/app/(app)/app/w/[slug]/brand-kit/linked-resource-form.tsx` — accessible create form.
- `tests/unit/brand-kit/publishing-rule-form.test.tsx` — publishing form behavior.
- `tests/unit/brand-kit/linked-resource-form.test.tsx` — linked-resource form behavior.
- `tests/integration/brand-kit.test.ts` — real database constraints, tenancy, archive, and role cases.
- `tests/e2e/administration.spec.ts` — manager/planner/viewer/client Brand Kit journey.
- `tests/e2e/stitch-cases.ts` — typed 49-screen reference manifest and canonical route cases.
- `tests/unit/stitch-cases.test.ts` — manifest completeness and artifact existence.
- `docs/production-readiness/STITCH_CAPTURE_INVENTORY.md` — 49-design mapping and approval record.
- `docs/production-readiness/VISUAL_REVIEW.md` — reviewer/date/result per candidate/reference pair.
- `docs/production-readiness/ACCESSIBILITY_CHECKLIST.md` — manual WCAG evidence.
- `docs/production-readiness/EXTERNAL_SERVICES_UAT.md` — OAuth/SMTP/AI/Sentry/backup evidence.
- `src/components/workspace/calendar-event-card.tsx` — reusable calendar item rendering.
- `src/components/workspace/approval-timeline.tsx` — reusable approval request presentation.
- `src/components/workspace/delivery-version-list.tsx` — immutable delivery history presentation.
- `tests/unit/workspace/calendar-event-card.test.tsx` — full prop and state coverage.
- `tests/unit/workspace/approval-timeline.test.tsx` — approval status/action coverage.
- `tests/unit/workspace/delivery-version-list.test.tsx` — delivery history coverage.

### Existing files modified across the program

- `src/lib/db/schema/index.ts`, `src/lib/db/migrations/*`, `src/lib/db/migrations/meta/*`
- `src/lib/brand/command.ts`, `src/lib/brand/service.ts`
- `src/app/(app)/app/w/[slug]/brand-kit/actions.ts`
- `src/app/(app)/app/w/[slug]/brand-kit/page.tsx`
- `src/app/api/dev/seed/route.ts`, `tests/e2e/_helpers.ts`
- `tests/e2e/visual-regression.spec.ts`, `playwright.config.ts`, `package.json`
- `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `.github/workflows/deploy.yml`
- `vitest.config.ts` and focused tests under `tests/unit/`
- `src/app/(app)/app/w/[slug]/calendar/page.tsx`
- `src/app/(app)/app/w/[slug]/planning/[id]/page.tsx`
- `src/app/(app)/app/w/[slug]/planning/[id]/workflow-bar.tsx`
- `src/app/(app)/app/w/[slug]/planning/[id]/delivery-section.tsx`
- `issues.md`, `PRODUCTION_READINESS_TRACKER.md`
- `docs/production-readiness/SCREEN_PARITY.md`, `TEST_EVIDENCE.md`, `MIGRATION_DEPLOYMENT.md`, `UAT_RELEASE.md`, `DESIGN_AUDIT.md`
- `docs/design/SETTINGS_UI_LEARNINGS.md`, `docs/testing/strategy.md`

---

### Task 1: Lock the canonical 49-screen contract

**Files:**

- Create: `tests/e2e/stitch-cases.ts`
- Create: `tests/unit/stitch-cases.test.ts`
- Create: `docs/production-readiness/STITCH_CAPTURE_INVENTORY.md`
- Modify: `docs/production-readiness/SCREEN_PARITY.md`

- [ ] **Step 1: Write the manifest completeness test**

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STITCH_CASES } from "../../tests/e2e/stitch-cases";

describe("canonical Stitch capture manifest", () => {
  it("maps all 49 unique captured screens", () => {
    expect(STITCH_CASES).toHaveLength(49);
    expect(new Set(STITCH_CASES.map((entry) => entry.screenId)).size).toBe(49);
  });

  it("points to committed PNG and HTML artifacts", () => {
    for (const entry of STITCH_CASES) {
      expect(existsSync(entry.pngPath), entry.screenId).toBe(true);
      expect(existsSync(entry.htmlPath), entry.screenId).toBe(true);
    }
  });

  it("assigns a route or an explicit shared-state evidence group", () => {
    for (const entry of STITCH_CASES) {
      expect(entry.route || entry.evidenceGroup).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `rtk pnpm exec vitest run tests/unit/stitch-cases.test.ts`

Expected: FAIL because `tests/e2e/stitch-cases.ts` does not exist.

- [ ] **Step 3: Add the typed manifest contract**

```ts
export type StitchCase = {
  screenId: string;
  slug: string;
  pngPath: string;
  htmlPath: string;
  route?: string;
  evidenceGroup?: "operational-states" | "notification-drawer";
  viewport: { width: number; height: number };
  classification: "canonical" | "responsive" | "supporting" | "historical" | "superseded";
  successorScreenId?: string;
  state:
    "default" | "empty" | "final" | "failed" | "approved" | "discussion" | "decision" | "drawer";
};

const artifact = (id: string, slug: string, extension: "png" | "html") =>
  `designs/stitch/${id}_${slug}.${extension}`;

const defineCase = (
  screenId: string,
  slug: string,
  target: Omit<StitchCase, "screenId" | "slug" | "pngPath" | "htmlPath">,
): StitchCase => ({
  screenId,
  slug,
  pngPath: artifact(screenId.slice(0, 8), slug, "png"),
  htmlPath: artifact(screenId.slice(0, 8), slug, "html"),
  ...target,
});
```

- [ ] **Step 4: Enter all 49 cases using this exact inventory**

| ID prefix  | Route or evidence group                | Viewport/state    | Classification                   |
| ---------- | -------------------------------------- | ----------------- | -------------------------------- |
| `01aa8faf` | `/app/workspaces`                      | desktop/default   | canonical                        |
| `0480cbe9` | `/app/w/acme/planning`                 | tablet/default    | responsive                       |
| `06a9382e` | `/app/w/acme/planning/{contentItemId}` | desktop/default   | historical; successor `879e7539` |
| `116b6e36` | `notification-drawer`                  | mobile/drawer     | superseded; successor `1272d1fa` |
| `1272d1fa` | `notification-drawer`                  | mobile/approved   | responsive                       |
| `129bd2e9` | `/app/w/acme/planning/batch`           | desktop/default   | superseded; successor `43a166ed` |
| `12d2ff28` | `/app/w/acme/planning/{contentItemId}` | tablet/default    | responsive                       |
| `16aaf0a9` | `/app/w/acme/brand-kit`                | desktop/default   | canonical                        |
| `21068e5a` | `operational-states`                   | desktop/default   | canonical                        |
| `218f259a` | `/app/w/acme/client/calendar`          | desktop/default   | canonical                        |
| `2dafd80a` | `/signin`                              | desktop/default   | canonical                        |
| `2db8ec6e` | `/app/w/acme/team`                     | desktop/final     | canonical                        |
| `2f6acd26` | `/app/w/acme/settings`                 | desktop/final     | canonical                        |
| `382b9405` | `/app/w/acme/design-queue`             | desktop/failed    | canonical                        |
| `43a166ed` | `/app/w/acme/planning/batch`           | desktop/final     | canonical                        |
| `45d945d7` | `/app/w/acme/channels`                 | desktop/default   | canonical                        |
| `4ce1582b` | `/app`                                 | mobile/default    | responsive                       |
| `5ad5fffc` | `/app/w/acme/design-queue`             | desktop/empty     | canonical                        |
| `686650a1` | `/app/w/acme/reviews`                  | mobile/decision   | responsive                       |
| `7493876f` | `/app/w/acme/library`                  | desktop/default   | canonical                        |
| `78083c8b` | `/app/w/acme/planning/{contentItemId}` | desktop/default   | superseded; successor `f7159c3e` |
| `793a08d8` | `/signin/forgot-password`              | desktop/default   | canonical                        |
| `7ff4ca0d` | `/app/w/acme/team`                     | desktop/default   | superseded; successor `2db8ec6e` |
| `84b2d2b8` | `/app/w/acme/planning/{contentItemId}` | mobile/discussion | responsive                       |
| `879e7539` | `/app/w/acme/reviews`                  | desktop/final     | canonical                        |
| `89113980` | `/app/users`                           | desktop/default   | canonical                        |
| `8c0ec0b0` | `/app/w/acme/calendar`                 | desktop/default   | canonical                        |
| `901791af` | `/app/w/acme/board`                    | desktop/default   | historical; successor `f9e58e53` |
| `96f0dd19` | `/app/w/acme/planning`                 | desktop/default   | canonical                        |
| `9794f1aa` | `/app/w/acme/planning/new`             | desktop/default   | canonical                        |
| `9bbb403b` | `/app/w/acme`                          | tablet/default    | historical; successor `d9bb7ef2` |
| `9cf65ebd` | `/app/w/acme/design-queue`             | desktop/approved  | canonical                        |
| `9d70e67a` | `/app/w/acme/planning/new`             | mobile/default    | responsive                       |
| `9e0f61c2` | `/app/w/acme/reviews`                  | tablet/default    | responsive                       |
| `9e83a73c` | `/app/workspaces/new`                  | desktop/default   | supporting                       |
| `a3631dbf` | `/setup`                               | desktop/default   | canonical                        |
| `b2677b3c` | `/app/w/acme/settings`                 | desktop/default   | superseded; successor `2f6acd26` |
| `bb6ac00d` | `/app/w/acme/reviews`                  | desktop/default   | canonical                        |
| `c44445d5` | `/app/w/acme/design-queue`             | mobile/approved   | responsive                       |
| `c7dd77e0` | `/app/w/acme/client`                   | desktop/default   | canonical                        |
| `cb0de669` | `/app/agency-settings`                 | desktop/approved  | canonical                        |
| `d9bb7ef2` | `/app/w/acme`                          | tablet/final      | responsive                       |
| `e350b62a` | `/app/agency-settings`                 | desktop/final     | superseded; successor `cb0de669` |
| `e522f7d8` | `/app/w/acme/ai-settings`              | desktop/default   | superseded; successor `cb0de669` |
| `e5d3f628` | `/app/w/acme/calendar`                 | tablet/default    | responsive                       |
| `f2bf40ae` | `/app/w/acme`                          | desktop/default   | canonical                        |
| `f4dc67d1` | `/app`                                 | desktop/default   | canonical                        |
| `f7159c3e` | `/app/w/acme/planning/{contentItemId}` | desktop/final     | canonical                        |
| `f9e58e53` | `/app/w/acme/board`                    | desktop/final     | canonical                        |

Use the complete filenames from `designs/stitch/`; do not shorten `screenId` in the manifest. Use the full IDs in `STUDIOFLOW_MASTER_PROMPT.md` for canonical, responsive, and explicitly superseded references. Historical filenames with only an eight-character captured prefix remain prefix-identified and must never override the named canonical successor.

- [ ] **Step 5: Make the manifest test pass**

Run: `rtk pnpm exec vitest run tests/unit/stitch-cases.test.ts`

Expected: 3 tests PASS and the manifest count is exactly 49. Add assertions for 27 canonical, 11 responsive, one supporting, three historical, and seven captured superseded entries.

- [ ] **Step 6: Correct the parity matrix contract**

Update `SCREEN_PARITY.md` so it distinguishes:

- 49 captured Stitch references;
- 26 current matrix rows;
- the missing Forgot Password row, bringing the matrix to 27;
- 27 route/surface rows × 6 canonical viewports;
- 39 active canonical/responsive/supporting reference-state comparisons at their captured viewport;
- 10 historical/superseded captures classified with a successor and excluded from implementation targets.

Add `/signin/forgot-password` as a real implemented row; the prior “approved deviation” is obsolete because password reset now exists.

- [ ] **Step 7: Commit and push the contract**

```bash
rtk git add tests/e2e/stitch-cases.ts tests/unit/stitch-cases.test.ts docs/production-readiness/STITCH_CAPTURE_INVENTORY.md docs/production-readiness/SCREEN_PARITY.md
rtk git commit -m "test(ui): define canonical Stitch screen inventory"
rtk git push origin main
```

---

### Task 2: Add the Brand Kit database foundation

**Files:**

- Create: `src/lib/db/schema/brand-kit.ts`
- Modify: `src/lib/db/schema/index.ts`
- Create: `src/lib/db/migrations/0005_brand_kit_rules_resources.sql`
- Modify: `src/lib/db/migrations/meta/_journal.json`
- Modify: `src/lib/db/migrations/meta/0005_snapshot.json`
- Test: `tests/integration/schema.test.ts`
- Test: `tests/integration/brand-kit.test.ts`
- Modify: `docs/production-readiness/MIGRATION_DEPLOYMENT.md`

- [ ] **Step 1: Write failing schema and constraint tests**

```ts
describe("Brand Kit publishing rules and linked resources", () => {
  it("keeps rules tenant-scoped and soft-archivable", async () => {
    const rule = await insertPublishingRule({
      workspaceId,
      createdBy: managerId,
      ruleType: "alt_text",
      title: "Describe meaningful visuals",
      content: "Write concise alt text for every informative image.",
    });
    expect(rule.archivedAt).toBeNull();
  });

  it("rejects a non-HTTPS linked resource", async () => {
    await expect(
      insertLinkedResource({
        workspaceId,
        createdBy: managerId,
        provider: "figma",
        name: "Design library",
        url: "http://example.test/file",
      }),
    ).rejects.toThrow();
  });

  it("rejects unsupported publishing-rule and provider values", async () => {
    await expect(insertRawRuleType("unknown")).rejects.toThrow();
    await expect(insertRawProvider("unknown")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the focused integration test and confirm failure**

Run: `TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:integration -- tests/integration/brand-kit.test.ts`

Expected: FAIL because the two tables and exports do not exist.

- [ ] **Step 3: Define the two additive tables**

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { archivedAt, idColumn, timestamps } from "./_helpers";
import { users } from "./identity";
import { workspaces } from "./workspaces";

export const brandPublishingRules = pgTable(
  "brand_publishing_rule",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    ruleType: text("rule_type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: archivedAt(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("brand_publishing_rule_workspace_idx").on(table.workspaceId, table.sortOrder),
    check(
      "brand_publishing_rule_type_valid",
      sql`${table.ruleType} IN ('alt_text', 'hashtag', 'compliance', 'channel', 'general')`,
    ),
  ],
);

export const brandLinkedResources = pgTable(
  "brand_linked_resource",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    archivedAt: archivedAt(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("brand_linked_resource_workspace_idx").on(table.workspaceId),
    check(
      "brand_linked_resource_provider_valid",
      sql`${table.provider} IN ('google_drive', 'figma', 'canva', 'dropbox', 'other')`,
    ),
    check("brand_linked_resource_url_https", sql`${table.url} ~* '^https://'`),
  ],
);
```

- [ ] **Step 4: Generate and inspect the migration**

Run: `rtk pnpm exec drizzle-kit generate --name brand-kit-rules-resources`

Expected: one forward migration containing only two table creations, checks, indexes, foreign keys, and metadata updates. Rename the generated SQL to `0005_brand_kit_rules_resources.sql` only if the journal and snapshot reference are updated consistently.

- [ ] **Step 5: Prove forward and compatibility behavior**

Run: `TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:integration -- tests/integration/schema.test.ts tests/integration/brand-kit.test.ts`

Expected: PASS. The pre-migration application remains compatible because both new tables are additive and no existing column changes.

- [ ] **Step 6: Run the migration drill and record rollback evidence**

Run: `TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm migration-drill`

Expected: from-zero migration, in-place migration, backup, restore, and application compatibility checks PASS. Record the exact SHA, command, exit code, backup location, restoration duration, and the rollback statement: deploy the prior image without using the new tables; restore the pre-migration backup if the new data must be removed.

- [ ] **Step 7: Commit and push the schema milestone**

```bash
rtk git add src/lib/db/schema/brand-kit.ts src/lib/db/schema/index.ts src/lib/db/migrations tests/integration/schema.test.ts tests/integration/brand-kit.test.ts docs/production-readiness/MIGRATION_DEPLOYMENT.md
rtk git commit -m "feat(db): add brand rules and linked resources"
rtk git push origin main
```

---

### Task 3: Add Brand Kit validation and service operations

**Files:**

- Modify: `src/lib/brand/command.ts`
- Modify: `src/lib/brand/service.ts`
- Test: `tests/unit/brand/command.test.ts`
- Test: `tests/unit/brand/service.test.ts`

- [ ] **Step 1: Write failing command tests**

```ts
describe("BrandPublishingRuleCommandSchema", () => {
  it("accepts a trimmed compliance rule", () => {
    expect(
      BrandPublishingRuleCommandSchema.parse({
        ruleType: "compliance",
        title: " Legal review ",
        content: " Claims require written approval. ",
      }),
    ).toEqual({
      ruleType: "compliance",
      title: "Legal review",
      content: "Claims require written approval.",
    });
  });

  it("rejects empty and overlong fields", () => {
    expect(() =>
      BrandPublishingRuleCommandSchema.parse({ ruleType: "general", title: "", content: "" }),
    ).toThrow();
  });
});

describe("BrandLinkedResourceCommandSchema", () => {
  it("accepts an HTTPS Figma URL", () => {
    expect(
      BrandLinkedResourceCommandSchema.parse({
        provider: "figma",
        name: "Master design library",
        url: "https://figma.com/file/example",
        description: "Approved components",
      }).provider,
    ).toBe("figma");
  });

  it("rejects HTTP and javascript URLs", () => {
    for (const url of ["http://example.com", "javascript:alert(1)"]) {
      expect(() =>
        BrandLinkedResourceCommandSchema.parse({ provider: "other", name: "Unsafe", url }),
      ).toThrow();
    }
  });
});
```

- [ ] **Step 2: Add the schemas**

```ts
export const BrandPublishingRuleCommandSchema = z.object({
  ruleType: z.enum(["alt_text", "hashtag", "compliance", "channel", "general"]),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(1000),
});

export const BrandLinkedResourceCommandSchema = z.object({
  provider: z.enum(["google_drive", "figma", "canva", "dropbox", "other"]),
  name: z.string().trim().min(1).max(120),
  url: z
    .string()
    .trim()
    .url()
    .refine((url) => url.startsWith("https://"), "Use HTTPS"),
  description: z.string().trim().max(280).optional(),
});
```

- [ ] **Step 3: Run the command suite**

Run: `rtk pnpm exec vitest run tests/unit/brand/command.test.ts`

Expected: all existing and new command tests PASS.

- [ ] **Step 4: Write failing authorization and tenancy service tests**

Cover these exact cases for both entities:

- agency admin succeeds through the policy shortcut;
- workspace manager succeeds;
- content planner succeeds, matching the master capability matrix;
- designer, reviewer, publisher, viewer, and client reviewer cannot mutate;
- listing filters by `workspaceId` and `archivedAt IS NULL`;
- archiving includes both entity ID and workspace ID in the predicate;
- recent updates include rule/resource entries without exposing URLs.

- [ ] **Step 5: Add service types and operations**

```ts
const BRAND_MANAGER_ROLES = ["workspace_manager", "content_planner"] as const;

async function requireBrandManager(actor: Actor, workspaceId: string, action: string) {
  const allowed = await hasWorkspaceRole(actor, workspaceId, [...BRAND_MANAGER_ROLES]);
  if (!allowed) throw new PermissionDeniedError(action);
}

export async function listBrandPublishingRules(workspaceId: string) {
  return db
    .select()
    .from(brandPublishingRules)
    .where(
      and(
        eq(brandPublishingRules.workspaceId, workspaceId),
        isNull(brandPublishingRules.archivedAt),
      ),
    )
    .orderBy(asc(brandPublishingRules.sortOrder), asc(brandPublishingRules.createdAt));
}

export async function listBrandLinkedResources(workspaceId: string) {
  return db
    .select()
    .from(brandLinkedResources)
    .where(
      and(
        eq(brandLinkedResources.workspaceId, workspaceId),
        isNull(brandLinkedResources.archivedAt),
      ),
    )
    .orderBy(asc(brandLinkedResources.name));
}
```

Add `createBrandPublishingRule`, `archiveBrandPublishingRule`, `createBrandLinkedResource`, and `archiveBrandLinkedResource`; every mutation must call `requireBrandManager` and scope updates by workspace.

- [ ] **Step 6: Run domain tests and coverage**

Run: `rtk pnpm exec vitest run tests/unit/brand/command.test.ts tests/unit/brand/service.test.ts --coverage`

Expected: PASS with the `src/lib/brand/**/*.ts` thresholds at or above 85 statements/functions/lines and 80 branches.

- [ ] **Step 7: Commit and push the domain milestone**

```bash
rtk git add src/lib/brand/command.ts src/lib/brand/service.ts tests/unit/brand/command.test.ts tests/unit/brand/service.test.ts
rtk git commit -m "feat(brand): add publishing and resource services"
rtk git push origin main
```

---

### Task 4: Implement Brand Kit actions and accessible forms

**Files:**

- Modify: `src/app/(app)/app/w/[slug]/brand-kit/actions.ts`
- Create: `src/app/(app)/app/w/[slug]/brand-kit/publishing-rule-form.tsx`
- Create: `src/app/(app)/app/w/[slug]/brand-kit/linked-resource-form.tsx`
- Test: `tests/unit/brand-kit/actions.test.ts`
- Create: `tests/unit/brand-kit/publishing-rule-form.test.tsx`
- Create: `tests/unit/brand-kit/linked-resource-form.test.tsx`

- [ ] **Step 1: Write failing action tests**

For each create action assert unauthenticated, inaccessible workspace, unauthorized role, invalid payload, successful service call, and `revalidatePath`. For each archive action assert unauthorized no-op/denial and a workspace-scoped service call.

```ts
it("creates a publishing rule for an authorized actor", async () => {
  authMock.auth.mockResolvedValue(session);
  workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
  serviceMock.createBrandPublishingRule.mockResolvedValue(undefined);
  const result = await createPublishingRuleAction(
    slug,
    {},
    formData({
      ruleType: "alt_text",
      title: "Describe visuals",
      content: "Use concise, meaningful descriptions.",
    }),
  );
  expect(result).toEqual({ success: true });
  expect(serviceMock.createBrandPublishingRule).toHaveBeenCalledWith(
    { id: session.user.id },
    workspace.id,
    expect.objectContaining({ ruleType: "alt_text" }),
  );
});
```

- [ ] **Step 2: Implement thin Server Actions**

Actions must follow `auth()` → `getAccessibleWorkspace()` → Zod parse → service call → `revalidatePath()`. Do not duplicate direct Drizzle mutations in the action file.

```ts
export async function createPublishingRuleAction(
  slug: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { error: "Workspace not found." };
  const parsed = BrandPublishingRuleCommandSchema.safeParse({
    ruleType: readString(formData, "ruleType"),
    title: readString(formData, "title"),
    content: readString(formData, "content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  await createBrandPublishingRule({ id: session.user.id }, workspace.id, parsed.data);
  revalidatePath(`/app/w/${slug}/brand-kit`);
  return { success: true };
}
```

- [ ] **Step 3: Write failing form tests**

Assert associated labels, required markers, field limits, provider/type choices, live error region, pending disabled submit state, success reset behavior, 44px mobile targets, and no submission with invalid input.

- [ ] **Step 4: Implement both client forms**

Use `useActionState`, `FormField`, `Input`, `FormSubmitButton`, and `<p role="alert" aria-live="polite">`. Keep client boundaries at the form files; the page remains a Server Component.

```tsx
"use client";

export function PublishingRuleForm({ action }: { action: FormAction }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3" data-testid="publishing-rule-form">
      <FormField id="publishing-rule-type" label="Rule type" required>
        <select id="publishing-rule-type" name="ruleType" required className={controlClass}>
          <option value="alt_text">Alt text</option>
          <option value="hashtag">Hashtags</option>
          <option value="compliance">Compliance</option>
          <option value="channel">Channel-specific</option>
          <option value="general">General</option>
        </select>
      </FormField>
      <FormField id="publishing-rule-title" label="Title" required>
        <Input id="publishing-rule-title" name="title" required maxLength={80} />
      </FormField>
      <FormField id="publishing-rule-content" label="Rule" required>
        <textarea
          id="publishing-rule-content"
          name="content"
          required
          maxLength={1000}
          rows={4}
          className={controlClass}
        />
      </FormField>
      {state.error ? (
        <p role="alert" aria-live="polite">
          {state.error}
        </p>
      ) : null}
      <FormSubmitButton>Create rule</FormSubmitButton>
    </form>
  );
}
```

- [ ] **Step 5: Run action and form tests**

Run: `rtk pnpm exec vitest run tests/unit/brand-kit/actions.test.ts tests/unit/brand-kit/publishing-rule-form.test.tsx tests/unit/brand-kit/linked-resource-form.test.tsx`

Expected: PASS with no console errors.

- [ ] **Step 6: Commit and push the action/form milestone**

```bash
rtk git add 'src/app/(app)/app/w/[slug]/brand-kit/actions.ts' 'src/app/(app)/app/w/[slug]/brand-kit/publishing-rule-form.tsx' 'src/app/(app)/app/w/[slug]/brand-kit/linked-resource-form.tsx' tests/unit/brand-kit
rtk git commit -m "feat(brand): add rule and resource forms"
rtk git push origin main
```

---

### Task 5: Replace Brand Kit placeholders with production UI

**Files:**

- Modify: `src/app/(app)/app/w/[slug]/brand-kit/page.tsx`
- Modify: `tests/unit/brand-kit/page.test.tsx`
- Modify: `docs/design/SETTINGS_UI_LEARNINGS.md`
- Reference: `designs/stitch/16aaf0a9_northstar-coffee---brand-kit.html`
- Reference: `designs/stitch/16aaf0a9_northstar-coffee---brand-kit.png`

- [ ] **Step 1: Replace placeholder assertions with failing behavior assertions**

```ts
it("renders publishing rules and linked resources from the service", async () => {
  serviceMock.listBrandPublishingRules.mockResolvedValue([
    {
      id: "rule-1",
      ruleType: "alt_text",
      title: "Describe visuals",
      content: "Use meaningful alt text.",
    },
  ]);
  serviceMock.listBrandLinkedResources.mockResolvedValue([
    {
      id: "link-1",
      provider: "figma",
      name: "Design library",
      url: "https://figma.com/file/example",
      description: null,
    },
  ]);
  await renderPageForManager();
  expect(screen.getByText("Describe visuals")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Design library" })).toHaveAttribute(
    "href",
    "https://figma.com/file/example",
  );
});

it("shows create and archive controls only to authorized Brand Kit editors", async () => {
  await renderPageForViewer();
  expect(screen.queryByTestId("publishing-rule-form")).toBeNull();
  expect(screen.queryByTestId("linked-resource-form")).toBeNull();
  expect(screen.queryByRole("button", { name: /archive/i })).toBeNull();
});
```

- [ ] **Step 2: Fetch all Brand Kit data in one parallel group**

Use `Promise.all` for assets, voice rules, pillars, recent updates, publishing rules, and linked resources. Never fetch the external URL content server-side.

- [ ] **Step 3: Render production cards**

Remove every `R3-F`, “once the linking surface lands,” and inert-button string. Render:

- a rule list with type badge, title, content, and archive action for agency admins, workspace managers, and content planners;
- a resource list with provider icon/text, safe external link using `target="_blank" rel="noreferrer"`, description, and archive action for agency admins, workspace managers, and content planners;
- create forms for agency admins, workspace managers, and content planners;
- honest empty states without roadmap copy;
- preserved 12-column Stitch Bento composition and tokens.

- [ ] **Step 4: Run the page and full Brand Kit unit suites**

Run: `rtk pnpm exec vitest run tests/unit/brand-kit tests/unit/brand`

Expected: PASS. A repository search for `R3-F|once the linking surface lands` returns zero results outside historical plans.

- [ ] **Step 5: Verify the two target viewports manually**

Run the app against the disposable test database and compare `/app/w/acme/brand-kit` at 390×844 and 1280×800 against the captured Brand Kit PNG/HTML. Record mismatches before committing; fix token, spacing, overflow, focus, and empty-state issues in this task.

- [ ] **Step 6: Commit and push the completed Brand Kit**

```bash
rtk git add 'src/app/(app)/app/w/[slug]/brand-kit/page.tsx' tests/unit/brand-kit/page.test.tsx docs/design/SETTINGS_UI_LEARNINGS.md
rtk git commit -m "feat(brand): complete publishing and resource UI"
rtk git push origin main
```

---

### Task 6: Add the complete administration E2E journey

**Files:**

- Create: `tests/e2e/administration.spec.ts`
- Modify: `tests/e2e/_helpers.ts`
- Modify: `src/app/api/dev/seed/route.ts`
- Modify: `docs/production-readiness/TEST_EVIDENCE.md`

- [ ] **Step 1: Write the failing manager journey**

```ts
test("workspace manager configures Brand Kit rules and resources", async ({ page }) => {
  await bootstrapRoleSession(page, "workspace_manager", "brand-admin");
  await page.goto("/app/w/brand-admin/brand-kit");

  await page.getByLabel("Rule type").selectOption("alt_text");
  await page.getByLabel("Title").fill("Describe meaningful visuals");
  await page.getByLabel("Rule").fill("Use concise alt text for informative images.");
  await page.getByRole("button", { name: "Create rule" }).click();
  await expect(page.getByText("Describe meaningful visuals")).toBeVisible();

  await page.getByLabel("Provider").selectOption("figma");
  await page.getByLabel("Resource name").fill("Master design library");
  await page.getByLabel("Resource URL").fill("https://figma.com/file/example");
  await page.getByRole("button", { name: "Link resource" }).click();
  await expect(page.getByRole("link", { name: "Master design library" })).toBeVisible();
});
```

- [ ] **Step 2: Add exact role tests**

Add independent tests proving:

- `content_planner` can create/archive Brand Kit records;
- `viewer` can see approved Brand Kit content but no mutation controls;
- `client_reviewer` cannot open internal Brand Kit and sees the project’s not-found/denied state;
- archived records disappear after reload;
- an ID from workspace A cannot be archived through workspace B.

- [ ] **Step 3: Make the seed return deterministic visual IDs**

Extend `SeedResult` with `contentItemId`. In `src/app/api/dev/seed/route.ts`, idempotently insert or find a content item named `Autumn Blend Reveal` for the requested workspace, connect its channels, and return its ID. Use database lookups rather than hard-coded UUIDs.

```ts
export type SeedResult = {
  userId: string;
  agencyId: string;
  workspaceId: string;
  workspaceSlug: string;
  channelIds: string[];
  contentItemId: string;
};
```

- [ ] **Step 4: Run the focused Chromium journey**

Run: `TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:e2e:isolated -- administration.spec.ts --project=chromium`

Expected: all administration journey tests PASS with mandatory assertions and no conditional skips.

- [ ] **Step 5: Run the complete role and administration set**

Run: `TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:e2e:isolated -- administration.spec.ts role-authorization.spec.ts --project=chromium`

Expected: PASS; client data never exposes internal controls or URLs.

- [ ] **Step 6: Commit and push the E2E milestone**

```bash
rtk git add tests/e2e/administration.spec.ts tests/e2e/_helpers.ts src/app/api/dev/seed/route.ts docs/production-readiness/TEST_EVIDENCE.md
rtk git commit -m "test(brand): add administration journey"
rtk git push origin main
```

---

### Task 7: Replace the skipped visual harness with deterministic cases

**Files:**

- Modify: `tests/e2e/stitch-cases.ts`
- Modify: `tests/e2e/visual-regression.spec.ts`
- Modify: `tests/e2e/_helpers.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Modify: `.github/workflows/e2e.yml`
- Create: `docs/production-readiness/VISUAL_REVIEW.md`

- [ ] **Step 1: Write failing harness-contract tests**

Extend `tests/unit/stitch-cases.test.ts` to assert:

- 49 classified captures: 39 active targets and 10 historical/superseded exclusions;
- 27 canonical surfaces;
- six regression viewports: 360, 390, 768, 1024, 1280, 1440;
- no unresolved `{contentItemId}` after `resolveStitchRoute` receives `SeedResult`;
- unique screenshot names;
- every state declares a deterministic setup function.

- [ ] **Step 2: Split functional and visual Playwright projects**

```ts
projects: [
  {
    name: "chromium",
    testIgnore: /visual-regression\.spec\.ts/,
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "firefox",
    testIgnore: /visual-regression\.spec\.ts/,
    use: { ...devices["Desktop Firefox"] },
  },
  {
    name: "webkit",
    testIgnore: /visual-regression\.spec\.ts/,
    use: { ...devices["Desktop Safari"] },
  },
  {
    name: "mobile-chrome",
    testIgnore: /visual-regression\.spec\.ts/,
    use: { ...devices["Pixel 7"] },
  },
  {
    name: "mobile-safari",
    testIgnore: /visual-regression\.spec\.ts/,
    use: { ...devices["iPhone 13"] },
  },
  {
    name: "visual-chromium",
    testMatch: /visual-regression\.spec\.ts/,
    use: { ...devices["Desktop Chrome"] },
  },
];
```

This prevents the 6-viewport matrix from running five redundant times.

- [ ] **Step 3: Remove the unconditional skip**

Delete `test.skip(true, "visual baselines need to be captured first")`. The committed snapshot is now required; absence or visual drift must fail.

- [ ] **Step 4: Drive screenshots from the typed manifest**

For each exact Stitch case:

1. bootstrap the declared role and workspace;
2. seed the declared state;
3. resolve `{contentItemId}`;
4. set the case viewport;
5. navigate and wait for the page’s stable `data-testid`;
6. inject dynamic masking CSS;
7. run serious/critical axe assertions;
8. capture a stable screenshot name containing the screen ID.

For `notification-drawer`, navigate to `/app` and open the real notification trigger before capture. For `operational-states`, capture deterministic loading, empty, error, denied, and archived examples as one evidence group and review the group against `21068e5a`; do not add a production-only showcase route.

Also generate the 27-surface × 6-viewport responsive matrix from a separate `CANONICAL_SURFACES` list. Exact-reference cases and responsive cases must have different snapshot directories.

- [ ] **Step 5: Add deterministic state seed helpers**

Add test-only seed operations for `empty`, `failed`, `approved`, `discussion`, `decision`, and notification drawer states. Every helper must be idempotent and the route must return 404 in production. Do not use production data or external providers.

- [ ] **Step 6: Add explicit scripts**

```json
{
  "test:e2e:critical": "playwright test --project=chromium --project=visual-chromium",
  "test:visual": "playwright test visual-regression.spec.ts --project=visual-chromium",
  "test:visual:update": "playwright test visual-regression.spec.ts --project=visual-chromium --update-snapshots"
}
```

- [ ] **Step 7: Capture candidate baselines**

Run: `TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:visual:update`

Expected: committed candidates for all 39 active reference cases and all 162 responsive route cases; all 10 excluded captures have a documented successor/reason; zero skipped required tests.

- [ ] **Step 8: Perform and record the Stitch review**

For every active `STITCH_CASES` entry, compare the candidate against its PNG and HTML. For every historical/superseded entry, review and record the canonical successor rather than making the product match obsolete work. Record screen ID, classification, route/state, viewport, reviewer, date, result, and issue/commit link in `VISUAL_REVIEW.md`. A baseline may be approved only after typography, spacing, layout, tokens, icons, imagery, overflow, responsive behavior, and interactive state match or an approved deviation is documented.

- [ ] **Step 9: Run the non-update visual suite**

Run: `TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:visual`

Expected: all visual and inline axe assertions PASS, zero snapshots written, zero skips.

- [ ] **Step 10: Make E2E automatic**

Change `.github/workflows/e2e.yml` to run on `pull_request` and pushes to `main`, retain `workflow_dispatch`, upload `playwright-report`, `test-results`, and visual diffs on failure, and fail the workflow on any required test. Keep the full five-browser functional matrix here; run visual screenshots only in `visual-chromium`.

- [ ] **Step 11: Commit and push the visual milestone**

```bash
rtk git add tests/e2e tests/unit/stitch-cases.test.ts playwright.config.ts package.json .github/workflows/e2e.yml docs/production-readiness/VISUAL_REVIEW.md
rtk git commit -m "test(ui): enforce Stitch visual baselines"
rtk git push origin main
```

---

### Task 8: Complete manual accessibility and UAT evidence

**Files:**

- Create: `docs/production-readiness/ACCESSIBILITY_CHECKLIST.md`
- Create: `docs/production-readiness/EXTERNAL_SERVICES_UAT.md`
- Modify: `docs/production-readiness/UAT_RELEASE.md`
- Modify: `docs/production-readiness/TEST_EVIDENCE.md`
- Modify: `PRODUCTION_READINESS_TRACKER.md`

- [ ] **Step 1: Add the manual accessibility evidence template**

The checklist must contain one row per canonical surface and columns for:

- keyboard-only completion;
- visible focus and logical focus order;
- screen-reader name/role/value and heading hierarchy;
- 200% browser zoom without lost content or horizontal page scrolling;
- reduced-motion behavior;
- 360px reflow and 44px targets;
- reviewer, browser/assistive technology, date, result, and issue link.

- [ ] **Step 2: Run automated accessibility first**

Run: `TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:a11y`

Expected: zero serious/critical axe violations and zero skips. Fix automated failures before manual review.

Steps 3–6 are release-candidate activities. Execute them after Task 12 and rerun any affected check when a later code change touches UI, authorization, data, email, storage, AI, observability, or deployment behavior.

- [ ] **Step 3: Execute keyboard and screen-reader checks**

Use Chrome + VoiceOver on macOS and at least one independent Firefox keyboard-only pass. Test every form error, dialog/drawer, menu, tab/anchor strip, calendar event, approval action, archive confirmation, and external link. Record exact operator/date/result; do not self-assign `Verified`.

- [ ] **Step 4: Execute the separated-account 30-step UAT**

Use independent Maya, Omar, Elena, Jon, Sophie, and Daniel accounts as defined in `STUDIOFLOW_MASTER_PROMPT.md` §23. Record only account role, operator, date, environment, and pass/fail; never store credentials, reset tokens, invitation URLs, or private content.

- [ ] **Step 5: Execute external-service checks**

Record controlled checks for:

- Google OAuth redirect and callback;
- Mailcow invitation, magic-link, and password-reset delivery;
- MiniMax enabled/disabled/provider-error paths;
- Sentry release, source maps, data scrubbing, and alert delivery;
- encrypted offsite backup and timed disposable restore;
- credential rotation owner and next rotation date.

- [ ] **Step 6: Update status without overclaiming**

Move QA-005 and corresponding UAT rows to `Tested` only when operator/date/result evidence is complete. Leave them `Partial` if any human or external-service check remains. Only the independent reviewer may set `Verified`.

- [ ] **Step 7: Commit and push evidence**

```bash
rtk git add docs/production-readiness/ACCESSIBILITY_CHECKLIST.md docs/production-readiness/EXTERNAL_SERVICES_UAT.md docs/production-readiness/UAT_RELEASE.md docs/production-readiness/TEST_EVIDENCE.md PRODUCTION_READINESS_TRACKER.md
rtk git commit -m "docs(qa): record accessibility and UAT evidence"
rtk git push origin main
```

---

### Task 9: Restore production coverage through tests

**Files:**

- Modify: `vitest.config.ts`
- Modify: tests under `tests/unit/` for auth, security, content, deliveries, publishing, observability, workspaces, AI, email, and validation
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/production-readiness/TEST_EVIDENCE.md`
- Modify: `PRODUCTION_READINESS_TRACKER.md`

- [ ] **Step 1: Capture the honest baseline**

Run: `rtk pnpm test:coverage`

Expected: save the per-glob statements/branches/functions/lines output in the evidence document. Do not edit thresholds yet.

- [ ] **Step 2: Restore the content function threshold immediately**

Write focused tests for every uncovered exported content function, including success, authorization denial, invalid transition, workspace mismatch, and transaction rollback. Raise `src/lib/content/**/*.ts` functions from 47 back to at least 60 in the same commit; continue adding tests until it reaches the critical-domain target.

- [ ] **Step 3: Raise each critical domain to the release contract**

For `auth`, `security`, `content`, `deliveries`, `publishing`, and `observability`, add tests until each glob reaches at least:

```ts
{ statements: 95, branches: 90, functions: 95, lines: 95 }
```

Every DB-touching service test must mock the DB boundary for unit coverage and retain real constraint/concurrency coverage in `tests/integration/`.

- [ ] **Step 4: Raise application services to the release contract**

For `channels`, `brand`, `storage`, `dashboard`, `workspaces`, `ai`, `email`, and `validation`, add tests until each glob reaches at least:

```ts
{ statements: 85, branches: 80, functions: 85, lines: 85 }
```

Zero thresholds for Workspaces functions, AI, or Email are forbidden.

- [ ] **Step 5: Test coverage enforcement itself**

Temporarily lower one covered function count locally by excluding a focused test and confirm `pnpm test:coverage` exits non-zero. Restore the test immediately and rerun. Record only the command/result; do not commit the temporary exclusion.

- [ ] **Step 6: Keep integration tests as a separate mandatory gate**

Do not inflate unit metrics by combining incompatible jsdom and database processes. CI must run both `pnpm test:coverage` and `pnpm test:integration`; the tracker must report both results separately.

- [ ] **Step 7: Run the full quality gate**

Run:

```bash
rtk pnpm verify
TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:integration
rtk pnpm test:coverage
rtk pnpm audit --prod
```

Expected: all commands exit 0, no skipped required tests, zero production advisories, and target thresholds enforced.

- [ ] **Step 8: Commit and push coverage recovery**

```bash
rtk git add vitest.config.ts tests/unit .github/workflows/ci.yml docs/production-readiness/TEST_EVIDENCE.md PRODUCTION_READINESS_TRACKER.md
rtk git commit -m "test(coverage): restore production thresholds"
rtk git push origin main
```

---

### Task 10: Make deploy wait for required UI verification

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/e2e.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `docs/testing/strategy.md`
- Modify: `docs/operations/runbook.md`

- [ ] **Step 1: Define the release-gate contract**

Required pre-deploy jobs are:

- format, lint, typecheck;
- unit and target coverage;
- integration and migration;
- production build and Docker smoke;
- Chromium critical E2E;
- visual-chromium baseline comparison;
- zero critical/high production audit findings.

Full Firefox/WebKit/mobile functional runs remain required for the release candidate and execute automatically in the E2E workflow.

- [ ] **Step 2: Put critical E2E in the authoritative CI workflow**

After the test database is migrated, install Chromium and run:

```yaml
- name: Install Chromium
  run: pnpm exec playwright install --with-deps chromium
- name: Critical browser and visual tests
  run: pnpm test:e2e:critical
```

The deploy workflow may continue to trigger from successful `CI` only because CI now includes the critical visual gate.

- [ ] **Step 3: Keep the full E2E workflow automatic and visible**

Run it on PRs and `main`, retain manual dispatch, and upload reports/diffs. Mark the full cross-browser workflow as a required release check in documentation even if production deploy waits only for the critical CI subset.

- [ ] **Step 4: Test workflow syntax and commands locally**

Run:

```bash
rtk pnpm exec prettier --check .github/workflows/ci.yml .github/workflows/e2e.yml .github/workflows/deploy.yml
rtk pnpm test:e2e:critical
```

Expected: formatting and critical browser/visual tests PASS.

- [ ] **Step 5: Commit and push the release gate**

```bash
rtk git add .github/workflows/ci.yml .github/workflows/e2e.yml .github/workflows/deploy.yml docs/testing/strategy.md docs/operations/runbook.md
rtk git commit -m "ci: gate deploy on critical visual tests"
rtk git push origin main
```

---

### Task 11: Reconcile all project status documentation

**Files:**

- Modify: `issues.md`
- Modify: `PRODUCTION_READINESS_TRACKER.md`
- Modify: `docs/production-readiness/SCREEN_PARITY.md`
- Modify: `docs/production-readiness/TEST_EVIDENCE.md`
- Modify: `docs/production-readiness/UAT_RELEASE.md`
- Modify: `docs/production-readiness/DESIGN_AUDIT.md`
- Modify: `docs/implementation/progress.md`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add a contradiction scan**

Run:

```bash
rtk rg -n "READY|NOT PRODUCTION READY|16 canonical|25 routes|27 canonical|49 PNG|skip-by-default|R3-F|pending|in flight|Not Started|Partial" README.md AGENTS.md issues.md PRODUCTION_READINESS_TRACKER.md docs
```

Expected: produce a finite list of claims that must be reconciled against current tests and evidence.

- [ ] **Step 2: Close or rewrite stale issue entries**

For Issues #1 and #2, replace historical “pending/in flight” statuses with:

- exact landed commits;
- completed Brand Kit rule/resource capabilities;
- administration E2E result;
- visual baseline result;
- remaining human-only approvals, if any.

Keep history but clearly mark the current status and date.

- [ ] **Step 3: Align every count and status**

Use these definitions consistently:

- 49 captured Stitch references;
- 27 canonical route/surface rows including Forgot Password;
- 39 active exact-reference comparisons plus 10 documented historical/superseded exclusions;
- 162 responsive route/viewpoint comparisons;
- `Implemented` means code exists;
- `Tested` requires committed automated/manual evidence;
- `Verified` requires independent reviewer sign-off.

- [ ] **Step 4: Remove contradictory release verdicts**

The tracker and UAT document must expose one shared verdict. Before independent approval, use `READY FOR INDEPENDENT REVIEW`, not `READY`. After independent approval, use `READY` and cite the reviewer/date/commit.

- [ ] **Step 5: Run documentation checks**

Run:

```bash
rtk pnpm format:check
rtk rg -n "R3-F|skip-by-default|16 canonical routes|NOT PRODUCTION READY" README.md AGENTS.md issues.md PRODUCTION_READINESS_TRACKER.md docs
```

Expected: formatting PASS; the second command returns only intentionally retained historical quotations with explicit dates.

- [ ] **Step 6: Commit and push documentation truth**

```bash
rtk git add README.md AGENTS.md issues.md PRODUCTION_READINESS_TRACKER.md docs
rtk git commit -m "docs(tracker): reconcile production readiness evidence"
rtk git push origin main
```

---

### Task 12: Complete targeted architecture cleanup

**Files:**

- Create: `src/components/workspace/calendar-event-card.tsx`
- Create: `tests/unit/workspace/calendar-event-card.test.tsx`
- Modify: `src/app/(app)/app/w/[slug]/calendar/page.tsx`
- Create: `src/components/workspace/approval-timeline.tsx`
- Create: `tests/unit/workspace/approval-timeline.test.tsx`
- Modify: `src/app/(app)/app/w/[slug]/planning/[id]/workflow-bar.tsx`
- Create: `src/components/workspace/delivery-version-list.tsx`
- Create: `tests/unit/workspace/delivery-version-list.test.tsx`
- Modify: `src/lib/deliveries/service.ts`
- Modify: `src/app/(app)/app/w/[slug]/planning/[id]/page.tsx`
- Modify: `src/app/(app)/app/w/[slug]/planning/[id]/delivery-section.tsx`
- Modify: `docs/production-readiness/DESIGN_AUDIT.md`

- [ ] **Step 1: Extract and test CalendarEventCard**

Define typed props for `id`, `href`, `title`, `status`, and `format`. Tests must cover every badge variant family, accessible link name, truncation-safe content, and status represented by text plus color.

```tsx
export type CalendarEventCardProps = {
  id: string;
  href: string;
  title: string;
  status: string;
  format: string;
};
```

Replace the inlined calendar `<Link>` block with the component and confirm the visual snapshot is unchanged.

- [ ] **Step 2: Extract and test ApprovalTimeline**

Move only approval request rendering from `workflow-bar.tsx`; keep transition orchestration in `WorkflowBar`. Pass typed `onApprove` and `onRequestChanges` callbacks. Test approved, changes-requested, pending internal reviewer, pending client reviewer, unauthorized pending, and disabled pending states.

- [ ] **Step 3: Add immutable delivery history**

Add `listDeliveryVersionsForItem(actor, contentItemId)` to `src/lib/deliveries/service.ts`. It must:

- resolve the item’s workspace;
- apply the same authorized role set as approvals;
- list versions newest-first;
- include links ordered by creation time;
- expose `isFinalApproved`, version number, description, designer note, submitter, and submitted timestamp;
- never expose internal-only data to a client reviewer unless the version belongs to that reviewer’s submitted approval surface.

Render `DeliveryVersionList` above the submit form. Test empty, multiple immutable versions, approved version, safe external links, and client-safe projection.

- [ ] **Step 4: Run focused unit, integration, and visual checks**

Run:

```bash
rtk pnpm exec vitest run tests/unit/workspace/calendar-event-card.test.tsx tests/unit/workspace/approval-timeline.test.tsx tests/unit/workspace/delivery-version-list.test.tsx
TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:integration -- tests/integration/journey.test.ts
rtk pnpm test:visual
```

Expected: PASS and zero approved baseline changes. If a baseline changes, treat it as a regression unless the independent visual reviewer approves the change.

- [ ] **Step 5: Update architectural debt evidence**

Recount shared and route-local components. Mark AD-001 complete only if every named candidate in the tracker is extracted, typed, tested, and reused where a second consumer exists. Do not extract a one-off component solely to satisfy a component count.

- [ ] **Step 6: Commit and push cleanup**

```bash
rtk git add src/components/workspace tests/unit/workspace 'src/app/(app)/app/w/[slug]/calendar/page.tsx' 'src/app/(app)/app/w/[slug]/planning/[id]' src/lib/deliveries/service.ts docs/production-readiness/DESIGN_AUDIT.md PRODUCTION_READINESS_TRACKER.md
rtk git commit -m "refactor(ui): extract calendar and review components"
rtk git push origin main
```

---

### Task 13: Run final verification and independent sign-off

**Files:**

- Modify: `PRODUCTION_READINESS_TRACKER.md`
- Modify: `docs/production-readiness/SCREEN_PARITY.md`
- Modify: `docs/production-readiness/TEST_EVIDENCE.md`
- Modify: `docs/production-readiness/UAT_RELEASE.md`
- Modify: `docs/production-readiness/MIGRATION_DEPLOYMENT.md`
- Modify: `docs/production-readiness/VISUAL_REVIEW.md`

- [ ] **Step 1: Run the complete local evidence bundle**

```bash
rtk pnpm install --frozen-lockfile
rtk pnpm verify
TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:integration
rtk pnpm test:coverage
TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test rtk pnpm test:e2e:isolated
rtk pnpm audit --prod
rtk pnpm migration-drill
```

Expected: every command exits 0; zero required skips; all committed snapshots pass; thresholds meet the release contract; migration and restore evidence is current.

- [ ] **Step 2: Confirm GitHub checks on the exact SHA**

Run: `rtk gh run list --branch main --limit 10`

Expected: CI and E2E succeed on the same `main` SHA. Do not use evidence from an older commit.

- [ ] **Step 3: Independent visual and functional review**

An independent reviewer must:

- inspect the classification of all 49 captures and all 39 active Stitch comparisons;
- sample every canonical route at desktop, tablet, and mobile;
- reproduce the Brand Kit administration journey;
- inspect accessibility and UAT operator evidence;
- review migrations, authorization, coverage, and external-service evidence;
- record reviewer name, date, SHA, result, and unresolved risks.

- [ ] **Step 4: Advance statuses truthfully**

Move a row to `Verified` only when that row’s required proof is present and independently reviewed. Set the shared verdict to `READY` only when every P0/P1 and final release gate is `Verified` or explicitly approved with owner/date/risk.

- [ ] **Step 5: Commit the independent evidence**

```bash
rtk git add PRODUCTION_READINESS_TRACKER.md docs/production-readiness
rtk git commit -m "docs(release): record independent production sign-off"
rtk git push origin main
```

- [ ] **Step 6: Verify deployment and health**

Run:

```bash
rtk gh run list --branch main --limit 5
rtk curl -fsSL https://planner.laratik.com/api/health
```

Expected: deploy succeeds; production health returns `ok: true`, `db: up`, `schema: ready`, and the exact signed-off SHA.

- [ ] **Step 7: Observe the production release**

Monitor application/Sentry logs, health, authentication, SMTP, storage downloads, and database metrics for one full business week. Any P0/P1 incident reopens the affected tracker row and blocks the final stable-release declaration.

---

## Final completion checklist

- [ ] All 49 Stitch PNG/HTML pairs are mapped, classified, and reviewed.
- [ ] All 39 active canonical/responsive/supporting captures match or have an approved deviation; all 10 historical/superseded captures name their canonical successor.
- [ ] All 27 canonical route/surface rows exist, including Forgot Password.
- [ ] All exact-reference and responsive visual snapshots are committed and enforced with zero skips.
- [ ] Publishing Rules and Linked Resources have additive schema, authorization, CRUD, archive behavior, UI, tests, and migration evidence.
- [ ] Manager and planner administration journeys pass; viewer/client boundaries pass.
- [ ] Automated and manual WCAG 2.2 AA evidence is complete.
- [ ] The separated-account 30-step UAT and external-service checks are complete.
- [ ] Critical coverage is at least 95/90 and application-service coverage is at least 85/80.
- [ ] CI, E2E, audit, migration drill, build, Docker smoke, and production health are green on one SHA.
- [ ] Tracker, parity, issues, UAT, README, and testing docs contain no contradictory status or counts.
- [ ] Targeted architectural debt is closed with typed, tested components and no visual regression.
- [ ] An independent reviewer assigns `Verified` and records SHA/date/risk.
- [ ] Production serves the signed-off SHA and completes the observation window without a P0/P1 incident.
