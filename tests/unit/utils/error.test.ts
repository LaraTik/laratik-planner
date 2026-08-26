import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/utils/error";

describe("getErrorMessage", () => {
  it("returns the .message of an Error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns a string as-is", () => {
    expect(getErrorMessage("oops")).toBe("oops");
  });

  it("returns the .message of an object with a string message", () => {
    expect(getErrorMessage({ message: "from object" })).toBe("from object");
  });

  it("falls back to 'Unknown error' for null/undefined/number/boolean", () => {
    expect(getErrorMessage(null)).toBe("Unknown error");
    expect(getErrorMessage(undefined)).toBe("Unknown error");
    expect(getErrorMessage(42)).toBe("Unknown error");
    expect(getErrorMessage(false)).toBe("Unknown error");
  });

  it("falls back to a custom string when supplied", () => {
    expect(getErrorMessage(null, "Something went wrong")).toBe("Something went wrong");
  });

  it("returns 'Unknown error' for an object whose message is not a string", () => {
    expect(getErrorMessage({ message: 42 })).toBe("Unknown error");
  });
});
