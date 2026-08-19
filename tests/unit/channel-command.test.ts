import { describe, expect, it } from "vitest";
import { ChannelCommandSchema } from "@/lib/channels/command";

describe("social channel command", () => {
  it("accepts known and custom accounts and rejects unsafe URLs", () => {
    expect(
      ChannelCommandSchema.safeParse({
        platform: "instagram",
        accountName: "Brand IG",
        handle: "@brand",
        url: "https://instagram.com/brand",
      }).success,
    ).toBe(true);
    expect(
      ChannelCommandSchema.safeParse({
        platform: "other",
        accountName: "Community",
        url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});
