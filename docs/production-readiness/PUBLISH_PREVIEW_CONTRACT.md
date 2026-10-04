# Publish preview — the asset-resolution contract (decision record)

> Status: **decision recorded, implementation deliberately not started.**
> Written before any UI code, per the "trace the data boundary first" rule.
> Owner decision still required — see _Open question_ at the end.

## The question

Not "how do I put `PlatformPreviewSwitcher` into the form?" but
**"who owns resolution of the preview media?"** PR3 removed the text-only `PreviewPane`
and deliberately did **not** substitute the real preview, because
`PlatformPreviewSwitcher` takes a `storage-object` media id and `PublishPackageForm` has no
storage context. Guessing would have shipped a preview that silently never resolves.
`tests/unit/publishing/publish-ia.test.tsx` asserts that gap is still open so it cannot be
forgotten.

## What the trace found

### 1. The page already owns resolution — the form needs no storage knowledge

`src/app/(app)/app/w/[slug]/planning/[id]/page.tsx` is a Server Component and already
resolves everything, for the Copy tab's preview:

```ts
const firstImageAsset = linkedMediaAssets.find((row) => row.object.kind === "image");
const firstImageSignedPreviewUrl = firstImageAsset ? /* signed R2 URL */ : null;
const thumbnailUrl = firstImageAsset
  ? (firstImageSignedPreviewUrl ??
     (firstAssetHasPreview
       ? `/api/media/assets/${firstImageAsset.asset.id}/preview`
       : `/api/media/assets/${firstImageAsset.asset.id}`))
  : null;
const thumbnailWidth  = firstImageAsset?.object.width  ?? null;
const thumbnailHeight = firstImageAsset?.object.height ?? null;
```

Those four values are then passed straight into `<PlatformPreviewSwitcher>`. So the
integration is **a prop, not a new data layer**: the page resolves, the form renders.

### 2. Media is item-level, not channel-level

`firstImageAsset` is the first image asset linked to _the content item_ — it is not
per-channel. So the interface proposed in review
(`media: ResolvedDeliveryMedia[]` on a per-channel `PublishPreviewInput`) is
over-specified: there is exactly **one** thumbnail, shared by every channel, because the
creative is one asset and the channels differ only in copy and platform chrome.

The shape that matches reality:

```ts
export interface PublishPreviewMedia {
  /** Signed/relative URL the browser can load, or null when nothing is approved. */
  thumbnailUrl: string | null;
  /** Stored intrinsic dimensions, so PlatformPreview skips a second byte fetch. */
  width: number | null;
  height: number | null;
}
```

`PublishPackageForm` gains one optional `previewMedia?: PublishPreviewMedia | null`. The
page supplies it. `PlatformPreviewSwitcher` already accepts these four props unchanged.

### 3. The real defect: preview and readiness read different sources of truth

This is the finding that changes the decision, and it is a **pre-existing inconsistency,
not something PR3 introduced**.

`listMediaAssetsForContentItem` (`src/lib/media/service.ts:639`) unions two sets:

- assets linked directly to the content item (`targetType = "content_item"`), and
- assets linked to **any** `delivery_versions` row for the item (`targetType = "delivery"`).

It does **not** filter to approved or final-approved delivery versions. Meanwhile readiness
blocks on `no_approved_delivery` and `approvedDeliveryVersion`, and `missing_cover` /
`missing_thumbnail` are checked against the payload.

So today the Copy tab can render an image from an **unapproved** delivery — or from a direct
content-item link with no delivery version at all — while the publishing panel says
"Approve a delivery version before publishing." The preview is showing something the
readiness rule says does not exist.

**Consequence for this work:** wiring the preview into Publish _as-is_ would propagate that
inconsistency to a second surface. It should not be copied blindly.

## Recommended shape of the change (not yet implemented)

1. Add a shared, approval-aware resolver — e.g.
   `resolveApprovedPreviewMedia(contentItemId)` — that returns `PublishPreviewMedia` and
   filters to **final-approved** delivery versions, falling back to `null`.
2. Point **both** the Copy tab and the publish form at it, so the two surfaces cannot
   disagree. This fixes finding 3 at the same time as it enables the preview.
3. Keep the compact empty state already shipped in PR3 for the `null` case. It is a better
   answer than manufacturing a storage-object id or rendering nothing.
4. When there is no approved media but an unapproved image exists, the empty state should
   say so and link to `#assets-versions` — which is what the shared component already does.

## Open question — is the real preview release-blocking?

This is an **owner decision**, not a technical one. Two defensible answers:

- **In scope.** It was part of the intended target architecture, and finding 3 above is a
  genuine correctness problem that the fix would address. Cost: one resolver, two call
  sites, tests.
- **Deferred.** If Copy is considered to own the authoritative preview and Publish is
  scoped to package editing + readiness, then Publish having no preview is coherent — but
  that must be _stated_, not left implied. In that case change
  `publish-ia.test.tsx` from "asserts the gap exists" to "asserts Publish intentionally has
  no preview", so the test stops looking like an unfinished item.

Recommendation: **do it, but as its own PR after the browser gate is otherwise closed**,
and take finding 3 in the same change. It is not worth corrupting the form's architecture
to check a box, but the underlying inconsistency is worth fixing on its own merits.
