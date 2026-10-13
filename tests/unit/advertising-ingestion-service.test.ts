import { describe, expect, it } from "vitest";
import { buildSpendReconciliation } from "@/lib/advertising/ingestion-service";

describe("canonical advertising spend reconciliation", () => {
  it("keeps provider, canonical, attributed, unallocated, and discrepancy distinct", () => {
    expect(
      buildSpendReconciliation({
        providerAccountSpend: "100.125000",
        canonicalAdSpend: "99.125000",
        workspaceAttributedSpend: "60.125000",
        completeness: "complete",
      }),
    ).toEqual({
      providerAccountSpend: "100.125",
      canonicalAdSpend: "99.125",
      workspaceAttributedSpend: "60.125",
      unallocatedSpend: "40",
      discrepancy: "1",
      completeness: "complete",
    });
  });

  it("uses fixed-point arithmetic and rejects negative or over-precise provider values", () => {
    expect(
      buildSpendReconciliation({
        providerAccountSpend: "0.000001",
        canonicalAdSpend: "0.000000",
        workspaceAttributedSpend: "0.000000",
        completeness: "partial",
      }).discrepancy,
    ).toBe("0.000001");
    expect(() =>
      buildSpendReconciliation({
        providerAccountSpend: "-1",
        canonicalAdSpend: "0",
        workspaceAttributedSpend: "0",
        completeness: "complete",
      }),
    ).toThrow("advertising_spend_invalid");
  });
});
