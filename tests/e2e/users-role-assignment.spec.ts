/**
 * Regression: assigning workspace roles from the GLOBAL user screen
 * (/app/users) silently did nothing, while the same flow worked on the
 * workspace Team page.
 *
 * Two independent causes, both of which had to be fixed for a click to land:
 *
 *  1. DUPLICATE DOM IDS. `/app/users` mounts `WorkspaceRoleMatrix` three
 *     times — the "Send invitation" tab, the "Add directly" tab, and the
 *     edit drawer. The checkbox id was built from the workspace id and the
 *     role only, so all three emitted the same id for the same
 *     (workspace, role). `<label htmlFor>` resolves to the first match in
 *     tree order, so every click on a drawer chip toggled the invite form's
 *     hidden checkbox and left the drawer untouched. The Team page mounts
 *     only the drawer, so no other element claimed the id — which is why
 *     the bug looked screen-specific rather than component-specific.
 *
 *  2. STICKY CHROME INSIDE THE SCROLL CONTAINER. The drawer made
 *     `DialogContent` the scroll container and marked its header/footer
 *     `sticky`, so those bands overlaid the role matrix. At a 720px
 *     viewport the sticky footer occupied y=648–720 while the first
 *     workspace's chips sat at y=640–670: `elementFromPoint` at the chip
 *     centre returned the FOOTER, so the click was swallowed by chrome.
 *
 * ISOLATION: every test seeds its OWN agency (unique slug) with its own
 * pair of members. Role assignment mutates a shared row, so two workers
 * pointing at the default `test-agency` fixture would race and produce
 * intermittently wrong assertions.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { devSeed, setAuthCookie, applySeededAgencyContext } from "./_helpers";

/**
 * Split `member-edit-chip-<workspaceId>-<role>`.
 *
 * The role is taken from the RIGHT because four of the seven role slugs
 * contain underscores (`content_planner`, `internal_reviewer`,
 * `client_reviewer`, …), so a `[^_]+` tail cannot match them. Role slugs
 * have no hyphen and a workspace id has no underscore, making a split on
 * the last hyphen unambiguous.
 */
function parseChipTestId(testId: string): { workspaceId: string; role: string } {
  const match = /^member-edit-chip-(.+)-([a-z][a-z_]*)$/.exec(testId);
  const workspaceId = match?.[1];
  const role = match?.[2];
  if (!workspaceId || !role) throw new Error(`unparseable chip test id: ${testId}`);
  return { workspaceId, role };
}

/** A per-test world: its own agency, admin, subject member and workspace. */
type Ctx = { subjectEmail: string };

/**
 * Seeds a private agency with two members and signs in as the first.
 *
 * Two members are required, not optional: `updateMemberRolesAction`
 * deliberately refuses self-edits ("You cannot edit your own role
 * assignments."). A single-member agency would make every save in this file
 * a no-op and the persistence assertions vacuous.
 */
async function bootstrapIsolated(page: Page, slug: string): Promise<Ctx> {
  const adminEmail = `e2e-role-admin-${slug}@laratik.local`;
  const subjectEmail = `e2e-role-subject-${slug}@laratik.local`;
  const agency = {
    agencyName: `Role Agency ${slug}`,
    agencySlug: slug,
    workspaceName: `Workspace ${slug}`,
    workspaceSlug: "acme",
  };

  const seeded = await devSeed(page.request, { ...agency, email: adminEmail, agencyAdmin: true });
  // Second call with the SAME agency slug: idempotent by slug, so this adds
  // the subject member to that agency instead of creating another one.
  await devSeed(page.request, { ...agency, email: subjectEmail, agencyAdmin: false });

  await setAuthCookie(page, page.request, { email: adminEmail, role: "agency_admin" });
  await applySeededAgencyContext(page, seeded);
  return { subjectEmail };
}

/** Opens the edit drawer for the seeded SUBJECT member (never yourself). */
async function openSubjectDrawer(page: Page, subjectEmail: string) {
  const row = page.locator('[data-testid^="users-member-row-"]').filter({ hasText: subjectEmail });
  await expect(row.first()).toBeVisible();
  const memberId = ((await row.first().getAttribute("data-testid")) ?? "").replace(
    "users-member-row-",
    "",
  );
  expect(memberId, "the subject row should carry a member id").not.toBe("");
  await page.locator(`[data-testid="users-member-edit-${memberId}"]`).click();
  const drawer = page.locator('[data-testid="member-edit-drawer"]');
  await expect(drawer).toBeVisible();
  return { drawer, memberId };
}

