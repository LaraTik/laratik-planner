import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("AI generation authorization order", () => {
  it("rejects callers before loading workspace research or brand context", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "api", "ai", "generate", "route.ts"),
      "utf8",
    );
    const roleCheck = source.indexOf("await hasWorkspaceRole(");
    const writeCheck = source.indexOf("await requireWriteCapability(");
    const researchRead = source.indexOf("const [researchReference]");
    const trendRead = source.indexOf("if (parsed.data.trendSignalId)");
    const brandContextRead = source.indexOf("const context = await loadAiContext(");

    expect(roleCheck).toBeGreaterThan(-1);
    expect(writeCheck).toBeGreaterThan(roleCheck);
    expect(researchRead).toBeGreaterThan(writeCheck);
    expect(trendRead).toBeGreaterThan(writeCheck);
    expect(brandContextRead).toBeGreaterThan(writeCheck);
  });

  it("does not refund reconciled provider usage after a later route failure", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "api", "ai", "generate", "route.ts"),
      "utf8",
    );
    const reconciliation = source.indexOf("await reconcileAiBudget({");
    const releaseMarker = source.indexOf("reservedTokens = null;", reconciliation);
    const laterFailureRefund = source.indexOf("if (reservedTokens)", releaseMarker);

    expect(reconciliation).toBeGreaterThan(-1);
    expect(releaseMarker).toBeGreaterThan(reconciliation);
    expect(laterFailureRefund).toBeGreaterThan(releaseMarker);
    expect(source.slice(laterFailureRefund)).toContain("releaseAiBudgetReservation");
  });
});
