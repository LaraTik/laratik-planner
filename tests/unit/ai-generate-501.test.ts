import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural guard for the AI capability implementation.
 *
 * FEAT-03 (GAP-FULL-REVIEW-2026-08-25) closed out the three
 * "Coming soon" capabilities (`platform_adaptation`, `campaign_ideas`,
 * `related_format_ideas`). The previous 501 early-return is gone;
 * each capability now dispatches to its own prompt builder.
 *
 * This test reads the route source and asserts:
 *
 *   1. None of the three capabilities appear inside a 501
 *      `status: 501` block — i.e. the previous 501 is removed.
 *   2. All three capabilities have a `case` in the switch
 *      (the prompt-builder dispatch).
 *   3. The prompt builders themselves exist in `src/lib/ai/index.ts`.
 *
 * When the capability surface changes, this test must be updated
 * to expect a 200 (or moved to a "not yet wired" test file).
 */
describe("ai-generate route — capability implementation contract", () => {
  const routeSource = readFileSync(
    join(process.cwd(), "src", "app", "api", "ai", "generate", "route.ts"),
    "utf8",
  );
  const aiSource = readFileSync(join(process.cwd(), "src", "lib", "ai", "index.ts"), "utf8");

  it.each(["platform_adaptation", "campaign_ideas", "related_format_ideas"])(
    "%s no longer returns 501 from /api/ai/generate",
    (capability) => {
      // The 501 block previously looked like:
      //   if (
      //     parsed.data.capability === "platform_adaptation" ||
      //     ...
      //   ) {
      //     return NextResponse.json({ error: ... }, { status: 501 });
      //   }
      // The fix replaces that early-return with a `case` in the
      // downstream switch. We assert that the literal
      // `status: 501` is not paired with the capability name in a
      // meaningful way — i.e. there's no block that returns 501 for
      // any of the three.
      const block = routeSource.match(
        new RegExp(`parsed\\.data\\.capability === "${capability}"[\\s\\S]+?status: 501`),
      );
      expect(block, `${capability} still returns 501`).toBeNull();
    },
  );

  it.each(["platformAdapt", "campaignIdeas", "relatedFormatIdeas"])(
    "%s prompt builder is exported from src/lib/ai/index.ts",
    (fn) => {
      // The function must be exported and the route must reference it.
      const exportPattern = new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`);
      expect(exportPattern.test(aiSource), `${fn} is not exported from src/lib/ai/index.ts`).toBe(
        true,
      );
      const callPattern = new RegExp(`\\b${fn}\\(`);
      expect(callPattern.test(routeSource), `${fn} is not called from /api/ai/generate`).toBe(true);
    },
  );

  it.each(["platform_adaptation", "campaign_ideas", "related_format_ideas"])(
    "%s has a case in the switch",
    (capability) => {
      const casePattern = new RegExp(`case\\s+"${capability}":`);
      expect(casePattern.test(routeSource), `no case for ${capability}`).toBe(true);
    },
  );
});
