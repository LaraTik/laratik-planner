import { describe, expect, it } from "vitest";
import { localizeActionError } from "@/components/forms/action-error-message";
import { tFor } from "@/messages";

describe("localizeActionError", () => {
  it("localizes stable codes in the active catalog", () => {
    expect(
      localizeActionError(
        "contentMutationError.invalid_transition",
        tFor("ar"),
        "contentMutationError.",
        "contentDetail.contentMutationErrors",
        "fallback",
      ),
    ).toBe(tFor("ar")("contentDetail.contentMutationErrors.invalid_transition"));
  });

  it("uses a safe fallback for unknown codes and preserves legacy messages", () => {
    expect(
      localizeActionError(
        "contentMutationError.unknown_code",
        tFor("en"),
        "contentMutationError.",
        "contentDetail.contentMutationErrors",
        "fallback",
      ),
    ).toBe("fallback");
    expect(
      localizeActionError(
        "Older message",
        tFor("en"),
        "contentMutationError.",
        "contentDetail.contentMutationErrors",
        "fallback",
      ),
    ).toBe("Older message");
  });
});
