# ADR 0016 — Ephemeral publications without a permanent link

Date: 2026-09-27
Status: accepted for implementation
Supersedes: nothing. Extends [ADR 0015](0015-meta-external-publication-linking.md).

## Context

Instagram Stories are live for 24 hours and have no permanent public link. The
product, however, encoded "a published record must carry a link" as a hard
PostgreSQL `CHECK` — `publication_published_needs_url_time_publisher` required
`published_url IS NOT NULL` whenever `status = 'published'`.

That made Stories **unlinkable**, not merely linkless. `persistLinkedCandidate`
wrote `status = 'published'` together with `published_url = <permalink>`, and
when the permalink was null the entire `db.transaction` rolled back against the
constraint. The manual "Record outcome" path was independently blocked by
`recordPublication` throwing `published requires a publishedUrl`. There was no
way in the product to mark a Story as published at all.

A second, quieter problem sat behind it: Stories were **mislabelled**. Meta
reports a Story with `media_type` of `IMAGE` or `VIDEO` and surfaces the real
type in `media_product_type: "STORY"`. `mediaTypeValue()` handled `REELS` but had
no `STORY` branch, so every Story rendered as "Image" or "Video" and was
indistinguishable from a feed post when choosing a candidate.

## Decision

- Add a nullable `publication_record.expires_at`.
- Relax the invariant to *"published implies a URL **or** a known expiry"*, not
  remove it. A published row still requires `actual_published_at` and
  `publisher_id`.
- Detect Stories via `media_product_type`, which the provider already requests
  on both the list and by-id paths. No new fetch path is introduced.
- Keep a Story's permalink when Meta returns one, and stamp `expires_at`
  alongside it, so the card shows a real link while live and drops it once dead.
- An expired Story stays `published` in Planner forever. Only the *external*
  link degrades to `unavailable`, matching the ADR 0015 rule for objects that
  stop being returned.
- Derive the expiry as `published_at + 24h`. Meta exposes no expiry field, so
  the window is computed once in `META_STORY_TTL_MS`.

## Why `expires_at` rather than a nullable `published_url`

Making the URL nullable alone would lose the reason a link is missing: "this is
a Story" and "somebody forgot the link" become indistinguishable, and the UI has
nothing to render. A timestamp is self-describing, gives the card a concrete
thing to say, gives the sync worker a precise and cheap rule, and generalises to
other ephemeral formats — TikTok, already a provider in this repo, expires too —
without a second migration.

An explicit field also keeps the relaxation *honest*. The predicate is
`published_url IS NOT NULL OR expires_at IS NOT NULL`, so a permanent
publication is still held to the original all-or-nothing rule.

## Consequences

Stories become linkable and are labelled as Stories. The link dialog explains a
missing link rather than rendering an absent control, and the channel card
never shows a link that is already known to be dead.

The Story window is a hardcoded 24 hours. If Instagram changes it, the constant
is wrong until updated; it is isolated in `META_STORY_TTL_MS` for that reason,
and the live UAT row is what would catch it.

Stories arriving through `/{ig-user-id}/media` is an **observed** behaviour, not
a documented guarantee — Meta documents a separate `/{ig-user-id}/stories` edge.
The labelling work is correct either way; only a Stories-disappeared regression
would justify adding the second fetch path, and that is deliberately out of
scope.

## Rollback and compatibility

Migration `0053_ephemeral_publication_expiry` is additive plus a constraint swap
carried out inside a single `DO` block, so it is atomic even under
`scripts/migrate-concurrent.ts`, which runs statements outside a transaction.

No backfill is required: the column is new, and every existing `published` row
already has a `published_url` because the old constraint guaranteed it, so all of
them satisfy the new predicate. The relaxation is a pure widening.

Reverting the application image leaves the column unused (nullable) and the
relaxed constraint a superset of the old one, so previous code continues to
validate. Restoring the strict constraint is only safe once no `expires_at` row
is published without a URL; the exact statement is recorded at the foot of the
migration.

`publication_pending_clears_published_fields` was deliberately **not** tightened
to cover `expires_at`. A scheduled Story is legitimately `pending` in Planner
while carrying a notional window, so the service only ever writes `expires_at`
on the transition into `published`.
