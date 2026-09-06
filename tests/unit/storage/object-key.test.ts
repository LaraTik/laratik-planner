import { describe, expect, it } from "vitest";
import { createAgencyObjectKey, normalizeStoragePrefix } from "@/lib/storage/object-key";

describe("R2 object keys", () => {
  it("uses the agency/workspace/asset hierarchy and never includes the filename", () => {
    const key = createAgencyObjectKey({
      agencyId: "agency-1",
      workspaceId: "workspace-1",
      assetId: "asset-1",
      extension: "PNG",
    });

    expect(key).toBe("agencies/agency-1/workspaces/workspace-1/assets/asset-1.png");
    expect(key).not.toContain("filename");
  });

  it("prevents prefixes from escaping the agency namespace", () => {
    expect(() => normalizeStoragePrefix("agencies/agency-2/../agency-1")).toThrow();
    expect(() =>
      createAgencyObjectKey({
        agencyId: "agency-1",
        workspaceId: "../workspace-1",
        assetId: "asset-1",
        extension: "png",
      }),
    ).toThrow();
    expect(() =>
      createAgencyObjectKey({
        agencyId: "agency-1",
        workspaceId: "workspace-1",
        assetId: "asset-1",
        extension: "png",
        prefix: "agencies/agency-10",
      }),
    ).toThrow();
  });
});
