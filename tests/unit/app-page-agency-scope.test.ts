/**
 * Regression test for the My Work page cross-tenant data leak.
 *
 * The My Work page (/app) previously fetched every content item the
 * user had a stake in across ALL agencies. That meant a user with
 * memberships in 2+ agencies would see ideas from agency B in their
 * My Work while their active agency was A, and clicking an agency-B
 * idea would either 404 (when the WorkspaceLayout re-resolved the
 * slug against the active agency) or — worse — render mixed data
 * where the workspace content was from B and the AI settings were
 * from A.
 *
 * The fix scopes the My Work query to the active agency via
 * `workspaces.agencyId = activeAgencyId`. This test pins the SQL
 * shape via a source-level guard: if a future refactor drops the
 * agency filter, this test fails in CI before the regression
 * ships.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const MY_WORK_PAGE = path.join(process.cwd(), "src/app/(app)/app/page.tsx");

describe("My Work page (src/app/(app)/app/page.tsx) — agency scope", () => {
  it("imports the agency resolver and filters contentItems by active agency", async () => {
    const source = await fs.readFile(MY_WORK_PAGE, "utf8");

    // 1. The resolver is imported.
    expect(source).toMatch(
      /import\s*\{[^}]*resolveActiveAgencyContext[^}]*\}\s*from\s*["']@\/lib\/auth\/agency-context["']/,
    );

    // 2. The active agency id is captured into a local variable
    // (e.g. `const activeAgencyId = ctx?.agencyId ?? null;`).
    expect(source).toMatch(/activeAgencyId/);

    // 3. The contentItems query joins workspaces AND filters by
    // `workspaces.agencyId = activeAgencyId`. This is the load-bearing
    // assertion — a refactor that drops the agency filter fails here.
    expect(source).toMatch(/eq\(\s*workspaces\.agencyId\s*,\s*activeAgencyId\s*\)/);
  });
});
