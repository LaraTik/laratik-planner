import { describe, expect, it } from "vitest";
import { openAdvertisingCredentials, sealAdvertisingCredentials } from "@/lib/advertising/crypto";

describe("advertising credential envelopes", () => {
  it("round-trips with a fresh envelope and rejects the wrong DEK", () => {
    const dek = Buffer.alloc(32, 7);
    const wrongDek = Buffer.alloc(32, 8);
    const sealed = sealAdvertisingCredentials(
      { accessToken: "meta-token", refreshToken: "refresh-token" },
      dek,
    );
    expect(openAdvertisingCredentials(sealed, dek)).toEqual({
      accessToken: "meta-token",
      refreshToken: "refresh-token",
    });
    expect(() => openAdvertisingCredentials(sealed, wrongDek)).toThrow(
      "Unable to decrypt advertising credentials",
    );
  });

  it("does not persist plaintext in the envelope", () => {
    const sealed = sealAdvertisingCredentials({ accessToken: "meta-token" }, Buffer.alloc(32, 3));
    expect(JSON.stringify(sealed)).not.toContain("meta-token");
    expect(sealed.iv).toBeTruthy();
    expect(sealed.tag).toBeTruthy();
  });
});