/** The drawer's serialised `workspaceRoles` payload. */
const drawerPayload = (drawer: Locator) =>
  drawer.evaluate((d) => {
    const matrix = d.querySelector('[data-testid="member-edit-role-matrix"]');
    return (
      matrix?.querySelector<HTMLInputElement>('input[name="workspaceRoles"]')?.value ?? "missing"
    );
  });

const invitePayload = (page: Page) =>
  page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="send-invite-role-matrix"] input[name="workspaceRoles"]',
    );
    return input?.value ?? "missing";
  });

/** Opens /app/users, isolated, with the subject drawer open. */
async function openUsersWithSubjectDrawer(page: Page, slug: string) {
  const { subjectEmail } = await bootstrapIsolated(page, slug);
  await page.goto("/app/users");
  await page.waitForLoadState("networkidle");
  const opened = await openSubjectDrawer(page, subjectEmail);
  return { ...opened, subjectEmail };
}

const uniqueSlug = (testInfo: { workerIndex: number; repeatEachIndex: number }, tag: string) =>
  `${tag}-w${testInfo.workerIndex}-r${testInfo.repeatEachIndex}`;

test.describe("role assignment on the global user screen", () => {
  test("every role control on the page has a unique DOM id", async ({ page }, testInfo) => {
    const { drawer } = await openUsersWithSubjectDrawer(page, uniqueSlug(testInfo, "ids"));

    // /app/users mounts the matrix in the invite form AND the drawer. If the
    // ids collide, one id resolves to two nodes and the label points at the
    // wrong one.
    const collisions = await page.evaluate(() => {
      const ids = Array.from(
        document.querySelectorAll('button[role="checkbox"][id^="workspace-role"]'),
      ).map((n) => n.id);
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) dupes.add(id);
        seen.add(id);
      }
      return { total: ids.length, dupes: Array.from(dupes) };
    });

    expect(collisions.total, "the drawer should render role controls").toBeGreaterThan(0);
    expect(collisions.dupes).toEqual([]);

    const drawerIds = await drawer
      .locator('button[role="checkbox"][id^="workspace-role"]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).id));
    expect(new Set(drawerIds).size).toBe(drawerIds.length);
  });

  test("the drawer has one scroll region and no sticky chrome over it", async ({
    page,
  }, testInfo) => {
    const { drawer } = await openUsersWithSubjectDrawer(page, uniqueSlug(testInfo, "geo"));

    const geometry = await drawer.evaluate((d) => {
      // `d` IS the DialogContent — it is both the flex column that must not
      // scroll and the parent the sticky blocks used to live inside.
      const header = d.querySelector('[data-slot="dialog-header"]') as HTMLElement | null;
      const footer = d.querySelector('[data-slot="dialog-footer"]') as HTMLElement | null;
      return {
        contentOverflowY: getComputedStyle(d).overflowY,
        contentDisplay: getComputedStyle(d).display,
        headerPosition: header ? getComputedStyle(header).position : null,
        footerPosition: footer ? getComputedStyle(footer).position : null,
      };
    });

    // The regression shape: one scroll container, and chrome that is a flex
    // sibling of it rather than a sticky overlay inside it.
    expect(geometry.contentDisplay).toBe("flex");
    expect(geometry.contentOverflowY).toBe("hidden");
    expect(geometry.headerPosition).not.toBe("sticky");
    expect(geometry.footerPosition).not.toBe("sticky");

    // The real user symptom: whatever sits under a role chip's centre must
    // be that chip, not the footer's Cancel / Save row.
    const hit = await drawer.evaluate((d) => {
      const chip = d.querySelector<HTMLElement>('[data-testid^="member-edit-chip-"]');
      if (!chip) return "no-chip";
      chip.scrollIntoView({ block: "center" });
      const r = chip.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!el) return "no-element";
      return `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 24)}`;
    });
    expect(hit).not.toMatch(/^(div|span|button):\s*(cancel|save changes)/i);
    expect(hit).not.toBe("no-chip");
  });

  test("clicking a role chip updates the drawer's own payload", async ({ page }, testInfo) => {
    const { drawer } = await openUsersWithSubjectDrawer(page, uniqueSlug(testInfo, "click"));

    const before = await drawerPayload(drawer);
    const chip = drawer.locator('[data-testid^="member-edit-chip-"]').first();
    const { workspaceId, role } = parseChipTestId((await chip.getAttribute("data-testid")) ?? "");

    await chip.click();
    await page.waitForTimeout(250);

    expect(await drawerPayload(drawer)).not.toBe(before);
    const parsed = JSON.parse((await drawerPayload(drawer)) || "[]") as {
      workspaceId: string;
      roles: string[];
    }[];
    expect(parsed.find((e) => e.workspaceId === workspaceId)?.roles ?? []).toContain(role);
  });

  test("a drawer chip click leaves the invitation form's matrix untouched", async ({
    page,
  }, testInfo) => {
    // This is the exact cross-talk the duplicate ids caused.
    const { drawer } = await openUsersWithSubjectDrawer(page, uniqueSlug(testInfo, "crosstalk"));

    const before = await invitePayload(page);
    await drawer.locator('[data-testid^="member-edit-chip-"]').first().click();
    await page.waitForTimeout(250);
    expect(await invitePayload(page)).toBe(before);
  });

  test("saving a drawer role selection persists it", async ({ page }, testInfo) => {
    const { drawer, memberId } = await openUsersWithSubjectDrawer(
      page,
      uniqueSlug(testInfo, "save"),
    );

    const chip = drawer.locator('[data-testid^="member-edit-chip-"]').first();
    const { workspaceId, role } = parseChipTestId((await chip.getAttribute("data-testid")) ?? "");
    await chip.click();
    await page.waitForTimeout(200);

    const payloadBefore = await drawerPayload(drawer);

    await page.locator('[data-testid="member-edit-save"]').click();

    // Surface the action's own error copy on failure — a refusal keeps the
    // drawer open, and "still open" alone is a useless diagnosis.
    await expect
      .poll(
        async () =>
          (await drawer.locator('[role="alert"]').allInnerTexts()).join(" | ") || "no-alert",
        { timeout: 20_000 },
      )
      .toBe("no-alert")
      .catch(async () => {
        const alerts = await drawer.locator('[role="alert"]').allInnerTexts();
        throw new Error(`drawer reported: ${alerts.join(" | ")}`);
      });
    await expect(drawer).toBeHidden({ timeout: 20_000 });

    // Re-open from a fresh render: the server must report the saved role,
    // not merely keep optimistic local state.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.locator(`[data-testid="users-member-edit-${memberId}"]`).click();
    const reopened = page.locator('[data-testid="member-edit-drawer"]');
    await expect(reopened).toBeVisible();

    const payloadAfter = await drawerPayload(reopened);

    // Compare as a SET, not as a string. A workspace holds any number of
    // roles (`workspace_membership_role` is keyed on
    // (membership_id, role)), so order carries no meaning — the local
    // selection preserves click order while the reloaded one comes back in
    // DB order. `["viewer","workspace_manager"]` and
    // `["workspace_manager","viewer"]` are the same assignment.
    const normalise = (raw: string) =>
      (JSON.parse(raw || "[]") as { workspaceId: string; roles: string[] }[])
        .map((e) => `${e.workspaceId}=${[...new Set(e.roles)].sort().join("+")}`)
        .sort();
    expect(normalise(payloadAfter)).toEqual(normalise(payloadBefore));

    const parsed = JSON.parse(payloadAfter || "[]") as {
      workspaceId: string;
      roles: string[];
    }[];
    expect(parsed.find((e) => e.workspaceId === workspaceId)?.roles ?? []).toContain(role);
  });

  test("the workspace filter is hidden below the threshold", async ({ page }, testInfo) => {
    // A freshly seeded agency holds exactly one workspace, so the filter is
    // correctly absent. This pins the threshold contract at the low end;
    // the high end is exercised manually against a 35-workspace agency.
    const { drawer } = await openUsersWithSubjectDrawer(page, uniqueSlug(testInfo, "filter"));

    await expect(drawer.locator('[data-testid^="member-edit-workspace-"]')).toHaveCount(1);
    await expect(drawer.locator('[data-testid="member-edit-workspace-filter"]')).toHaveCount(0);
  });

  test("a chip click raises no React error or hydration warning", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const { drawer } = await openUsersWithSubjectDrawer(page, uniqueSlug(testInfo, "errors"));
    await drawer.locator('[data-testid^="member-edit-chip-"]').first().click();
    await page.waitForTimeout(300);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
