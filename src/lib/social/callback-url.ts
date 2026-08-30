import "server-only";
import { clientEnv } from "@/lib/validation/env";

/**
 * Per-agency OAuth callback URL builder.
 *
 * Each agency has its own Meta / TikTok app (M4.6 — `agency_social_provider_config`).
 * To give agency admins a URL they can paste straight into their
 * Meta / TikTok developer console AND to add defense-in-depth on top
 * of the existing state-token isolation, the canonical callback URL
 * for a new flow is:
 *
 *     ${NEXT_PUBLIC_APP_URL}/api/social/{provider}/callback/{agencySlug}
 *
 * The legacy global URL
 *
 *     ${NEXT_PUBLIC_APP_URL}/api/social/{provider}/callback
 *
 * is kept as a back-compat shim. It accepts the same `?code=&state=`
 * payload, looks up the state row, and runs the same code-exchange
 * path. Existing in-flight flows that started before the per-agency
 * cutover keep working without a re-paste.
 *
 * The agencySlug is the unique `agencies.slug` value the platform
 * uses everywhere else (workspaces, navigation, audit logs). It is
 * 1:1 with the agency and never changes for the lifetime of the
 * agency — safe to bake into the Meta / TikTok dev console.
 */
export type SocialProvider = "meta" | "tiktok";

function baseUrl(): string {
  return clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

/**
 * Per-agency canonical URL. Agency admins see this string on the
 * provider config card and paste it into their Meta / TikTok
 * developer console. The path-segment slug matches the
 * `app/api/social/{provider}/callback/[agencySlug]/route.ts`
 * route handler.
 */
export function buildPerAgencyCallbackUrl(provider: SocialProvider, agencySlug: string): string {
  if (!/^[a-z0-9-]+$/.test(agencySlug)) {
    throw new Error(`Invalid agency slug: ${agencySlug}`);
  }
  return `${baseUrl()}/api/social/${provider}/callback/${agencySlug}`;
}

/**
 * Legacy global URL. Returns the back-compat path that the
 * `/api/social/{provider}/callback` shim still accepts. Used by
 * the shim itself when it needs to echo the URL back to the
 * provider's token-exchange endpoint (the token exchange requires
 * the SAME `redirect_uri` value the original authorize call used).
 */
export function buildLegacyCallbackUrl(provider: SocialProvider): string {
  return `${baseUrl()}/api/social/${provider}/callback`;
}

/**
 * Returns the URL the platform would use for the agency's NEW
 * provider config. The provider config card reads this so the
 * agency admin can copy it straight into the Meta / TikTok
 * developer console.
 */
export function agencyCallbackUrl(provider: SocialProvider, agencySlug: string): string {
  return buildPerAgencyCallbackUrl(provider, agencySlug);
}
