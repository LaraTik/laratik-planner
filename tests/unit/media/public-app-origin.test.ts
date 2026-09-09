import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_APP_ORIGIN, resolvePublicAppOrigin } from "@/lib/http/public-app-origin";

describe("public media app origin", () => {
  it("uses the configured public origin when the request host is proxy-facing", () => {
    expect(
      resolvePublicAppOrigin({
        requestOrigin: "http://0.0.0.0:3000",
        configuredOrigins: ["https://planner.laratik.com"],
      }),
    ).toBe("https://planner.laratik.com");
  });

  it("falls back to the production domain when every origin is unusable", () => {
    expect(
      resolvePublicAppOrigin({
        requestOrigin: "http://0.0.0.0:3000",
        configuredOrigins: ["http://localhost:3000", "not-a-url"],
      }),
    ).toBe(DEFAULT_PUBLIC_APP_ORIGIN);
  });

  it("keeps a normal local origin for development links", () => {
    expect(
      resolvePublicAppOrigin({
        requestOrigin: "http://localhost:3000",
        configuredOrigins: ["http://localhost:3000"],
        allowLocalhost: true,
      }),
    ).toBe("http://localhost:3000");
  });
});
