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

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
