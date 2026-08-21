# Content `formatPayload` schemas

> **Where these live in the schema:** `content_item.format_payload` (jsonb,
> default `{ schemaVersion: 1 }`). Quick Create writes only `{ schemaVersion: 1 }`;
> the per-format structured fields below are written when the user opens
> **More details** on the content detail page and edits the format-specific
> fields. The intent is to keep Quick Create minimal (4 fields: title, format,
> planned date, short brief) per StudioFlow §11 and §17 while letting every
> format carry the structured fields creative needs.

`brief` (one-liner text) is the planner's intent. `formatPayload` is the
structured, format-specific contract creative must answer. Keep them
separate: rewriting the brief for clarity does not reset creative's
structured notes, and vice versa.

## Why not add columns?

Three reasons that argue for jsonb (`format_payload`) instead of new
columns on `content_item`:

1. **Per-format fields differ.** Short-form video has `scenes`; carousel
   has `slideCount`; article has `wordCount`. A column per field is a
   combinatorial explosion.
2. **StudioFlow §11 is explicit.** "short_form_video: ratio defaults 9:16,
   durationSeconds defaults 30, hook, mainMessage, callToAction, scenes,
   onScreenText, voiceOverNotes, audioReference, coverDirection,
   captionsEnabled." The list is jsonb-shaped.
3. **Migration cost is lower.** Adding a column requires a backfill for
   every existing row. Adding a key to a jsonb default is a no-op.

## Conventions

- `formatPayload` is always a JSON object. The first key is `schemaVersion`
  (integer, currently `1`).
- Every format has its own optional field block. Fields default to `null`
  or `[]` — never required.
- Form-level labels are sentence-case ("Hook", "Main message", "CTA"),
  not camelCase.
- "More details" is a disclosure under the brief on the content detail
  page (StudioFlow §17 "Keep campaign, pillar, objective, audience,
  priority, captions, CTA, hashtags, references, assignments,
  specifications, and overrides under More details."). It only renders
  one block at a time, picked by the current `format` value.

## Per-format schemas

### `static_post`

```jsonc
{
  "schemaVersion": 1,
  "objective": "awareness" | "consideration" | "conversion" | "retention" | null,
  "audience": "string | null",
  "hook": "string | null",         // 1-line scroll-stop
  "mainMessage": "string | null",  // 1-line takeaway
  "callToAction": "string | null", // 1-line next action
  "hashtags": ["#string"],
  "references": ["https://…"]
}
```

### `carousel`

```jsonc
{
  "schemaVersion": 1,
  "slideCount": 5, // 2-10
  "objective": "…",
  "audience": "…",
  "hook": "…",
  "mainMessage": "…",
  "callToAction": "…",
  "hashtags": [],
  "references": [],
  "slideOutline": [{ "position": 1, "summary": "string", "visual": "string | null" }],
}
```

### `story`

```jsonc
{
  "schemaVersion": 1,
  "frameCount": 3, // 1-5
  "objective": "…",
  "audience": "…",
  "hook": "…",
  "callToAction": "…",
  "hashtags": [],
}
```

### `short_form_video`

```jsonc
{
  "schemaVersion": 1,
  "ratio": "9:16", // "9:16" | "1:1" | "4:5"
  "durationSeconds": 30, // 5-90
  "hook": "…", // 1-line scroll-stop
  "mainMessage": "…", // 1-line takeaway
  "callToAction": "…", // 1-line next action
  "scenes": [{ "position": 1, "summary": "string", "durationSeconds": 3 }],
  "onScreenText": "string | null",
  "voiceOverNotes": "string | null",
  "audioReference": "https://… | null",
  "coverDirection": "string | null",
  "captionsEnabled": true,
}
```

### `long_form_video`

```jsonc
{
  "schemaVersion": 1,
  "ratio": "16:9", // "16:9" | "9:16" | "1:1"
  "durationSeconds": 180, // 30-3600
  "hook": "…",
  "mainMessage": "…",
  "callToAction": "…",
  "chapters": [{ "position": 1, "title": "string", "startsAtSeconds": 0 }],
  "captionsEnabled": true,
  "references": [],
}
```

### `live_content`

```jsonc
{
  "schemaVersion": 1,
  "platform": "instagram" | "tiktok" | "youtube" | "linkedin" | "facebook" | "other",
  "guests": [{ "name": "string", "role": "host" | "guest" | "moderator" }],
  "runOfShow": [
    { "startsAtSeconds": 0, "topic": "string" }
  ],
  "hashtags": []
}
```

### `article`

```jsonc
{
  "schemaVersion": 1,
  "wordCount": 600, // 100-20000
  "objective": "…",
  "audience": "…",
  "hook": "…",
  "mainMessage": "…",
  "callToAction": "…",
  "outline": [{ "level": 2, "title": "string" }],
  "references": [],
}
```

### `other`

```jsonc
{
  "schemaVersion": 1,
  "notes": "string | null",
  "specifications": { "any-key": "any-value" },
}
```

## Validation

- The whole payload is validated at the service boundary with Zod.
- Each format has its own `formatPayloadSchema`. Mismatches return
  `400` from the API and a form-level error in the UI.
- Channel overrides (caption, CTA, hashtags) live on
  `content_item_channel` and are NOT mirrored into `formatPayload`.

## AI use

The `improveBrief` capability (§15) writes a Hook → Main message → CTA
block that the user can copy into the brief field. The
`completeness_check` capability scores the brief on a 0-100 scale and
lists the missing structured fields. Neither writes to `formatPayload`
directly — the user must confirm by editing the More details form.
