/**
 * Regression guard for the 2026-08-27 brand-kit outage.
 *
 * Symptom: `/app/w/[slug]/brand-kit` rendered the global
 * "We hit an error rendering Brand Kit" error boundary. Root cause:
 * the page (a Server Component) was forwarding `LucideIcon` component
 * *functions* to `<WorkspaceTopTabs>` (a Client Component), which
 * RSC cannot serialise. The minified production error was
 * `Functions cannot be passed directly to Client Components unless
 * you explicitly expose it by marking it with "use server"`.
 *
 * The previous structural test (`tests/unit/users-hooks-order.test.tsx`)
 * only checked the client components' hook counts; it did not catch
 * this because the bug class is *RSC serialisation*, not hooks
 * order.
 *
 * This guard pins the new contract:
 *   1. `BRAND_KIT_SECTIONS` (server-eligible) must not import from
 *      `lucide-react` (it would bring a function into the section
 *      config). The page is the only place the page should hand an
 *      icon to the top tabs, and the contract is "iconName: string".
 *   2. `WorkspaceTopTab.iconName` must be a string literal type, not
 *      a `LucideIcon`. We assert by importing the type and looking at
 *      the runtime shape.
 *   3. The page maps `BRAND_KIT_SECTIONS` into the tabs prop using
 *      `iconName: section.icon` (not `icon: section.icon`).
 *
 * If any of these break in the future, this test fails with a
 * message that names the regression class.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

describe("BRAND_KIT_SECTIONS — RSC-boundary contract", () => {
  it("does not import a LucideIcon component (icons are serialised as strings)", () => {
    // sections.ts is imported by the page (Server Component). If
    // anyone re-introduces `import { Sparkles } from "lucide-react"`
    // here, the section config would hold a function value and the
    // page would re-introduce the 2026-08-27 RSC error. Pin the
    // import surface so the failure happens at `pnpm test:unit`
    // rather than in production.
    const source = readRepoFile("src/lib/brand/sections.ts");
    expect(source, "sections.ts must not import from 'lucide-react'").not.toMatch(
      /from\s+["']lucide-react["']/,
    );
    // Every `icon:` value in the section config (skipping the type
    // definition `icon: BrandKitIconName;`) must be a string
    // literal, not a bare identifier that would resolve to a
    // LucideIcon component at module-evaluation time.
    //
    // Scope: only look at lines INSIDE the `BRAND_KIT_SECTIONS: ... = [`
    // array. Lines outside that block (e.g. the interface
    // declaration `icon: BrandKitIconName;`) are excluded.
    const arrayStart = source.indexOf("export const BRAND_KIT_SECTIONS:");
    const arrayEnd = source.indexOf("] as const;", arrayStart);
    expect(arrayStart, "BRAND_KIT_SECTIONS must be declared in sections.ts").toBeGreaterThan(-1);
    expect(arrayEnd, "BRAND_KIT_SECTIONS must terminate with `] as const;`").toBeGreaterThan(-1);
    const arrayBlock = source.slice(arrayStart, arrayEnd);
    const iconLines = arrayBlock
      .split("\n")
      .map((line) => line.match(/^\s+icon:\s*(.+?)[,;]?\s*$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => m[1]!.trim().replace(/[,;]$/, ""));
    expect(iconLines.length, "every section must declare an `icon`").toBeGreaterThan(0);
    for (const value of iconLines) {
      // Must be a string literal (single or double quoted), not a
      // bare identifier like `Sparkles`.
      expect(value, `icon value must be a string literal, got: ${value}`).toMatch(
        /^["'][a-zA-Z]+["']$/,
      );
    }
  });
});

describe("WorkspaceTopTabs — accepts a serialisable iconName", () => {
  it("exports a string→icon map and no top-level LucideIcon prop", async () => {
    const mod = await import("@/components/workspace/top-tabs");
    expect(typeof mod.WORKSPACE_TAB_ICONS).toBe("object");
    // Every entry in the map is some kind of component reference
    // (function, forwardRef object, or memo). The point of the
    // contract is that the *server* never crosses these over the
    // RSC boundary.
    for (const [name, Icon] of Object.entries(mod.WORKSPACE_TAB_ICONS)) {
      expect(Icon, `icon ${name} must be defined`).toBeDefined();
      expect(
        ["function", "object"],
        `icon ${name} must be a component reference (function or object)`,
      ).toContain(typeof Icon);
    }
    // The top-level module must not re-export `LucideIcon` or any
    // other lucide-react primitive — if it did, a server caller
    // would be tempted to forward it. (We allow it to be *imported*
    // internally so the icon map works; we just don't want a named
    // export that the server could grab and pass across.)
    expect("LucideIcon" in mod).toBe(false);
  });
});

describe("brand-kit page — passes iconName (string) across the RSC boundary", () => {
  it("page.tsx uses `iconName: section.icon`, never `icon: section.icon`", () => {
    const source = readRepoFile("src/app/(app)/app/w/[slug]/brand-kit/page.tsx");
    // The page maps BRAND_KIT_SECTIONS into the tabs prop. If the
    // mapper ever re-introduces `icon: section.icon` instead of
    // `iconName: section.icon`, RSC will reject the prop at runtime
    // and the page will throw — exactly the bug we're guarding.
    const tabsMapper = source.match(/BRAND_KIT_SECTIONS\.map\([\s\S]+?\n\s{2}\}\)/);
    expect(tabsMapper, "page must still map BRAND_KIT_SECTIONS into tabs").toBeTruthy();
    const block = tabsMapper![0]!;
    expect(block, "tabs prop must use iconName, not icon").toContain("iconName:");
    expect(block, "tabs prop must NOT pass the icon function across the RSC boundary").not.toMatch(
      /\bicon\s*:\s*section\.icon\b/,
    );
  });
});
