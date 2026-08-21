import { describe, expect, it } from "vitest";
import {
  CreateCommentSchema,
  LABEL_VALUES,
  ResolveCommentSchema,
  VISIBILITY_VALUES,
  type CommentLabel,
  type CommentVisibility,
} from "@/lib/discussions/service";

const validUuid = "11111111-2222-4333-8444-555555555555";

describe("discussions / CreateCommentSchema", () => {
  it("accepts a minimal top-level comment", () => {
    const r = CreateCommentSchema.safeParse({
      contentItemId: validUuid,
      body: "Looks good to me.",
      visibility: "client",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a reply with a parent comment id", () => {
    const r = CreateCommentSchema.safeParse({
      contentItemId: validUuid,
      parentCommentId: validUuid,
      body: "Agreed.",
      visibility: "internal",
      label: "feedback",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const r = CreateCommentSchema.safeParse({
      contentItemId: validUuid,
      body: "",
      visibility: "client",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a body longer than 10_000 chars", () => {
    const r = CreateCommentSchema.safeParse({
      contentItemId: validUuid,
      body: "x".repeat(10_001),
      visibility: "client",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid contentItemId", () => {
    const r = CreateCommentSchema.safeParse({
      contentItemId: "not-a-uuid",
      body: "hi",
      visibility: "client",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown visibility", () => {
    const r = CreateCommentSchema.safeParse({
      contentItemId: validUuid,
      body: "hi",
      visibility: "everyone",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown label", () => {
    const r = CreateCommentSchema.safeParse({
      contentItemId: validUuid,
      body: "hi",
      visibility: "internal",
      label: "rant",
    });
    expect(r.success).toBe(false);
  });

  it("accepts every defined visibility value", () => {
    for (const v of VISIBILITY_VALUES) {
      const r = CreateCommentSchema.safeParse({
        contentItemId: validUuid,
        body: "hi",
        visibility: v,
      });
      expect(r.success, `expected ${v} to be accepted`).toBe(true);
    }
  });

  it("accepts every defined label value", () => {
    for (const l of LABEL_VALUES) {
      const r = CreateCommentSchema.safeParse({
        contentItemId: validUuid,
        body: "hi",
        visibility: "client",
        label: l,
      });
      expect(r.success, `expected ${l} to be accepted`).toBe(true);
    }
  });

  it("treats label as optional", () => {
    const r = CreateCommentSchema.safeParse({
      contentItemId: validUuid,
      body: "hi",
      visibility: "client",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.label).toBeUndefined();
  });
});

describe("discussions / ResolveCommentSchema", () => {
  it("accepts resolved=true with a valid comment id", () => {
    const r = ResolveCommentSchema.safeParse({
      commentId: validUuid,
      resolved: true,
    });
    expect(r.success).toBe(true);
  });

  it("accepts resolved=false", () => {
    const r = ResolveCommentSchema.safeParse({
      commentId: validUuid,
      resolved: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-boolean resolved", () => {
    const r = ResolveCommentSchema.safeParse({
      commentId: validUuid,
      resolved: "yes",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid comment id", () => {
    const r = ResolveCommentSchema.safeParse({
      commentId: "abc",
      resolved: true,
    });
    expect(r.success).toBe(false);
  });
});

describe("discussions / value unions", () => {
  it("VISIBILITY_VALUES contains both 'internal' and 'client'", () => {
    expect(VISIBILITY_VALUES).toEqual(["internal", "client"]);
  });

  it("LABEL_VALUES contains the four defined labels", () => {
    expect(LABEL_VALUES).toEqual(["general", "question", "feedback", "decision"]);
  });

  it("CommentVisibility narrows the union correctly", () => {
    const v: CommentVisibility = "client";
    expect(v).toBe("client");
  });

  it("CommentLabel narrows the union correctly", () => {
    const l: CommentLabel = "decision";
    expect(l).toBe("decision");
  });
});
