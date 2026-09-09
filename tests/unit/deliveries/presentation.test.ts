import { describe, expect, it } from "vitest";
import { deliveryAssetIds, newDeliveryAssetIds } from "@/lib/deliveries/presentation";

describe("delivery asset presentation", () => {
  it("deduplicates the exact media assets in a version", () => {
    expect(deliveryAssetIds({ links: [{ mediaAssetId: "a" }, { mediaAssetId: "a" }, {}] })).toEqual(
      ["a"],
    );
  });

  it("returns only assets introduced after the immediately older version", () => {
    expect(
      newDeliveryAssetIds(
        { links: [{ mediaAssetId: "a" }, { mediaAssetId: "b" }] },
        { links: [{ mediaAssetId: "a" }] },
      ),
    ).toEqual(["b"]);
  });
});
