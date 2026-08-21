import { describe, expect, it } from "vitest";
import { BrandAssetCommandSchema, BrandVoiceRuleCommandSchema } from "@/lib/brand/command";

describe("BrandAssetCommandSchema — logo variant", () => {
  it("accepts a name-only logo", () => {
    const result = BrandAssetCommandSchema.safeParse({ kind: "logo", name: "Wordmark" });
    expect(result.success).toBe(true);
  });

  it("accepts an https externalUrl", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "logo",
      name: "Wordmark",
      externalUrl: "https://cdn.example.com/logo.svg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an http externalUrl", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "logo",
      name: "Wordmark",
      externalUrl: "http://cdn.example.com/logo.svg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = BrandAssetCommandSchema.safeParse({ kind: "logo", name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a name over 120 chars", () => {
    const result = BrandAssetCommandSchema.safeParse({ kind: "logo", name: "x".repeat(121) });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace from the name", () => {
    const result = BrandAssetCommandSchema.parse({ kind: "logo", name: "  Wordmark  " });
    expect(result).toMatchObject({ kind: "logo", name: "Wordmark" });
  });

  it("accepts a storagePath from the local-volume upload", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "logo",
      name: "Wordmark",
      storagePath: "ws-1/abc-123.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a storagePath with characters that would be rejected at the storage layer (the schema is permissive; path safety is enforced at write time)", () => {
    // The command schema only checks the length and presence of
    // the path; the actual filesystem write (via `writeFile` in
    // `src/lib/storage/index.ts`) is what rejects traversal
    // attempts. See `assertWithinRoot`.
    const result = BrandAssetCommandSchema.safeParse({
      kind: "logo",
      name: "Wordmark",
      storagePath: "/etc/passwd",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when both externalUrl and storagePath are present", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "logo",
      name: "Wordmark",
      externalUrl: "https://cdn.example.com/logo.svg",
      storagePath: "ws-1/abc-123.png",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/Pick one/);
    }
  });
});

describe("BrandAssetCommandSchema — color variant", () => {
  it("accepts a well-formed #RRGGBB hex", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "color",
      name: "Brand blue",
      value: { hex: "#3B82F6" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a hex with uppercase letters", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "color",
      name: "Sunshine",
      value: { hex: "#FFD500" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a hex without the leading hash", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "color",
      name: "Brand blue",
      value: { hex: "3B82F6" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a 3-digit shorthand hex", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "color",
      name: "Brand blue",
      value: { hex: "#FFF" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a hex with non-hex characters", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "color",
      name: "Brand blue",
      value: { hex: "#XYZ123" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty color name", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "color",
      name: "",
      value: { hex: "#3B82F6" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a color name over 80 chars", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "color",
      name: "x".repeat(81),
      value: { hex: "#3B82F6" },
    });
    expect(result.success).toBe(false);
  });
});

describe("BrandAssetCommandSchema — font variant", () => {
  it("accepts a complete font definition", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Heading",
      value: { family: "Inter", weight: "600", role: "headline" },
    });
    expect(result.success).toBe(true);
  });

  it.each(["300", "400", "500", "600", "700", "800"] as const)("accepts weight %s", (weight) => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "Inter", weight, role: "body" },
    });
    expect(result.success).toBe(true);
  });

  it.each(["headline", "body", "accent", "mono"] as const)("accepts role %s", (role) => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "Inter", weight: "400", role },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown weight", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "Inter", weight: "900", role: "body" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "Inter", weight: "400", role: "footer" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty font family", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "", weight: "400", role: "body" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a font family over 120 chars", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "x".repeat(121), weight: "400", role: "body" },
    });
    expect(result.success).toBe(false);
  });
});

describe("BrandAssetCommandSchema — discriminator", () => {
  it("rejects an unknown kind", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "image",
      name: "Whatever",
    });
    expect(result.success).toBe(false);
  });
});

describe("BrandVoiceRuleCommandSchema — tone variant", () => {
  it("accepts a short tone string", () => {
    const result = BrandVoiceRuleCommandSchema.safeParse({
      ruleType: "tone",
      content: "Warm, direct, and never patronising.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a tone over 60 chars", () => {
    const result = BrandVoiceRuleCommandSchema.safeParse({
      ruleType: "tone",
      content: "x".repeat(61),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty tone", () => {
    const result = BrandVoiceRuleCommandSchema.safeParse({ ruleType: "tone", content: "" });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from the tone content", () => {
    const result = BrandVoiceRuleCommandSchema.parse({
      ruleType: "tone",
      content: "  Warm and direct.  ",
    });
    expect(result).toMatchObject({ ruleType: "tone", content: "Warm and direct." });
  });
});

describe("BrandVoiceRuleCommandSchema — do/dont variants", () => {
  it("accepts a do rule up to 280 chars", () => {
    const result = BrandVoiceRuleCommandSchema.safeParse({
      ruleType: "do",
      content: "Lead with the customer's outcome.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a dont rule up to 280 chars", () => {
    const result = BrandVoiceRuleCommandSchema.safeParse({
      ruleType: "dont",
      content: "Avoid jargon like 'synergy' and 'leverage'.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a do rule over 280 chars", () => {
    const result = BrandVoiceRuleCommandSchema.safeParse({
      ruleType: "do",
      content: "x".repeat(281),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty do rule", () => {
    const result = BrandVoiceRuleCommandSchema.safeParse({ ruleType: "do", content: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown ruleType", () => {
    const result = BrandVoiceRuleCommandSchema.safeParse({ ruleType: "maybe", content: "x" });
    expect(result.success).toBe(false);
  });
});
