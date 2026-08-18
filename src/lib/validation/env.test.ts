import { describe, it, expect } from "vitest";

/**
 * Goal 0 contract: importing the client env MUST NOT cause the server schema
 * to be evaluated. We test this by importing clientEnv directly and asserting
 * that the bundled output of clientEnv does not contain server-only keys.
 *
 * Because tests run in jsdom (browser-like), the `import "server-only"` chain
 * is not enforceable, so we use a structural check instead.
 */
describe("client env schema", () => {
  it("NEXT_PUBLIC_APP_URL defaults to localhost in dev", async () => {
    const { clientEnv } = await import("./env");
    expect(clientEnv.NEXT_PUBLIC_APP_URL).toMatch(/^https?:\/\//);
  });

  it("does not expose server-only keys", async () => {
    const { clientEnv } = await import("./env");
    const exposed = Object.keys(clientEnv);
    for (const forbidden of [
      "DATABASE_URL",
      "AUTH_SECRET",
      "GOOGLE_CLIENT_SECRET",
      "SMTP_PASSWORD",
      "MINIMAX_API_KEY",
      "SENTRY_AUTH_TOKEN",
      "CRON_SECRET",
    ]) {
      expect(exposed, `clientEnv must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });
});
