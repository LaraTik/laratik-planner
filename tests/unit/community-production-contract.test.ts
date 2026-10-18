import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = resolve(
  process.cwd(),
  "src/app/(app)/app/a/[agencySlug]/w/[slug]/engagement/[[...section]]/page.tsx",
);
const parityPath = resolve(process.cwd(), "docs/visual-parity/COMMUNITY_INBOX_PARITY.md");
const enCatalogPath = resolve(process.cwd(), "src/messages/en/communityInbox.json");
const arCatalogPath = resolve(process.cwd(), "src/messages/ar/communityInbox.json");

const pageSource = readFileSync(pagePath, "utf8");
const paritySource = readFileSync(parityPath, "utf8");
const enCatalog = JSON.parse(readFileSync(enCatalogPath, "utf8")) as Record<string, unknown>;
const arCatalog = JSON.parse(readFileSync(arCatalogPath, "utf8")) as Record<string, unknown>;

const SCREEN_CONTRACT = [
  ["overview", "/engagement"],
  ["inbox", "/engagement/inbox"],
  ["comments", "/engagement/comments"],
  ["reviews", "/engagement/reviews"],
  ["automations", "/engagement/automations"],
  ["playbooks", "/engagement/playbooks"],
  ["test-lab", "/engagement/test-lab"],
  ["analytics", "/engagement/analytics"],
  ["connections", "/engagement/connections"],
  ["team", "/engagement/team"],
  ["settings", "/engagement/settings"],
  ["activity", "/engagement/activity"],
  ["setup", "/engagement/setup"],
] as const;

describe("Community & Inbox production contract", () => {
  it("keeps all 13 canonical screens in the route and parity contracts", () => {
    expect(SCREEN_CONTRACT).toHaveLength(13);
    for (const [section, route] of SCREEN_CONTRACT) {
      expect(pageSource).toContain(`"${section}"`);
      expect(paritySource).toContain(`| \`${route}\``);
    }
  });

  it("keeps the EN and AR Community catalogs structurally identical and non-empty", () => {
    expect(Object.keys(enCatalog).sort()).toEqual(Object.keys(arCatalog).sort());
    for (const key of Object.keys(enCatalog)) {
      expect(typeof enCatalog[key]).toBe("string");
      expect(String(enCatalog[key]).trim().length).toBeGreaterThan(0);
      expect(typeof arCatalog[key]).toBe("string");
      expect(String(arCatalog[key]).trim().length).toBeGreaterThan(0);
    }
  });

  it("documents the fail-closed Meta and unknown-delivery boundaries", () => {
    expect(paritySource).toContain("loading/empty/error");
    const architecture = readFileSync(
      resolve(process.cwd(), "docs/architecture/community-inbox.md"),
      "utf8",
    );
    expect(architecture).toContain("pages_messaging");
    expect(architecture).toContain("unknown");
    expect(architecture).toContain("reconciliation");
  });
});
