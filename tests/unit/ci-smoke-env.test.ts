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

  it("bakes the immutable Git SHA and does not replace it with the mutable image tag", () => {
    const ciWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    const deployWorkflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/deploy.yml"),
      "utf8",
    );
    const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");
    const compose = readFileSync(resolve(process.cwd(), "docker-compose.yml"), "utf8");
    const healthCheck = readFileSync(resolve(process.cwd(), "scripts/vps/health-check.sh"), "utf8");

    expect(ciWorkflow).toContain("--build-arg APP_VERSION=${GITHUB_SHA}");
    expect(deployWorkflow).toContain(
      "APP_VERSION=${{ github.event.workflow_run.head_sha || github.sha }}",
    );
    expect(dockerfile).toContain("ENV APP_VERSION=$APP_VERSION");
    expect(compose).not.toContain("APP_VERSION: ${IMAGE_TAG:-latest}");
    expect(healthCheck).toContain('EXPECTED_APP_VERSION="${EXPECTED_APP_VERSION:-}"');
    expect(healthCheck).toContain('[ "$version" = "$EXPECTED_APP_VERSION" ]');
  });
});
