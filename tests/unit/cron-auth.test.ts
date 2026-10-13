import { describe, expect, it } from "vitest";
import { isCronAuthorized, secretsMatch } from "@/lib/cron/auth";

describe("cron authentication contract", () => {
  it("accepts the exact bearer secret", () => {
    expect(
      isCronAuthorized(new Headers({ authorization: "Bearer test-secret" }), "test-secret"),
    ).toBe(true);
  });

  it("rejects missing, malformed, empty, and incorrect credentials", () => {
    expect(isCronAuthorized(new Headers(), "test-secret")).toBe(false);
    expect(
      isCronAuthorized(new Headers({ authorization: "Basic test-secret" }), "test-secret"),
    ).toBe(false);
    expect(isCronAuthorized(new Headers({ authorization: "Bearer " }), "test-secret")).toBe(false);
    expect(isCronAuthorized(new Headers({ authorization: "Bearer wrong" }), "test-secret")).toBe(
      false,
    );
    expect(isCronAuthorized(new Headers({ authorization: "Bearer test-secret" }), "")).toBe(false);
  });

  it("handles different-length secrets without throwing", () => {
    expect(secretsMatch("short", "longer-secret")).toBe(false);
  });
});
