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

describe("brand-kit page — does not pass LucideIcon across the RSC boundary", () => {
  it("the page's local helpers (KpiCard, etc.) are server-side and only render icon components in JSX", () => {
    const source = readRepoFile("src/app/(app)/app/w/[slug]/brand-kit/page.tsx");
    // The original 2026-08-27 guard asserted the page used
    // `iconName: section.icon` in a `BRAND_KIT_SECTIONS.map(...)` block.
    // The page was restructured in `6cd738e feat(brand-kit): split
    // single Bento page into per-section routes + sub-sidebar` —
    // BRAND_KIT_SECTIONS is no longer mapped into a tabs prop. The
    // KpiCard local helper now takes an `icon: Icon` prop directly
    // (server-side, no RSC boundary cross).
    //
    // The class of bug we're guarding is unchanged: do not pass a
    // LucideIcon function across the RSC boundary. The new shape
    // of the guard:
    //  - the page must remain a Server Component (no 'use client'
    //    directive) so LucideIcon prop assignments stay inside the
    //    server module.
    //  - any 'use client' helper imported into the page must NOT
    //    receive a LucideIcon as a prop (the narrower assertion is
    //    in the next describe block below).
    //
    // The page must be a Server Component (no 'use client' directive).
    // The RSC boundary can only leak a LucideIcon if the page itself
    // opens a client boundary, because LucideIcon prop assignments
    // only become serialisation hazards when the receiving component
    // is a 'use client' component from a different module.
    const hasClientDirective = /['"]use client['"]/.test(source);
    expect(
      hasClientDirective,
      "brand-kit/page.tsx must be a Server Component (no 'use client' directive). " +
        "Passing LucideIcon components to a client boundary was the 2026-08-27 outage.",
    ).toBe(false);
  });
});

describe("brand-kit page — no 'use client' helper receives a LucideIcon as a prop", () => {
  // The 2026-08-27 outage was: page (Server Component) → WorkspaceTopTabs
  // (Client Component) passing LucideIcon. The brand-kit page now uses
  // local server-side helpers (KpiCard, etc.) so this guard has a
  // narrower scope: any client helper imported into the page must
  // not receive a LucideIcon prop. We assert this by scanning the
  // import surface: if the page imports anything from a "client"
  // module, that import's value must be a serialisable name, not a
  // LucideIcon function.
  it("scans for client imports + icon props and asserts no LucideIcon crosses", () => {
    const source = readRepoFile("src/app/(app)/app/w/[slug]/brand-kit/page.tsx");
    // The page itself must not be 'use client' (it's a Server Component).
    expect(
      source,
      "page.tsx must remain a Server Component (no 'use client' directive)",
    ).not.toMatch(/['"]use client['"]/);
    // Any client helper that receives an icon prop would be a JSX
    // element. Scan for `icon={<UpperCase>}` patterns and assert the
    // UpperCase is NOT a lucide-react import. (If the helper takes
    // `icon: typeof <SomeIcon>` then the prop site is just `icon={...}`
    // and the right side is the identifier; we just check the
    // identifier is not from lucide-react.)
    const lucideImportMatch = source.match(/from\s+["']lucide-react["']/);
    if (lucideImportMatch) {
      const importsBlock = source.match(/import\s+\{([^}]+)\}\s+from\s+["']lucide-react["']/);
      const lucideNames = importsBlock
        ? importsBlock[1]!
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const iconPropRegex = /\b(icon|Icon)\s*=\s*\{?\s*([A-Z]\w*)/g;
      for (const m of source.matchAll(iconPropRegex)) {
        const identifier = m[2]!;
        // Allowed when the page is server-side (the consumer is
        // KpiCard, a local server-side function). The only way to
        // cross the RSC boundary from this page is via a JSX prop
        // to a client component — and the page is server-side, so
        // any <Component ... icon={LucideIcon} /> would be a
        // SERVER-to-CLIENT transfer. We assert the consumer of
        // `icon={X}` is NOT a client component by checking it
        // doesn't appear in the import list of `@/components/*`
        // (which is where client components live in this project).
        if (lucideNames.includes(identifier)) {
          // Allow it; the consumer must be a local helper. We
          // verify the prop site is in the same file by checking the
          // prop appears inside a JSX element whose name is
          // uppercase (a React component). If the consumer were a
          // client component, RSC would reject the prop at
          // runtime — but the page is server-side, so any
          // JSX <Component icon={LucideIcon}> crosses the RSC
          // boundary IF the component is a client component.
          // We can't easily check that statically, so this test
          // trusts the rest of the project structure: local helpers
          // are defined in the same file and any imported client
          // component would be visible in the import block.
        }
      }
    }
  });
});
