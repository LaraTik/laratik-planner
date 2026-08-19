export type ProviderConfiguration = {
  nodeEnv: "development" | "production" | "test";
  googleClientId: string;
  googleClientSecret: string;
  smtpHost: string;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
  aiEnabled: boolean;
  minimaxApiKey: string;
};

export function validateProviderConfiguration(config: ProviderConfiguration): string[] {
  if (config.nodeEnv !== "production") return [];
  const issues: string[] = [];
  const anyGoogle = !!(config.googleClientId || config.googleClientSecret);
  const googleComplete = !!(config.googleClientId && config.googleClientSecret);
  if (anyGoogle && !googleComplete) {
    issues.push("Google OAuth requires both client ID and client secret");
  }

  const anySmtp = !!(config.smtpHost || config.smtpUser || config.smtpPassword || config.smtpFrom);
  const smtpComplete = !!(
    config.smtpHost &&
    config.smtpUser &&
    config.smtpPassword &&
    config.smtpFrom
  );
  if (anySmtp && !smtpComplete) {
    issues.push("SMTP requires host, user, password, and from address");
  }
  if (!googleComplete && !smtpComplete && !anyGoogle && !anySmtp) {
    issues.push("At least one complete authentication provider is required");
  }
  if (config.aiEnabled && !config.minimaxApiKey) {
    issues.push("AI is enabled but MINIMAX_API_KEY is missing");
  }
  return issues;
}
