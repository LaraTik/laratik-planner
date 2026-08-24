import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production release workflow", () => {
  const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/release.yml"), "utf8");

  it("runs for successful deploys and explicit backfill dispatches", () => {
    expect(workflow).toContain(
      "if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'",
    );
  });

  it("treats a missing tag reference as empty instead of as an API error body", () => {
    expect(workflow).toContain('if EXISTING_SHA="$(gh api');
    expect(workflow).toContain('EXISTING_SHA=""');
    expect(workflow).not.toContain("--jq '.object.sha' 2>/dev/null || true");
  });

  it("keeps release tags immutable and reruns idempotent", () => {
    expect(workflow).toContain("Refusing to move existing tag");
    expect(workflow).toContain("Release ${TAG} already exists; leaving it unchanged.");
  });
});
