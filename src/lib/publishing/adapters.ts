import "server-only";
import type { LinkedInPayload, XPayload } from "./payload-schemas";

/**
 * FEAT-17 (GAP-FULL-REVIEW-2026-08-25) — per-platform publishing
 * adapter slot.
 *
 * The M4 deliverable stops at the *payload* layer: each platform has
 * a versioned Zod schema (`LinkedInPayloadSchema`, `XPayloadSchema`,
 * etc.) and a `platform_payload` JSONB column on the channel row.
 * A real "click Publish and the post goes live" path is the next
 * milestone (M4.5) and will call one of these adapters per channel.
 *
 * Why ship the slot now:
 *
 *   1. The schema already accepts LinkedIn / X / YouTube / Pinterest
 *      payloads. An admin can connect a `linkedin` channel today and
 *      build a publish package; without an adapter, "Confirm
 *      publishing readiness" succeeds and the queue silently never
 *      delivers. A stub adapter that returns `unsupported` makes the
 *      failure visible (a 422 on the cron) instead of silent.
 *   2. The dispatch worker that calls `publish(actor, payload)` can
 *      import the registry today and ship the M4.5 milestone without
 *      a new public surface.
 *   3. Test code can swap the slot for a recording stub without
 *      mocking the whole dispatch worker.
 *
 * The interface is intentionally narrow — one method, one typed
 * result. We don't model retries, idempotency keys, or the OAuth
 * flow here; those concerns belong to the M4.5 worker that wraps
 * the adapter in a queue.
 */

export type PublishFailureReason =
  | "unsupported"
  | "invalid_payload"
  | "rate_limited"
  | "token_expired"
  | "provider_rejected"
  | "transient_error";

/**
 * Result of a single platform publish call. Either a published-URL
 * came back (success) or a typed failure with a `reason` the
 * dispatcher can route on. The `providerId` is whatever the upstream
 * platform assigns (IG media id, X tweet id, etc.) so a retry can
 * find the existing record and avoid double-posting.
 */
export type PublishResult =
  | {
      ok: true;
      publishedUrl: string;
      providerId: string;
      publishedAt: Date;
    }
  | {
      ok: false;
      reason: PublishFailureReason;
      /** Optional human-readable detail. Never includes the payload or token. */
      detail?: string;
    };

/**
 * One-method adapter contract. The M4.5 dispatcher will look up the
 * adapter by platform string and call `publish` with a server-validated
 * payload (the Zod schema has already run at the service-layer write).
 *
 * Implementations must:
 *   - be idempotent on `providerId` retries (the dispatcher will
 *     pass the same `payload.platform` and `payload.destinationProfileId`
 *     for a given content item + channel)
 *   - never log access tokens
 *   - return a `PublishResult` (never throw) for recoverable errors;
 *     only throw for programmer errors (e.g. an adapter being called
 *     with the wrong platform)
 */
export interface PublishingAdapter<P> {
  readonly platform: P extends { platform: infer TPlatform } ? TPlatform : never;
  publish(input: { actorId: string; payload: P }): Promise<PublishResult>;
}

/**
 * LinkedIn stub — M4.5 will replace the body with a real call into
 * LinkedIn's `rest/posts` endpoint using a stored OAuth token. Today
 * every call returns `unsupported` so the cron surfaces the gap.
 */
export const LinkedInPublishingAdapter: PublishingAdapter<LinkedInPayload> = {
  platform: "linkedin",
  async publish() {
    return {
      ok: false,
      reason: "unsupported",
      detail: "LinkedIn publishing ships in M4.5; no adapter wired in v1.",
    };
  },
};

/**
 * X stub — same shape as the LinkedIn stub. M4.5 will use the
 * `POST /2/tweets` endpoint behind a stored OAuth 2.0 token.
 */
export const XPublishingAdapter: PublishingAdapter<XPayload> = {
  platform: "x",
  async publish() {
    return {
      ok: false,
      reason: "unsupported",
      detail: "X publishing ships in M4.5; no adapter wired in v1.",
    };
  },
};

/**
 * Registry by platform string. The M4.5 dispatcher will resolve
 * `registry[platform]` and call `publish`. Platforms without an
 * adapter (e.g. YouTube in v1) will get a `TypeError`-shaped
 * `undefined`; callers MUST check `platform in registry` before
 * looking up. The map is frozen so a future test that wants to
 * inject a fake must rebuild the module under `vi.mock`.
 */
export const publishingAdapterRegistry = {
  linkedin: LinkedInPublishingAdapter,
  x: XPublishingAdapter,
} as const satisfies Record<string, PublishingAdapter<unknown>>;

export type SupportedPlatform = keyof typeof publishingAdapterRegistry;

export function isSupportedPlatform(value: string): value is SupportedPlatform {
  return Object.prototype.hasOwnProperty.call(publishingAdapterRegistry, value);
}
