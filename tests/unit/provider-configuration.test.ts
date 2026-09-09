import { describe, expect, it } from "vitest";
import { validateProviderConfiguration } from "@/lib/validation/provider-configuration";

describe("production provider configuration", () => {
  it("rejects partially configured authentication providers", () => {
    const issues = validateProviderConfiguration({
      nodeEnv: "production",
      googleClientId: "client",
      googleClientSecret: "",
      smtpHost: "smtp.example.com",
      smtpUser: "",
      smtpPassword: "",
      smtpFrom: "",
      minimaxApiKey: "",
    });
    expect(issues).toContain("Google OAuth requires both client ID and client secret");
    expect(issues).toContain("SMTP requires host, user, password, and from address");
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
        minimaxApiKey: "",
      }),
    ).toEqual([]);
  });
});
