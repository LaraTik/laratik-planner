export type AppEnvironment = "development" | "production" | "test";

export type BuildInfo = {
  fullSha: string | null;
  shortSha: string | null;
  environment: AppEnvironment;
  environmentLabel: string;
  displayLabel: string;
  copyText: string;
};

const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;

/**
 * Normalize the non-sensitive runtime build identity used by the health
 * endpoint and authenticated UI. Production images receive APP_VERSION from
 * the immutable GitHub commit SHA. Invalid tags such as `latest` are never
 * presented as a real build.
 */
export function createBuildInfo(input: {
  version?: string | null;
  environment: AppEnvironment;
}): BuildInfo {
  const candidate = input.version?.trim() ?? "";
  const fullSha = FULL_GIT_SHA.test(candidate) ? candidate.toLowerCase() : null;
  const shortSha = fullSha?.slice(0, 7) ?? null;
  const environmentLabel =
    input.environment === "production"
      ? "Production"
      : input.environment === "test"
        ? "Test"
        : "Development";
  const buildValue = fullSha ?? (input.environment === "development" ? "local" : "unavailable");
  const displayLabel = shortSha
    ? `Build ${shortSha}`
    : input.environment === "development"
      ? "Local development"
      : "Build unavailable";

  return {
    fullSha,
    shortSha,
    environment: input.environment,
    environmentLabel,
    displayLabel,
    copyText: `StudioFlow build: ${buildValue} | Environment: ${input.environment}`,
  };
}
