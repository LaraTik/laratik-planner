import { describe, expect, it } from "vitest";
import { META_DEFAULT_GRAPH_VERSION, resolveMetaGraphVersion } from "@/lib/meta/version";

describe("Meta API version defaults", () => {
  it("pins unconfigured and invalid overrides to the current v26 release", () => {
    expect(META_DEFAULT_GRAPH_VERSION).toBe("v26.0");
    expect(resolveMetaGraphVersion(null)).toBe("v26.0");
    expect(resolveMetaGraphVersion("not-a-version")).toBe("v26.0");
  });

  it("preserves an explicitly pinned supported version", () => {
    expect(resolveMetaGraphVersion("v25.0")).toBe("v25.0");
  });
});
