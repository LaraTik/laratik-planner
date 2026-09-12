import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tFor } from "@/messages";

const readSrc = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("creation completion loop (UX-13)", () => {
  const actions = readSrc("src", "app", "(app)", "app", "w", "[slug]", "planning", "actions.ts");
  const planning = readSrc("src", "app", "(app)", "app", "w", "[slug]", "planning", "page.tsx");
  const detail = readSrc(
    "src",
    "app",
    "(app)",
    "app",
    "w",
    "[slug]",
    "planning",
    "[id]",
    "page.tsx",
  );

  it("takes Quick Create to the new draft with an explicit completion state", () => {
    expect(actions).toContain("redirect(`/app/w/${workspaceSlug}/planning/${id}?created=1`)");
    expect(detail).toContain("searchParams?: Promise<{ created?: string }>");
    expect(detail).toContain('const justCreated = query.created === "1"');
    expect(detail).toContain('data-testid="content-created-banner"');
    expect(detail).toContain('t("contentDetail.createdBanner.title")');
    expect(detail).toContain('t("contentDetail.createdBanner.description")');
  });

  it("explains the next stage after Batch Add and keeps the draft destination", () => {
    expect(planning).toContain('t("batchAdd.form.successNext")');
    expect(planning).toContain('data-testid="planning-batch-success-view-drafts"');
    expect(planning).toContain('t("batchAdd.form.viewDrafts")');
  });

  it("keeps completion copy present in both catalogs", () => {
    const en = tFor("en");
    const ar = tFor("ar");
    expect(en("batchAdd.form.successNext")).toContain("Planning");
    expect(ar("batchAdd.form.successNext")).toContain("التخطيط");
    expect(en("contentDetail.createdBanner.description")).toContain("Content detail");
    expect(ar("contentDetail.createdBanner.description")).toContain("تفاصيل المحتوى");
  });
});
