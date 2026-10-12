import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard against re-introducing per-item database fan-outs on the
 * hot read paths, and against emitting the legacy workspace URL shape.
 *
 * WHY A STATIC TEST
 *
 * A fan-out is invisible to behavioural tests: every count and every access
 * decision can be correct while the query count explodes. The query budgets
 * in `tests/integration/read-path-batching.test.ts` catch that when the
 * helper is exercised, but nothing there can tell whether the *page* still
 * loops per workspace instead of calling the batched helper.
 *
 * DELIBERATELY NARROW
 *
 * An invariant test that flags legitimate code gets deleted by the next
 * person who hits it, and then it protects nothing. So each rule below names
 * the exact call sites and the exact pattern it forbids:
 *   - no `Promise.all`/`map(async)` over a workspace list calling a
 *     per-workspace authorization helper;
 *   - no `/app/w/` literal in a NAVIGATION context.
 *
 * It deliberately does NOT flag `.map(async …)` in general, does not scan
 * comment prose, and (for the URL rule) excludes `revalidatePath`, which is
 * handled separately.
 */

const SRC = join(process.cwd(), "src");

function read(relPath: string): string {
  return readFileSync(join(SRC, relPath), "utf8");
}

describe("read-path fan-out guard", () => {
  it("no page loops a per-workspace authorization helper", () => {
    // The rule is "no LOOP", not "never call these helpers". A page scoped to
    // a single workspace legitimately calls `canWriteToWorkspace` once, and a
    // guard that flagged that would be deleted by the next person who hit it.
    // So the check looks for the helper inside a `.map(async …)` body.
    const perWorkspaceHelpers = /canWriteToWorkspace\(|hasWorkspaceRole\(|isAgencyAdmin\(/;

    // Known-bounded loop, deliberately allowed. `lib/content/service.ts` maps
    // `WORKFLOW_RULES[action].roles` — a fixed set of at most six roles —
    // against ONE workspace id. It is not a fan-out over a growing set, and
    // `getWorkspaceRoles` is `React.cache`-wrapped so the repeats collapse.
    // Recorded here with its reason so the exception is visible, not silent.
    const allowlist = new Set(["lib/content/service.ts"]);

    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1);
      if (allowlist.has(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/\.map\(\s*async/.test(line)) return;
        // The awaited call sits a few lines into the callback body.
        const body = lines.slice(i, i + 6).join("\n");
        if (perWorkspaceHelpers.test(body)) {
          offenders.push(`${rel}:${i + 1} ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it("the platform security overview does not loop the single-agency support reader", () => {
    const text = read("app/(app)/app/platform/security/actions.ts");
    expect(text).not.toMatch(/listRequestsForAgency\(/);
    expect(text).toMatch(/listRecentRequestsByAgency\(/);
  });
});

describe("canonical workspace URL guard", () => {
  /**
   * `src/lib/urls.ts` documents the legacy `/app/w/<slug>` shape as inbound
   * only: "Never link to this form". The legacy route exists so bookmarks and
   * previously-shared links keep resolving, so this rule deliberately allows
   * the one file that IS the redirector.
   *
   * SCOPE: this currently guards the surfaces converted so far — the
   * workspace sub-pages whose `agencySlug` was already in scope. It is NOT
   * yet a whole-tree rule; the remaining components need `agencySlug` threaded
   * as a required prop, which is tracked separately. Widening it before that
   * work lands would just encode the remaining work as a permanent failure.
   */
  const CONVERTED = [
    "app/(app)/app/a/[agencySlug]/w/[slug]/activity/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/analytics/social/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/board/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/brand-kit/activity/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/brand-kit/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/calendar/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/client/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/design-queue/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/media/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/publish-package-form.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/planning/batch/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/planning/edit/[id]/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/planning/monthly/actions.ts",
    "app/(app)/app/a/[agencySlug]/w/[slug]/planning/monthly/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/planning/new/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/planning/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/research/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/settings/_components/approvals-form.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/settings/_components/defaults-form.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/settings/_components/settings-health.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/settings/approvals/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/settings/defaults/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/settings/lead-times/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/settings/lifecycle/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/settings/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/settings/trends/page.tsx",
    "app/(app)/app/a/[agencySlug]/w/[slug]/team/page.tsx",
    "components/app-shell/sidebar.tsx",
  ];

  it("converted surfaces never navigate to the legacy shape", () => {
    const offenders: string[] = [];
    for (const rel of CONVERTED) {
      const abs = join(SRC, rel);
      // Entries are a mix of single files and directories.
      const files = /\.tsx?$/.test(abs) ? [abs] : walk(abs);
      for (const file of files) {
        if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
        const name = file.slice(SRC.length + 1);
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          const trimmed = line.trimStart();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          if (line.includes("revalidatePath")) return;
          const isNavigation =
            /redirect\(/.test(line) || /href=/.test(line) || /getRowHref/.test(line);
          if (isNavigation && /\/app\/w\//.test(line)) {
            offenders.push(`${name}:${i + 1} ${line.trim()}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("cache-invalidation guard", () => {
  /**
   * `revalidatePath('/app/w/…')` was removed from 27 files.
   *
   * Those calls were no-ops for two independent reasons, and it is worth
   * recording both because either one alone would not justify deletion:
   *
   *   1. **Wrong path.** The app serves `/app/a/<agencySlug>/w/<slug>/…`;
   *      `/app/w/[slug]/…` is the inbound-only legacy catch-all. A
   *      `revalidatePath` naming a path the app does not serve cannot
   *      invalidate anything.
   *   2. **Nothing cached to invalidate.** No route under `src/app` exports
   *      `revalidate`, and `next.config.ts` sets no `staleTimes`, so these
   *      pages render dynamically on every request. `revalidatePath` exists
   *      to purge the Full Route Cache (static) and the Router Cache
   *      (`staleTimes.dynamic` defaults to 0, so dynamic routes are never
   *      reused). Neither holds here.
   *
   * The second test below re-asserts premise (2), because that is the one
   * that would stop being true first. If someone ever makes a workspace
   * route cacheable, this file should make them re-add invalidation rather
   * than leave them silently unprotected.
   */
  it("no source file revalidates the legacy workspace path", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      if (text.includes("revalidatePath(`/app/w/")) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no route exports a revalidate window, which is what kept these calls dead", () => {
    const offenders: string[] = [];
    for (const file of walk(join(SRC, "app"))) {
      const text = readFileSync(file, "utf8");
      if (/export const revalidate\b/.test(text)) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }
    // Not a permanent ban — a guard that outlives its reason is noise. If
    // this goes red, someone made a route cacheable and the corresponding
    // `revalidatePath` calls need real, canonical targets.
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
