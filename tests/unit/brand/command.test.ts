import { describe, expect, it } from "vitest";
import {
  BrandAssetCommandSchema,
  BrandLinkedResourceCommandSchema,
  BrandPublishingRuleCommandSchema,
  BrandVoiceRuleCommandSchema,
} from "@/lib/brand/command";

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
      value: { family: "Inter", weight: 600, role: "headline" },
    });
    expect(result.success).toBe(true);
  });

  it.each([100, 200, 300, 400, 500, 600, 700, 800, 900] as const)("accepts weight %i", (weight) => {
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
      value: { family: "Inter", weight: 400, role },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a weight of 950 (out of CSS range)", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "Inter", weight: 950, role: "body" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a weight that is not a multiple of 100 (e.g. 425)", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "Inter", weight: 425, role: "body" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/multiple of 100/);
    }
  });

  it("rejects a non-integer weight (e.g. 400.5)", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "Inter", weight: 400.5, role: "body" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "Inter", weight: 400, role: "footer" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty font family", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "", weight: 400, role: "body" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a font family over 120 chars", () => {
    const result = BrandAssetCommandSchema.safeParse({
      kind: "font",
      name: "Body",
      value: { family: "x".repeat(121), weight: 400, role: "body" },
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

describe("BrandPublishingRuleCommandSchema", () => {
  it("accepts a trimmed compliance rule", () => {
    expect(
      BrandPublishingRuleCommandSchema.parse({
        ruleType: "compliance",
        title: " Legal review ",
        content: " Claims require written approval. ",
      }),
    ).toEqual({
      ruleType: "compliance",
      title: "Legal review",
      content: "Claims require written approval.",
    });
  });

  it("rejects empty and overlong fields", () => {
    expect(() =>
      BrandPublishingRuleCommandSchema.parse({ ruleType: "general", title: "", content: "" }),
    ).toThrow();
  });

  it("rejects an unknown ruleType", () => {
    const result = BrandPublishingRuleCommandSchema.safeParse({
      ruleType: "unknown",
      title: "X",
      content: "Y",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a title over 80 chars", () => {
    const result = BrandPublishingRuleCommandSchema.safeParse({
      ruleType: "general",
      title: "x".repeat(81),
      content: "valid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects content over 1000 chars", () => {
    const result = BrandPublishingRuleCommandSchema.safeParse({
      ruleType: "general",
      title: "Title",
      content: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts every documented ruleType", () => {
    for (const ruleType of ["alt_text", "hashtag", "compliance", "channel", "general"] as const) {
      const result = BrandPublishingRuleCommandSchema.safeParse({
        ruleType,
        title: "T",
        content: "C",
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("BrandLinkedResourceCommandSchema", () => {
  it("accepts an HTTPS Figma URL", () => {
    expect(
      BrandLinkedResourceCommandSchema.parse({
        provider: "figma",
        name: "Master design library",
        url: "https://figma.com/file/example",
        description: "Approved components",
      }).provider,
    ).toBe("figma");
  });

  it("rejects HTTP and javascript URLs", () => {
    for (const url of ["http://example.com", "javascript:alert(1)"]) {
      expect(() =>
        BrandLinkedResourceCommandSchema.parse({ provider: "other", name: "Unsafe", url }),
      ).toThrow();
    }
  });

  it("trims whitespace from the name", () => {
    const result = BrandLinkedResourceCommandSchema.parse({
      provider: "figma",
      name: "  Master library  ",
      url: "https://figma.com/file/x",
    });
    expect(result.name).toBe("Master library");
  });

  it("accepts a description up to 280 chars and trims it", () => {
    const result = BrandLinkedResourceCommandSchema.parse({
      provider: "google_drive",
      name: "Drive",
      url: "https://drive.google.com/folders/abc",
      description: "  Approved assets folder.  ",
    });
    expect(result.description).toBe("Approved assets folder.");
  });

  it("rejects a name over 120 chars", () => {
    const result = BrandLinkedResourceCommandSchema.safeParse({
      provider: "figma",
      name: "x".repeat(121),
      url: "https://figma.com/file/x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown provider", () => {
    const result = BrandLinkedResourceCommandSchema.safeParse({
      provider: "sketch",
      name: "Sketch file",
      url: "https://sketch.com/s/x",
    });
    expect(result.success).toBe(false);
  });
});
