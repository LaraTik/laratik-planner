import { describe, expect, it } from "vitest";
import { normalizeMediaFolderName } from "@/lib/media/folders";

describe("media folder names", () => {
  it("trims valid names", () => {
    expect(normalizeMediaFolderName("  Spring campaign  ")).toBe("Spring campaign");
  });

  it("rejects empty and oversized names", () => {
    expect(normalizeMediaFolderName("   ")).toBeNull();
    expect(normalizeMediaFolderName("x".repeat(81))).toBeNull();
  });
});
