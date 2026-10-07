import { SocialProviderError, providerRequest } from "@/lib/social/http";
import { httpsOrNull, blankToNull } from "@/lib/social/media-fields";

/**
 * Targeted re-fetch of the media fields a Command Center row needs.
 *
 * This deliberately does NOT reuse the full snapshot fetchers: those pull a
 * whole page of posts and their insights, which is wasteful when the only
 * thing missing is one preview image. One `/{media-id}` request per post
 * keeps the backfill's provider cost proportional to the number of posts
 * that actually need an image.
 */
export interface MetaPostMediaFields {
  thumbnailUrl: string | null;
  caption: string | null;
}

type MetaPostMediaFieldsRaw = Record<string, unknown>;

export type MetaPostMediaFieldsPlatform = "facebook" | "instagram";

/** Injected so tests never touch the network. */
export interface MetaPostMediaFieldsDeps {
  request: (url: string) => Promise<{ body: string }>;
  baseUrl: (apiVersion: string) => string;
}

const FIELD_SET: Record<MetaPostMediaFieldsPlatform, string> = {
  instagram: "id,caption,permalink,thumbnail_url",
  facebook: "id,message,permalink_url,full_picture,attachments{thumbnail_url}",
};

export async function fetchMetaPostMediaFields(input: {
  platform: string;
  publicationId: string;
  accessToken: string;
  apiVersion?: string | null;
  deps?: MetaPostMediaFieldsDeps;
}): Promise<MetaPostMediaFields | null> {
  if (input.platform !== "facebook" && input.platform !== "instagram") {
    throw new SocialProviderError("not_configured", false, null);
  }
  const platform = input.platform;
  const deps = input.deps ?? (await defaultDeps());

  const url = new URL(`${deps.baseUrl(input.apiVersion ?? "v25.0")}/${input.publicationId}`);
  url.searchParams.set("fields", FIELD_SET[platform]);
  url.searchParams.set("access_token", input.accessToken);

  const { body } = await deps.request(url.toString());

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new SocialProviderError("invalid_response", false, null);
  }
  const raw = parsed as MetaPostMediaFieldsRaw;
  // A provider error object comes back as `{ error: {...} }` with HTTP 200
  // for some Graph failures, so treat it as "no data" rather than a row.
  if (raw.error !== undefined) return null;

  if (platform === "instagram") {
    return {
      thumbnailUrl: httpsOrNull(raw.thumbnail_url),
      caption: blankToNull(raw.caption),
    };
  }

  const attachments = raw.attachments as { data?: Array<{ thumbnail_url?: unknown }> } | undefined;
  const attachmentThumb = httpsOrNull(attachments?.data?.[0]?.thumbnail_url);
  return {
    thumbnailUrl: attachmentThumb ?? httpsOrNull(raw.full_picture),
    caption: blankToNull(raw.message),
  };
}

async function defaultDeps(): Promise<MetaPostMediaFieldsDeps> {
  const { resolveGraphVersion, graphBaseUrl } = await import("@/lib/social/providers/meta");
  return {
    request: (url: string) => providerRequest(url),
    baseUrl: (apiVersion: string) => graphBaseUrl(resolveGraphVersion(apiVersion)),
  };
}
