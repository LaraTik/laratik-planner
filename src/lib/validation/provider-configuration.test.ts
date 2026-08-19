import { describe, it, expect } from "vitest";
import {
  validateProviderConfiguration,
  type ProviderConfiguration,
} from "./provider-configuration";

/**
 * Branch coverage for the env provider-configuration guard. The function
 * is only called in production (line 14 short-circuits otherwise), so the
 * unit tests deliberately exercise the production branch paths and the
 * non-production short-circuit.
 */

const baseConfig: ProviderConfiguration = {
  nodeEnv: "production",
  googleClientId: "",
  googleClientSecret: "",
  smtpHost: "",
  smtpUser: "",
  smtpPassword: "",
  smtpFrom: "",
  aiEnabled: false,
  minimaxApiKey: "",
};

describe("validateProviderConfiguration", () => {
  it("returns [] for non-production environments", () => {
    expect(validateProviderConfiguration({ ...baseConfig, nodeEnv: "development" })).toEqual([]);
    expect(validateProviderConfiguration({ ...baseConfig, nodeEnv: "test" })).toEqual([]);
  });

  it("flags a partial Google OAuth configuration in production", () => {
    const issues = validateProviderConfiguration({
      ...baseConfig,
      googleClientId: "id",
      googleClientSecret: "",
    });
    expect(issues).toContain("Google OAuth requires both client ID and client secret");
  });

  it("flags a partial SMTP configuration in production", () => {
    const issues = validateProviderConfiguration({
      ...baseConfig,
      smtpHost: "mail.laratik.com",
      smtpUser: "",
      smtpPassword: "",
      smtpFrom: "",
    });
    expect(issues).toContain("SMTP requires host, user, password, and from address");
  });

  it("flags a production deployment with no auth provider", () => {
    const issues = validateProviderConfiguration(baseConfig);
    expect(issues).toContain("At least one complete authentication provider is required");
  });

  it("flags AI-enabled without an API key in production", () => {
    const issues = validateProviderConfiguration({
      ...baseConfig,
      googleClientId: "id",
      googleClientSecret: "secret",
      aiEnabled: true,
      minimaxApiKey: "",
    });
    expect(issues).toContain("AI is enabled but MINIMAX_API_KEY is missing");
  });

  it("returns [] when a complete Google OAuth is configured", () => {
    const issues = validateProviderConfiguration({
      ...baseConfig,
      googleClientId: "id",
      googleClientSecret: "secret",
    });
    expect(issues).toEqual([]);
  });

  it("returns [] when complete SMTP is configured", () => {
    const issues = validateProviderConfiguration({
      ...baseConfig,
      smtpHost: "mail.laratik.com",
      smtpUser: "ci",
      smtpPassword: "ci-only",
      smtpFrom: "ci@planner.test",
    });
    expect(issues).toEqual([]);
  });
});
