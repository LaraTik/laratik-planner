export type AppEnvironment = "development" | "production" | "test";

export type BuildInfo = {
  fullSha: string | null;
  shortSha: string | null;
  /**
   * ISO 8601 UTC wall-clock string (e.g. `2026-09-25T09:42:11Z`) stamped
   * by the Docker build arg `APP_BUILD_AT`. `null` when the env is
   * empty (local dev, CI without the arg, etc.). The user menu and
   * "Copy full report" surfaces render "Local build" in that case.
   */
  builtAt: string | null;
  /**
   * `builtAt` formatted in the user's locale + timezone, ready to
   * display in the user menu and error-boundary report. `null` when
   * `builtAt` is null.
   */
  builtAtLabel: string | null;
  environment: AppEnvironment;
  environmentLabel: string;
  displayLabel: string;
  /**
   * Multi-line, human-readable block for the user menu hover / copy
   * action. Always includes the SHA + env; includes the build time
   * when known.
   */
  detailsLabel: string;
  copyText: string;
};

const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Format an ISO 8601 UTC stamp as `YYYY-MM-DD HH:mm UTC` for compact
 * display in the user menu. Falls back to the raw string when the
 * input is not a valid ISO stamp (so a malformed env var surfaces as
 * itself, not as `Invalid Date`).
 */
function formatUtcStampForDisplay(stamp: string): string {
  if (!ISO_8601_UTC.test(stamp)) return stamp;
  return `${stamp.slice(0, 10)} ${stamp.slice(11, 16)} UTC`;
}

/**
 * Localised date+time formatter for the user menu. The avatar menu
 * renders `builtAtLabel` so the user sees the build time in their
 * own timezone (configured workspace tz when signed in, browser tz
 * otherwise). Kept dependency-free — the surrounding layout already
 * resolves a `formatDate` helper that we deliberately do NOT reuse
 * here to keep `BuildInfo` importable from server-only paths.
 */
function formatLocalisedStamp(stamp: string, locale: string, timeZone: string): string {
  if (!ISO_8601_UTC.test(stamp)) return stamp;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return stamp;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(date);
  } catch {
    // Bad tz / locale — fall back to the raw stamp so the menu still
    // shows *something* useful.
    return stamp;
  }
}

/**
 * Normalize the non-sensitive runtime build identity used by the health
 * endpoint and authenticated UI. Production images receive APP_VERSION from
 * the immutable GitHub commit SHA. Invalid tags such as `latest` are never
 * presented as a real build.
 *
 * The optional `builtAt` arg carries the wall-clock UTC stamp injected by
 * the Docker build (`ARG APP_BUILD_AT`). Empty / malformed inputs fall
 * through to `null` so the UI can render an unambiguous "local build"
 * label instead of an `Invalid Date` string.
 */
export function createBuildInfo(input: {
  version?: string | null;
  builtAt?: string | null;
  environment: AppEnvironment;
  /**
   * Locale for the localised build-time label (e.g. `en`, `ar`).
   * Optional — defaults to `en-US`. Combined with `timeZone` to
   * produce `builtAtLabel`.
   */
  locale?: string;
  /**
   * IANA timezone (e.g. `Europe/Berlin`) used for `builtAtLabel`.
   * Optional — falls back to UTC.
   */
  timeZone?: string;
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

  // Normalise the build stamp. Empty + non-ISO inputs collapse to null
  // so the UI never renders an `Invalid Date` / `1970-01-01T00:00:00Z`
  // accident.
  const rawBuiltAt = input.builtAt?.trim() ?? "";
  const builtAt = rawBuiltAt && ISO_8601_UTC.test(rawBuiltAt) ? rawBuiltAt : null;
  const builtAtLabel = builtAt
    ? formatLocalisedStamp(builtAt, input.locale ?? "en-US", input.timeZone ?? "UTC")
    : null;

  const detailsParts: string[] = [];
  if (shortSha) detailsParts.push(`Build ${shortSha}`);
  else if (environmentLabel) detailsParts.push(environmentLabel);
  if (builtAt) detailsParts.push(`Built ${formatUtcStampForDisplay(builtAt)}`);
  const detailsLabel = detailsParts.join(" · ");

  const copyParts: string[] = [
    `StudioFlow build: ${buildValue}`,
    `Environment: ${input.environment}`,
  ];
  if (builtAt) copyParts.push(`Built: ${formatUtcStampForDisplay(builtAt)}`);
  const copyText = copyParts.join(" | ");

  return {
    fullSha,
    shortSha,
    builtAt,
    builtAtLabel,
    environment: input.environment,
    environmentLabel,
    displayLabel,
    detailsLabel,
    copyText,
  };
}
