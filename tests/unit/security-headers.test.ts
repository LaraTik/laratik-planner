import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "@/lib/security/headers";

describe("security headers", () => {
  it("denies framing and restrictive browser capabilities", () => {
    const headers = Object.fromEntries(
      buildSecurityHeaders("production").map(({ key, value }) => [key, value]),
    );
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).not.toContain("'unsafe-eval'");
  });

  it("allows unsafe-eval only for the Next.js development runtime", () => {
    const developmentCsp = buildSecurityHeaders("development").find(
      (h) => h.key === "Content-Security-Policy",
    )?.value;
    expect(developmentCsp).toContain("'unsafe-eval'");
    expect(developmentCsp).not.toContain("upgrade-insecure-requests");
    expect(
      buildSecurityHeaders("production").find((h) => h.key === "Content-Security-Policy")?.value,
    ).toContain("upgrade-insecure-requests");
  });
});
