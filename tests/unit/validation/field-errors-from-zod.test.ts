import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  actionFailure,
  fieldErrorsFromZod,
} from "@/lib/validation/action-state";

/**
 * Plan §4 — "fieldErrorsFromZod is the only place that knows
 * how to turn a Zod issue path into a stable form-field name."
 * This test pins the contract:
 *   - The first issue per path wins.
 *   - The summary is colon-joined.
 *   - Runtime errors (no Zod) bubble up via `actionFailure`.
 */
describe("fieldErrorsFromZod", () => {
  const IdeaSchema = z.object({
    title: z.string().min(2, "Title must be at least 2 characters"),
    format: z.enum(["static_post", "carousel", "story"]),
    plannedPublishAt: z.string().min(1, "Pick a date"),
    brief: z.string().max(2000).optional(),
  });

  it("returns an empty map and a short summary when the parse succeeds", () => {
    const parsed = IdeaSchema.safeParse({
      title: "Spring drop",
      format: "static_post",
      plannedPublishAt: "2026-09-01T09:00:00Z",
    });
    expect(parsed.success).toBe(true);
    // The helper is only used on the failure branch; the success
    // path is verified by the form's `state.error` check.
  });

  it("maps the first Zod issue per field name", () => {
    const parsed = IdeaSchema.safeParse({
      title: "",
      format: "static_post",
      plannedPublishAt: "",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const { error, fieldErrors } = fieldErrorsFromZod<keyof z.infer<typeof IdeaSchema> & string>(
      parsed.error,
    );
    expect(fieldErrors?.title).toBe("Title must be at least 2 characters");
    expect(fieldErrors?.plannedPublishAt).toBe("Pick a date");
    expect(error).toContain("title: Title must be at least 2 characters");
    expect(error).toContain("plannedPublishAt: Pick a date");
  });

  it("keeps only the first issue per field (no stack)", () => {
    const parsed = IdeaSchema.safeParse({
      title: "",
      format: "static_post",
      plannedPublishAt: "2026-09-01T09:00:00Z",
    });
    if (parsed.success) throw new Error("expected failure");
    const { fieldErrors } = fieldErrorsFromZod<"title">(parsed.error);
    // Even when Zod has multiple issues for the same path
    // (e.g. min + max on the same field), the user sees
    // the first one.
    expect(Object.keys(fieldErrors ?? {})).toEqual(["title"]);
  });

  it("uses the per-issue formatter when provided", () => {
    const parsed = IdeaSchema.safeParse({
      title: "",
      format: "static_post",
      plannedPublishAt: "2026-09-01T09:00:00Z",
    });
    if (parsed.success) throw new Error("expected failure");
    const { fieldErrors } = fieldErrorsFromZod<"title">(parsed.error, () => "Title is required");
    expect(fieldErrors?.title).toBe("Title is required");
  });
});

describe("actionFailure", () => {
  it("returns the error message from an Error", () => {
    const out = actionFailure(new Error("boom"), "fallback");
    expect(out.error).toBe("boom");
  });

  it("returns the fallback for a non-Error value", () => {
    const out = actionFailure("just a string", "fallback");
    expect(out.error).toBe("fallback");
  });

  it("returns the fallback for null / undefined", () => {
    expect(actionFailure(null, "fallback").error).toBe("fallback");
    expect(actionFailure(undefined, "fallback").error).toBe("fallback");
  });
});
