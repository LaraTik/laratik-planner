import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { bootstrapRoleSession } from "./_helpers";

async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter((item) =>
    ["critical", "serious"].includes(item.impact ?? ""),
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("Workspace AI Assistant", () => {
  test("agency admin skill governance is localized and usable at mobile width", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await bootstrapRoleSession(page, "agency_admin", "assistant-skill-governance", {
      locale: "en",
      email: "e2e-assistant-skill-governance@laratik.local",
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/app/agency-settings/ai/skills");
    await expect(page.getByRole("heading", { name: "Assistant skills", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create or revise a skill" })).toBeVisible();
    await expectNoSeriousViolations(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await bootstrapRoleSession(page, "agency_admin", "assistant-skill-governance", {
      locale: "ar",
      email: "e2e-assistant-skill-governance-ar@laratik.local",
    });
    await page.goto("/app/agency-settings/ai/skills");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "مهارات المساعد", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "إنشاء مهارة أو مراجعتها" })).toBeVisible();
    await expectNoSeriousViolations(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test("agency admins can permit a model and members retain an allowed preference", async ({
    page,
  }) => {
    // This scenario compiles both the agency AI settings page and the workspace
    // assistant route on a cold dev server before checking the persisted choice.
    test.setTimeout(90_000);
    const workspace = await bootstrapRoleSession(page, "agency_admin", "assistant-model-access", {
      locale: "en",
    });
    await page.goto("/app/agency-settings/ai");
    const permittedFlash = page.getByTestId("ai-permitted-model-MiniMax-M3.1-Flash");
    await expect(permittedFlash).toBeVisible();
    await permittedFlash.click();
    await page.getByRole("button", { name: "Save AI settings" }).click();
    await expect(page.getByTestId("ai-settings-saved")).toBeVisible();

    await page.goto(`/app/a/test-agency/w/${workspace.workspaceSlug}/ai-assistant`);
    const modelSelect = page.getByRole("combobox", { name: "Model" });
    await expect(modelSelect.locator("option")).toHaveCount(2);
    await modelSelect.selectOption("MiniMax-M3.1-Flash");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveValue("MiniMax-M3.1-Flash");
  });

  test("manages workspace knowledge and preserves a visible revision history", async ({ page }) => {
    const workspace = await bootstrapRoleSession(page, "workspace_manager", "assistant-knowledge", {
      locale: "en",
    });
    await page.goto(`/app/a/test-agency/w/${workspace.workspaceSlug}/ai-assistant`);
    await page.getByRole("button", { name: "Tools and knowledge" }).click();
    const library = page.getByTestId("assistant-knowledge-library");
    await expect(library.getByRole("heading", { name: "Workspace knowledge" })).toBeVisible();
    await library.getByRole("button", { name: "Add knowledge" }).click();
    await library.getByLabel("Name").fill("Approved brand voice");
    await library.getByLabel("Details").fill("Use clear, practical language.");
    await library.getByLabel("Tags").fill("brand, voice");
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/ai/workspace-assistant/knowledge") &&
        response.request().method() === "POST",
    );
    await library.getByRole("button", { name: "Save" }).click();
    expect((await createResponse).status()).toBe(201);
    const entry = library.getByText("Approved brand voice", { exact: true });
    await expect(entry).toBeVisible();

    await library.getByRole("button", { name: "Edit" }).click();
    await library.getByLabel("Details").fill("Use concise, practical language.");
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/ai/workspace-assistant/knowledge/") &&
        response.request().method() === "PATCH",
    );
    await library.getByRole("button", { name: "Save" }).click();
    expect((await updateResponse).status()).toBe(200);
    await expect(library.getByText("Use concise, practical language.")).toBeVisible();
    await library.getByRole("button", { name: "History" }).click();
    await expect(library.getByText("Use clear, practical language.")).toBeVisible();
  });

  test("English prompt library supports private prompt creation and mobile widths", async ({
    page,
  }) => {
    const workspace = await bootstrapRoleSession(page, "workspace_manager", "assistant-en", {
      locale: "en",
    });
    const promptListRequestTimes: number[] = [];
    await page.route("**/api/ai/workspace-assistant/prompts**", async (route) => {
      if (route.request().method() === "GET") promptListRequestTimes.push(Date.now());
      await route.continue();
    });
    await page.goto(`/app/a/test-agency/w/${workspace.workspaceSlug}/ai-assistant`);
    await expect(page.getByRole("combobox", { name: "Response language" })).toHaveValue("ar");
    await expect(page.getByTestId("assistant-dashboard-mode")).toHaveValue("ask");
    await expect(page.getByTestId("assistant-dashboard-mode").getByRole("option")).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "Ready-to-use prompt library" })).toBeVisible();
    expect(promptListRequestTimes.length).toBeGreaterThan(0);
    const toolsClickStartedAt = Date.now();
    await page.getByRole("button", { name: "Tools and knowledge" }).click();
    await expect(page.getByRole("heading", { name: "Prompt library" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Monthly plan summary" })).toBeVisible();
    expect(promptListRequestTimes.every((requestedAt) => requestedAt < toolsClickStartedAt)).toBe(
      true,
    );
    await expectNoSeriousViolations(page);

    await page.getByRole("button", { name: "Create a prompt" }).click();
    await page.getByLabel("Name").fill("Monthly team review");
    await page.getByLabel("Purpose").fill("Align the team on this month's plan");
    await page.getByLabel("Goal").fill("Review {{plan_month}} and identify practical follow-up.");
    await page
      .getByLabel("Instructions")
      .fill("Use only the current workspace context and cite evidence.");
    await page.getByLabel("Tags, separated by commas").fill("daily, team");
    await page.getByRole("button", { name: "Add input" }).click();
    await page.getByLabel("Placeholder key").fill("plan_month");
    await page.getByLabel("Input label").fill("Plan month");
    await page.getByLabel("Input type").selectOption("month");
    await page.getByLabel("Required input").check();
    const promptResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/ai/workspace-assistant/prompts") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save prompt" }).click();
    expect((await promptResponse).status()).toBe(201);
    await expect(page.getByRole("heading", { name: "Monthly team review" })).toBeVisible();

    const createdPrompt = page
      .locator("li")
      .filter({ has: page.getByRole("heading", { name: "Monthly team review" }) });
    await createdPrompt.getByRole("button", { name: "Use prompt" }).click();
    await expect(page.getByPlaceholder("Ask for an analysis, suggestion, or plan…")).toHaveValue(
      "Review {{plan_month}} and identify practical follow-up.",
    );
    const monthInput = page
      .getByTestId("assistant-dashboard-prompt-parameters")
      .getByLabel("Plan month");
    await expect(monthInput).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: "Ask assistant" })).toBeDisabled();
    await monthInput.fill("2026-11");
    await expect(page.getByRole("button", { name: "Ask assistant" })).toBeEnabled();

    let submittedRequest: Record<string, unknown> | null = null;
    await page.route("**/api/ai/workspace-assistant", async (route) => {
      if (route.request().method() === "POST") {
        submittedRequest = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"provider_unavailable"}',
        });
      } else {
        await route.continue();
      }
    });
    await page.getByRole("button", { name: "Ask assistant" }).click();
    await expect(
      page.getByText("The assistant could not complete this request", { exact: false }),
    ).toBeVisible();
    expect(submittedRequest).toMatchObject({
      promptParameters: { plan_month: "2026-11" },
      message: "Review {{plan_month}} and identify practical follow-up.",
      responseLocale: "ar",
    });

    for (const width of [375, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("combobox", { name: "Response language" })).toBeVisible();
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflows, `Assistant page overflows at ${width}px`).toBe(false);
    }
  });

  test("resolves an ambiguous content title before sending the assistant request", async ({
    page,
  }) => {
    const workspace = await bootstrapRoleSession(page, "workspace_manager", "assistant-reference", {
      locale: "en",
    });
    await page.goto(`/app/a/test-agency/w/${workspace.workspaceSlug}/ai-assistant`);
    const itemId = "d5d998ef-5fef-497a-8a7c-3c6a0f36f025";
    const requestBodies: Record<string, unknown>[] = [];
    await page.route("**/api/ai/workspace-assistant", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      requestBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      if (requestBodies.length === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            resolution: {
              status: "ambiguous",
              candidates: [
                {
                  id: itemId,
                  title: "November launch",
                  format: "post",
                  status: "draft",
                  plannedPublishAt: "2026-11-05T10:00:00.000Z",
                  revision: 4,
                },
              ],
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversationId: "4a6c2d93-bb23-44e9-b8f7-62cc337b28f5",
          answer: {
            answer: "The selected draft has a clear launch objective.",
            findings: [],
            recommendations: [],
            limitations: [],
          },
          evidence: [],
          deterministicFindings: [],
          referencedItem: { id: itemId, title: "November launch", revision: 4 },
          proposals: [],
        }),
      });
    });

    await page.getByTestId("assistant-dashboard-content-reference").fill("November launch");
    await page
      .getByPlaceholder("Ask for an analysis, suggestion, or plan…")
      .fill("Review this item.");
    await page.getByRole("button", { name: "Ask assistant" }).click();
    await expect(page.getByText("Several items match. Choose the one to include")).toBeVisible();
    await page.getByRole("button", { name: "Use this item" }).click();
    await expect(page.getByTestId("assistant-dashboard-content-reference")).toHaveValue(
      "November launch",
    );
    await page.getByRole("button", { name: "Ask assistant" }).click();
    await expect(page.getByText("The selected draft has a clear launch objective.")).toBeVisible();
    await expect(page.getByText("Reviewed item: November launch · revision 4")).toBeVisible();
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1]).toMatchObject({ contentItemReference: itemId });
  });

  test("renders streamed assistant activity and a validated result", async ({ page }) => {
    const workspace = await bootstrapRoleSession(page, "workspace_manager", "assistant-stream", {
      locale: "en",
    });
    await page.goto(`/app/a/test-agency/w/${workspace.workspaceSlug}/ai-assistant`);
    const result = {
      conversationId: "4a6c2d93-bb23-44e9-b8f7-62cc337b28f5",
      answer: {
        answer: "The plan is ready for review.",
        findings: [],
        recommendations: [],
        limitations: [],
      },
      evidence: [],
      deterministicFindings: [],
      referencedItem: null,
      proposals: [
        {
          id: "46e10235-e87b-490f-9a8b-053d70e2da03",
          contentItemId: "60495169-9cf5-4817-973e-5a47dbe13899",
          field: "brief",
          title: "Make the brief more specific",
          beforeValue: "Introduce the offer.",
          afterValue: "Introduce the November offer to returning customers.",
          evidenceIds: [],
          status: "proposed",
          expiresAt: "2026-11-24T12:00:00.000Z",
        },
        {
          id: "98391364-6f93-45bc-ae71-5bf6dc32f906",
          contentItemId: "60495169-9cf5-4817-973e-5a47dbe13899",
          field: "title",
          title: "Clarify the title",
          beforeValue: "November offer",
          afterValue: "November offer for returning customers",
          evidenceIds: [],
          status: "proposed",
          expiresAt: "2026-11-24T12:00:00.000Z",
        },
      ],
    };
    await page.route(`**/api/ai/workspace-assistant/${result.conversationId}*`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
      } else {
        await route.continue();
      }
    });
    await page.route("**/api/ai/workspace-assistant", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const events = [
        ["context_resolved", {}],
        ["skills_selected", { skillIds: ["calendar_review"] }],
        ["plan_analyzed", { itemCount: 8, findingCount: 1 }],
        ["provider_started", { model: "MiniMax-M3" }],
        ["response_delta", { length: 14 }],
        ["response_validated", { findingCount: 1, recommendationCount: 1 }],
        ["complete", { result }],
      ];
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: events
          .map(([name, value]) => `event: ${name}\ndata: ${JSON.stringify(value)}\n\n`)
          .join(""),
      });
    });
    await page.route("**/api/ai/workspace-assistant/proposals/*", async (route) => {
      expect(route.request().method()).toBe("POST");
      const requestPath = new URL(route.request().url()).pathname;
      expect(route.request().postDataJSON()).toEqual(
        requestPath.endsWith("/batch")
          ? {
              workspaceSlug: workspace.workspaceSlug,
              proposalIds: [
                "46e10235-e87b-490f-9a8b-053d70e2da03",
                "98391364-6f93-45bc-ae71-5bf6dc32f906",
              ],
            }
          : { workspaceSlug: workspace.workspaceSlug, decision: "apply" },
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "applied",
          contentItemId: "60495169-9cf5-4817-973e-5a47dbe13899",
        }),
      });
    });
    await page.getByTestId("assistant-dashboard-mode").selectOption("plan");
    await page
      .getByPlaceholder("Ask for an analysis, suggestion, or plan…")
      .fill("Review my plan.");
    await expect(page.getByRole("combobox", { name: "Response language" })).toHaveValue("ar");
    await page.getByRole("button", { name: "Ask assistant" }).click();
    await expect(page.getByText("The plan is ready for review.")).toBeVisible();
    await page.getByText("Assistant activity", { exact: true }).click();
    await expect(page.getByText("Workspace context verified")).toBeVisible();
    await expect(page.getByText("Receiving response text")).toBeVisible();
    await expectNoSeriousViolations(page);
    await expect(page.getByText("Introduce the offer.")).toBeVisible();
    await expect(
      page.getByText("Introduce the November offer to returning customers."),
    ).toBeVisible();
    await page.setViewportSize({ width: 375, height: 900 });
    const proposalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(proposalOverflow, "Selected proposal controls overflow on mobile").toBe(false);
    await expect(page.getByRole("button", { name: "Apply this change" })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Apply this change" }).nth(0)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Apply this change" }).nth(1)).toBeDisabled();
    await page.getByTestId("assistant-sticky-mode").selectOption("apply");
    const proposalSelection = page.getByLabel("Select this change");
    await proposalSelection.nth(0).click();
    await proposalSelection.nth(1).click();
    await page.getByRole("button", { name: "Apply selected changes (2)" }).click();
    await expect(page.getByRole("status").getByText("Applied")).toHaveCount(2);
  });

  test("Arabic workspace assistant uses RTL and Arabic prompt controls", async ({ page }) => {
    const workspace = await bootstrapRoleSession(page, "workspace_manager", "assistant-ar", {
      locale: "ar",
    });
    await page.goto(`/app/a/test-agency/w/${workspace.workspaceSlug}/ai-assistant`);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByRole("button", { name: "الأدوات والمعرفة" }).click();
    await expect(page.getByRole("heading", { name: "مكتبة المطالبات" })).toBeVisible();
    await expectNoSeriousViolations(page);

    await page.getByRole("button", { name: "إنشاء مطالبة" }).click();
    const name = page.getByLabel("الاسم");
    await name.fill("مراجعة الخطة الشهرية");
    await expect(name).toHaveAttribute("dir", "rtl");
    await page.setViewportSize({ width: 375, height: 900 });
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows, "Arabic assistant page overflows at 375px").toBe(false);
  });

  test("Arabic interface stays RTL when a conversation explicitly requests English", async ({
    page,
  }) => {
    const workspace = await bootstrapRoleSession(page, "workspace_manager", "assistant-ar-en", {
      locale: "ar",
    });
    const conversationId = "e9cc0b66-93c4-4262-aa5f-e3d8b01b43b8";
    let assistantRequest: Record<string, unknown> | null = null;
    await page.route("**/api/ai/workspace-assistant", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      assistantRequest = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversationId,
          answer: {
            answer: "Instagram reach is ready for review.",
            findings: [],
            recommendations: [],
            limitations: [],
          },
          evidence: [],
          deterministicFindings: [],
          proposals: [],
        }),
      });
    });

    await page.goto(`/app/a/test-agency/w/${workspace.workspaceSlug}/ai-assistant`);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const responseLanguage = page.getByRole("combobox", { name: "لغة الرد" });
    await expect(responseLanguage).toHaveValue("ar");
    await responseLanguage.selectOption("en");
    await page.getByPlaceholder("اطلب تحليلًا أو اقتراحًا أو خطة…").fill("Review Instagram reach.");
    await page.getByRole("button", { name: "اسأل المساعد" }).click();
    await expect(page.getByText("Instagram reach is ready for review.")).toBeVisible();
    expect(assistantRequest).toMatchObject({ responseLocale: "en" });
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("response language is saved per conversation and stays independent of interface locale", async ({
    page,
  }) => {
    const workspace = await bootstrapRoleSession(page, "workspace_manager", "assistant-language", {
      locale: "en",
    });
    const conversationId = "71b9f5b1-f38a-4aa0-94e3-8643be998001";
    let languageUpdate: Record<string, unknown> | null = null;
    let assistantRequest: Record<string, unknown> | null = null;
    await page.route("**/api/ai/workspace-assistant**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === "GET" && url.pathname === "/api/ai/workspace-assistant") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            conversations: [
              {
                id: conversationId,
                title: "Arabic default",
                mode: "ask",
                responseLocale: "ar",
                pinnedAt: null,
                updatedAt: "2026-10-25T10:00:00.000Z",
              },
            ],
          }),
        });
        return;
      }
      if (request.method() === "GET" && url.pathname.endsWith(`/${conversationId}`)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            conversation: {
              id: conversationId,
              mode: "ask",
              responseLocale: "ar",
              messages: [],
              proposals: [],
            },
          }),
        });
        return;
      }
      if (request.method() === "PATCH" && url.pathname.endsWith(`/${conversationId}`)) {
        languageUpdate = request.postDataJSON() as Record<string, unknown>;
        await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
        return;
      }
      if (request.method() === "POST" && url.pathname === "/api/ai/workspace-assistant") {
        assistantRequest = request.postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            conversationId,
            answer: {
              answer: "This response remains in English.",
              findings: [],
              recommendations: [],
              limitations: [],
            },
            evidence: [],
            deterministicFindings: [],
            proposals: [],
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/app/a/test-agency/w/${workspace.workspaceSlug}/ai-assistant`);
    const language = page.getByRole("combobox", { name: "Response language" });
    await expect(language).toHaveValue("ar");
    await page.getByRole("button", { name: "Arabic default" }).click();
    await expect(language).toHaveValue("ar");
    await language.selectOption("en");
    await expect.poll(() => languageUpdate).toEqual({ responseLocale: "en" });
    await page
      .getByPlaceholder("Ask for an analysis, suggestion, or plan…")
      .fill("Review this plan.");
    await page.getByRole("button", { name: "Ask assistant" }).click();
    await expect(page.getByText("This response remains in English.")).toBeVisible();
    expect(assistantRequest).toMatchObject({ conversationId, responseLocale: "en" });
  });
});
