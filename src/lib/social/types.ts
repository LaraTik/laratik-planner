import type { SocialCredentials } from "./crypto";
import type { SocialSourceMetadata } from "./metrics";

export type { SocialSourceMetadata } from "./metrics";

/**
 * M4 — provider-neutral contracts.
 *
 * The repository, sync worker, analytics engine, and UI never know
 * which provider they are talking to. Each provider (`meta.ts`,
 * `tiktok.ts`) implements `SocialProviderAdapter`. The application
 * resolves the right adapter from the connection's `provider` column.
 *
 * Types that the adapters and the application share live here. Types
 * that are adapter-internal stay inside the adapter file.
 */

export type SocialPlatform = "instagram" | "facebook" | "tiktok";

/**
 * One row of `/me/accounts` (Meta) or `user.info.basic` (TikTok).
 * Tokens are NEVER on this object. The adapter hands the application
 * a token-free list; the application hands the picker a token-free
 * list. The credentials are resealed and stored on the connection
 * row separately.
 */
export type ConnectedProfile = {
  providerAccountId: string;
  platform: SocialPlatform;
  accountName: string;
  handle: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  /**
   * For Meta: the parent Facebook Page's external ID. `null` for
   * TikTok (single-profile provider) and for Facebook Pages
   * themselves.
   */
  parentProviderAccountId: string | null;
};

/**
 * A normalized daily snapshot. The application persists this exact
 * shape. Provider-specific extras go in `sourceMetadata` (jsonb).
 */
export type ProfileSnapshot = {
  observedAt: Date;
  followerCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  likesCount: number | null;
  reach: number | null;
  views: number | null;
  engagedAccounts: number | null;
  interactions: number | null;
  providerApiVersion: string;
  providerRequestId: string | null;
  /**
   * sha256 hex of the normalized snapshot body. Lets an operator
   * prove the snapshot was unchanged without keeping the body.
   */
  responseHash: string;
  sourceMetadata: SocialSourceMetadata;
};

export type ConnectedProfileRef = Pick<
  ConnectedProfile,
  "providerAccountId" | "platform" | "parentProviderAccountId"
>;

export type RefreshedCredentials = {
  credentials: SocialCredentials;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
};

export type AppCredentials = {
  appId: string;
  appSecret: string;
  /**
   * Optional per-agency Graph API version override (Meta only).
   * Null falls back to the adapter's compile-time default
   * (`v25.0`). Pinned per agency so a tenant's app does not
   * silently get bumped to a new Graph version on platform
   * upgrades.
   */
  graphApiVersion?: string | null;
};

export interface SocialProviderAdapter {
  /** Provider key, e.g. `'meta'` or `'tiktok'`. */
  readonly provider: "meta" | "tiktok";

  /**
   * Discover the connected profiles the credentials grant access to.
   * Used at connection-finalize time. Returns the token-free profile
   * list plus the (possibly rotated) credentials envelope.
   */
  discoverProfiles(
    credentials: SocialCredentials,
    appCredentials: AppCredentials,
  ): Promise<{
    profiles: ConnectedProfile[];
    credentials: SocialCredentials;
  }>;

  /**
   * Refresh the access token (and possibly the refresh token) before
   * the snapshot call. Adapters MUST handle the case where the
   * refresh token itself has expired (TikTok 365-day) by surfacing
   * `SocialProviderError('auth_expired', false)`.
   */
  refreshCredentials(
    credentials: SocialCredentials,
    appCredentials: AppCredentials,
  ): Promise<RefreshedCredentials>;

  /**
   * Fetch the normalized daily snapshot for one profile. The adapter
   * is responsible for mapping provider-specific metrics to the
   * normalized shape. Missing metrics are `null`, never `0`.
   */
  fetchSnapshot(
    profile: ConnectedProfileRef,
    credentials: SocialCredentials,
    appCredentials: AppCredentials,
  ): Promise<ProfileSnapshot>;

  /**
   * Revoke the grant with the provider. Best-effort: the application
   * does not abort the local state transition if the provider call
   * fails, because the connection is being disconnected anyway.
   */
  revoke(credentials: SocialCredentials, appCredentials: AppCredentials): Promise<void>;
}
