import { describe, expect, it } from "vitest";
import { sanitizeLogContext } from "@/lib/observability/logger";

describe("structured log sanitization", () => {
  it("removes secrets and private content recursively", () => {
    expect(
      sanitizeLogContext({
        requestId: "req-1",
        token: "secret",
        brief: "private",
        nested: { authorization: "Bearer x", status: 502 },
      }),
    ).toEqual({
      requestId: "req-1",
      token: "[redacted]",
      brief: "[redacted]",
      nested: { authorization: "[redacted]", status: 502 },
    });
  });
});
