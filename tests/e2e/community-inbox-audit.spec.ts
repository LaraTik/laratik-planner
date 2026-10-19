import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { bootstrapTestSession } from "./_helpers";

for (const locale of ["en", "ar"] as const) {
  test(`Community activity and inbox work in ${locale} @a11y`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl || !/(test|ci)/i.test(new URL(databaseUrl).pathname)) {
      throw new Error("Community fixtures require a disposable TEST_DATABASE_URL");
    }
    const slug = `community-audit-${locale}-${testInfo.project.name}`;
    const seeded = await bootstrapTestSession(page, {
      agencySlug: slug,
      workspaceSlug: slug,
      email: `${slug}@laratik.local`,
      locale,
      agencyAdmin: true,
    });
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    let conversationId: string;
    try {
      const plan = await client.query<{ id: string }>(
        `INSERT INTO platform_plan_template (slug,name,default_limits)
         VALUES ($1,'Community audit fixture','{"enabled_modules":["community_inbox"]}')
         ON CONFLICT (slug) WHERE archived_at IS NULL DO UPDATE SET name=excluded.name RETURNING id`,
        [slug],
      );
      await client.query(
        `INSERT INTO agency_entitlement (agency_id,plan_template_id)
        VALUES ($1,$2) ON CONFLICT (agency_id) DO UPDATE SET plan_template_id=excluded.plan_template_id, overrides=NULL`,
        [seeded.agencyId, plan.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO agency_module_setting (agency_id,module,enabled) VALUES ($1,'community_inbox',true)
        ON CONFLICT (agency_id,module) DO UPDATE SET enabled=true`,
        [seeded.agencyId],
      );
      await client.query(
        `INSERT INTO workspace_settings (workspace_id,community_inbox_enabled) VALUES ($1,true) ON CONFLICT (workspace_id) DO UPDATE SET community_inbox_enabled=true`,
        [seeded.workspaceId],
      );
      const conversation = await client.query<{ id: string }>(
        `INSERT INTO community_conversation
        (workspace_id,channel_type,external_conversation_id,state,last_message_at) VALUES ($1,'facebook',$2,'open',now())
        ON CONFLICT (workspace_id,provider,external_conversation_id) DO UPDATE SET state='open' RETURNING id`,
        [seeded.workspaceId, slug],
      );
      conversationId = conversation.rows[0]!.id;
      await client.query(
        `INSERT INTO community_message (workspace_id,conversation_id,external_message_id,direction,visibility,body,posted_at)
        VALUES ($1,$2,$3,'incoming','public','Synthetic opening hours question',now()) ON CONFLICT DO NOTHING`,
        [seeded.workspaceId, conversationId, slug],
      );
      await client.query(
        `INSERT INTO community_event (workspace_id,kind,detail) VALUES ($1,'community_comments_sync_completed','community_comments_sync_completed')`,
        [seeded.workspaceId],
      );
    } finally {
      await client.end();
    }

    const base = `/app/a/${slug}/w/${slug}/engagement`;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/activity`);
    await expect(page.getByTestId("community-activity-list")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    const overview = page.getByRole("link", {
      name: locale === "en" ? "Overview" : "نظرة عامة",
      exact: true,
    });
    await expect(overview).not.toHaveAttribute("aria-current", "page");
    for (const width of [375, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByTestId("community-activity-list")).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`activity-${locale}-${width}.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual(
      [],
    );

    await page.goto(`${base}/inbox?q=Synthetic`);
    const selected = page.locator(`a[href*="conversation=${conversationId}"]`);
    await expect(selected).toBeVisible();
    await selected.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("textbox", { name: locale === "en" ? "Write a reply…" : "اكتب ردًا…" }),
    ).toBeDisabled();
    await expect(page).toHaveURL(new RegExp(`conversation=${conversationId}`));
    await expect(
      page.getByRole("textbox", {
        name: locale === "en" ? "Search conversations" : "البحث في المحادثات",
      }),
    ).toHaveValue("Synthetic");
    for (const width of [375, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(selected).toBeVisible();
      const syncBounds = await page
        .getByRole("button", {
          name: locale === "en" ? "Sync private messages" : "مزامنة الرسائل الخاصة",
          exact: true,
        })
        .boundingBox();
      expect(syncBounds).not.toBeNull();
      expect(syncBounds!.x).toBeGreaterThanOrEqual(0);
      expect(syncBounds!.x + syncBounds!.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`inbox-${locale}-${width}.png`),
        fullPage: true,
      });
    }
    const inboxAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    expect(
      inboxAxe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
    ).toEqual([]);
    await page.goto(`${base}/comments`);
    await expect(page.locator(`a[href*="conversation=${conversationId}"]`)).toBeVisible();
    await page.goto(`${base}/inbox?filter=private`);
    await expect(
      page.getByRole("button", {
        name: locale === "en" ? "Send reply" : "إرسال الرد",
        exact: true,
      }),
    ).toBeDisabled();
  });
}
