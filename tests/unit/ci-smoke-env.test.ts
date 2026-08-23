import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CI production-image smoke environment", () => {
  it("provides the required agency-cookie secret to the production container", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    const buildSmokeStart = workflow.indexOf("  build-smoke:");
    const buildSmokeEnd = workflow.indexOf("  check-smtp-cert:", buildSmokeStart);
    const buildSmoke = workflow.slice(buildSmokeStart, buildSmokeEnd);

    expect(buildSmokeStart).toBeGreaterThan(-1);
    expect(buildSmokeEnd).toBeGreaterThan(buildSmokeStart);
    expect(buildSmoke).toContain(
      "AGENCY_COOKIE_SECRET: ci_agency_cookie_secret_not_for_production_xxxxxxxxx",
    );
    expect(buildSmoke).toContain("-e AGENCY_COOKIE_SECRET=$AGENCY_COOKIE_SECRET");
  });
});
