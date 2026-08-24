import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural guard for the 501 contract on /api/ai/generate.
 *
 * The three "Coming soon" capabilities
 *   - platform_adaptation
 *   - campaign_ideas
 *   - related_format_ideas
 * are documented as "not yet implemented" in the route. They
 * MUST return 501 (not 200, not 403, not 502) so the UI can
 * surface a clear "this capability is on the roadmap" message
 * instead of misleading the user with a silent success.
 *
 * This test reads the source and asserts the contract; the
 * runtime behaviour is exercised by the E2E suite (which
 * requires a live DB). When the three capabilities are wired
 * up, this test must be updated to expect a 200 (or moved to
 * a "not yet wired" test file).
 */
describe("ai-generate route — 501 contract for unwired capabilities", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "app", "api", "ai", "generate", "route.ts"),
    "utf8",
  );

  it.each(["platform_adaptation", "campaign_ideas", "related_format_ideas"])(
    "returns 501 for %s",
    (capability) => {
      // The capability must appear inside the unwired-capabilities
      // block (the if branch that returns 501). The same capability
      // also appears in the Zod enum at the top of the file —
      // we only assert the 501 branch contains the literal.
      const block = source.match(
        /parsed\.data\.capability === "platform_adaptation"[\s\S]+?status: 501/,
      );
      expect(block, "501 branch is missing").not.toBeNull();
      expect(block?.[0] ?? "").toContain(capability);
    },
  );
});
