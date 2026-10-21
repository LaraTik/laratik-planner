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

    // Known-bounded loop, deliberately allowed. The content transition
    // command maps `WORKFLOW_RULES[action].roles` — a fixed set of at most six
    // roles — against ONE workspace id. It is not a fan-out over a growing
    // set, and `getWorkspaceRoles` is `React.cache`-wrapped so repeats collapse.
    // Recorded here with its reason so the exception is visible, not silent.
    const allowlist = new Set(["features/content/workflow-transition.server.ts"]);

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
   * SCOPE: the whole tree. Every legitimate producer is allowlisted with the
   * reason it is legitimate, so a new legacy URL fails loudly.
   */
  /**
   * Only the legacy catch-all itself may name `/app/w/`, and only as its own
   * redirect destination. Every producer the app controls emits the canonical
   * shape.
   *
   * This allowlist started with three entries — the catch-all plus two
   * "we cannot know the tenant here" fallbacks. Both fallbacks were removed by
   * giving the code the tenant it was missing rather than by swapping the
   * string out: the workspace switcher now carries each option's agency slug,
   * and the tenant switch joins the agency onto the landing workspace instead
   * of fetching it separately and tolerating an empty result.
   */
  const ALLOWED_LEGACY_PRODUCERS = new Set(["app/(app)/app/w/[...legacy]/page.tsx"]);

  it("no component emits a navigation to the legacy workspace shape", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const name = file.slice(SRC.length + 1);
      if (ALLOWED_LEGACY_PRODUCERS.has(name)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        if (line.includes("revalidatePath")) return;
        const isNavigation =
          /redirect\(/.test(line) || /href=/.test(line) || /getRowHref/.test(line);
        // `router.push` and a bare returned URL are navigations too — the
        // first version of this rule missed exactly those, twice.
        const isPushed = /router\.push\(/.test(line) || /^\s*`\/app\//.test(line);
        if ((isNavigation || isPushed) && /\/app\/w\//.test(line)) {
          offenders.push(`${name}:${i + 1} ${line.trim()}`);
        }
      });
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
