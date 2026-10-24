/**
 * Trend Radar — source catalog.
 *
 * UI projection of `services/trends/app/extractor/catalog.py`. The Python
 * catalog is authoritative because the scheduler runs there; this projection
 * adds UI-only grouping and copy while sharing source keys, cost tiers,
 * cadence, credential requirements, and ToS class. Platform grouping and
 * display labels can intentionally differ. The parity test protects the
 * fields with identical meaning from drift.
 *
 * Source tiers
 * ------------
 * - `free`  : no per-call usage cost; some sources still require API keys.
 * - `paid`  : metered per-call or subscription cost; these sources require
 *   credentials. The scheduler
 *   enforces a per-agency monthly cap (entitlement
 *   `trend_radar_cost_cents_per_month`).
 * - `experimental` : not surfaced in the UI; reserved.
 *
 * ToS class
 * ---------
 * - `clean` : official first-party API.
 * - `grey`  : unofficial scraper or wrapper scraping a TOS-restricted
 *   surface. UI shows a ToS acknowledgement modal before enabling.
 * - `review_required` : official API that needs App Review before
 *   production read traffic.
 */
export type SourceTier = "free" | "paid" | "experimental";
export type SourceTosClass = "clean" | "grey" | "review_required";
export type SourceCadence = "1h" | "3h" | "6h" | "12h" | "24h";
export type SourcePlatform =
  | "tiktok"
  | "youtube"
  | "reddit"
  | "facebook"
  | "instagram"
  | "threads"
  | "x"
  | "linkedin"
  | "pinterest"
  | "spotify"
  | "google_trends"
  | "meta_ads"
  | "apify";

export type SourceDefinition = {
  key: string;
  displayName: string;
  platform: SourcePlatform;
  tier: SourceTier;
  tosClass: SourceTosClass;
  cadence: SourceCadence;
  requiresApiKey: boolean;
  /** Short description (EN) for the catalog card. */
  blurb: string;
  /** Region for UI grouping. */
  region: "global" | "cn" | "jp" | "mena";
};

/**
 * UI projection of the 18-source catalog. Keep source keys, tiers, ToS class,
 * cadence, and key requirements in sync with
 * `services/trends/app/extractor/catalog.py:SOURCES`; display labels,
 * platform grouping, descriptions, and regions are UI-owned.
 */
