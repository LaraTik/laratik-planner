import { describe, expect, it } from "vitest";
import { validateProviderConfiguration } from "@/lib/validation/provider-configuration";

describe("production provider configuration", () => {
  it("rejects partially configured providers and enabled AI without a key", () => {
    const issues = validateProviderConfiguration({
      nodeEnv: "production",
      googleClientId: "client",
      googleClientSecret: "",
      smtpHost: "smtp.example.com",
      smtpUser: "",
      smtpPassword: "",
      smtpFrom: "",
      aiEnabled: true,
      minimaxApiKey: "",
    });
    expect(issues).toContain("Google OAuth requires both client ID and client secret");
    expect(issues).toContain("SMTP requires host, user, password, and from address");
    expect(issues).toContain("AI is enabled but MINIMAX_API_KEY is missing");
  });

  it("accepts a complete passwordless email provider", () => {
    expect(
      validateProviderConfiguration({
        nodeEnv: "production",
        googleClientId: "",
        googleClientSecret: "",
        smtpHost: "smtp.example.com",
        smtpUser: "mailer",
        smtpPassword: "secret",
        smtpFrom: "StudioFlow <hello@example.com>",
        aiEnabled: false,
        minimaxApiKey: "",
      }),
    ).toEqual([]);
  });
});