export const TREND_SOURCE_CATALOG: ReadonlyArray<SourceDefinition> = [
  {
    key: "tiktok_creative_center",
    displayName: "TikTok Creative Center",
    platform: "tiktok",
    tier: "free",
    tosClass: "clean",
    cadence: "6h",
    requiresApiKey: false,
    blurb: "Official trending hashtags, songs, and creators.",
    region: "global",
  },
  {
    key: "tiktok_tamnd_cli",
    displayName: "TikTok (tamnd CLI)",
    platform: "tiktok",
    tier: "free",
    tosClass: "grey",
    cadence: "6h",
    requiresApiKey: false,
    blurb: "Unofficial scraper via tamnd CLI. Acknowledgement required.",
    region: "global",
  },
  {
    key: "youtube_data_api",
    displayName: "YouTube Data API v3",
    platform: "youtube",
    tier: "free",
    tosClass: "clean",
    cadence: "6h",
    requiresApiKey: true,
    blurb: "Official API. 10k units/day free, then metered.",
    region: "global",
  },
  {
    key: "reddit_json",
    displayName: "Reddit (JSON endpoint)",
    platform: "reddit",
    tier: "free",
    tosClass: "clean",
    cadence: "6h",
    requiresApiKey: false,
    blurb: "Public subreddit hot/trending feeds. No auth needed.",
    region: "global",
  },
  {
    key: "reddit_praw",
    displayName: "Reddit (PRAW)",
    platform: "reddit",
    tier: "free",
    tosClass: "clean",
    cadence: "6h",
    requiresApiKey: true,
    blurb: "Authenticated PRAW client. Higher rate limits than JSON.",
    region: "global",
  },
  {
    key: "meta_ads_library",
    displayName: "Meta Ad Library",
    platform: "meta_ads",
    tier: "free",
    tosClass: "clean",
    cadence: "24h",
    requiresApiKey: true,
    blurb: "Official Meta Ad Library API. Best for competitor creative intel.",
    region: "global",
  },
  {
    key: "threads_api",
    displayName: "Threads API",
    platform: "threads",
    tier: "free",
    tosClass: "clean",
    cadence: "12h",
    requiresApiKey: true,
    blurb: "Official Meta Threads API. 12h cadence.",
    region: "global",
  },
  {
    key: "spotify_web_api",
    displayName: "Spotify Web API",
    platform: "spotify",
    tier: "free",
    tosClass: "clean",
    cadence: "24h",
    requiresApiKey: true,
    blurb: "Trending playlists + audio features.",
    region: "global",
  },
  {
    key: "google_trends_serpapi",
    displayName: "Google Trends (SerpAPI)",
    platform: "google_trends",
    tier: "paid",
    tosClass: "grey",
    cadence: "24h",
    requiresApiKey: true,
    blurb: "SerpAPI wrapper for Google Trends. Real-time interest over time.",
    region: "global",
  },
  {
    key: "x_twikit",
    displayName: "X (twikit)",
    platform: "x",
    tier: "free",
    tosClass: "grey",
    cadence: "6h",
    requiresApiKey: true,
    blurb: "Unofficial scraper. Acknowledgement required.",
    region: "global",
  },
  {
    key: "x_v2_paid",
    displayName: "X API v2 (paid)",
    platform: "x",
    tier: "paid",
    tosClass: "clean",
    cadence: "6h",
    requiresApiKey: true,
    blurb: "Official X API v2. $100/mo Basic tier minimum.",
    region: "global",
  },
  {
    key: "instagram_instaloader",
    displayName: "Instagram (instaloader)",
    platform: "instagram",
    tier: "free",
    tosClass: "grey",
    cadence: "12h",
    requiresApiKey: false,
    blurb: "Unofficial scraper. Acknowledgement required.",
    region: "global",
  },
  {
    key: "instagram_graph_api",
    displayName: "Instagram Graph API",
    platform: "instagram",
    tier: "free",
    tosClass: "review_required",
    cadence: "6h",
    requiresApiKey: true,
    blurb: "Official Meta Graph API. Business account required.",
    region: "global",
  },
  {
    key: "linkedin_tomquirk",
    displayName: "LinkedIn (tomquirk)",
    platform: "linkedin",
    tier: "free",
    tosClass: "grey",
    cadence: "12h",
    requiresApiKey: true,
    blurb: "Unofficial scraper. Acknowledgement required.",
    region: "global",
  },
  {
    key: "linkedin_marketing_api",
    displayName: "LinkedIn Marketing API",
    platform: "linkedin",
    tier: "free",
    tosClass: "review_required",
    cadence: "24h",
    requiresApiKey: true,
    blurb: "Official API. App Review required before production read.",
    region: "global",
  },
  {
    key: "pinterest_api_v5",
    displayName: "Pinterest API v5",
    platform: "pinterest",
    tier: "free",
    tosClass: "clean",
    cadence: "24h",
    requiresApiKey: true,
    blurb: "Official Pinterest API. Trending pins + boards.",
    region: "global",
  },
  {
    key: "apify_x_scraper",
    displayName: "Apify X Scraper",
    platform: "apify",
    tier: "paid",
    tosClass: "grey",
    cadence: "6h",
    requiresApiKey: true,
    blurb: "Apify actor for X. Billed per actor run.",
    region: "global",
  },
  {
    key: "kawsarlog_threads",
    displayName: "KawsarLog Threads",
    platform: "threads",
    tier: "free",
    tosClass: "grey",
    cadence: "12h",
    requiresApiKey: false,
    blurb: "Unofficial scraper for Threads. Acknowledgement required.",
    region: "mena",
  },
] as const;

export function getSourceDefinition(key: string): SourceDefinition | undefined {
  return TREND_SOURCE_CATALOG.find((s) => s.key === key);
}
