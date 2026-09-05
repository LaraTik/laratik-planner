# Batch Add workflow

Batch Add is the planning intake surface. It creates Draft content items atomically; creative production details are completed later in More details.

## Formats at a glance

| Format             | Use it for                               | Guidance completed later                                                            |
| ------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `static_post`      | One image, text, or static feed post     | Hook, message, CTA, hashtags, references; no video duration or scene list           |
| `short_form_video` | Reel, TikTok, or Short                   | Usually `9:16`, `5–90s`; scenes, on-screen text, voice-over, audio, captions, cover |
| `long_form_video`  | YouTube, LinkedIn, or another long video | Usually `16:9`, `30–3600s`; description, chapters, captions, references             |
| `carousel`         | Swipeable image/card sequence            | Cards and visual direction                                                          |
| `story`            | Short-lived vertical story content       | Frames, stickers, captions, timing                                                  |
| `live_content`     | Scheduled live stream or broadcast       | Run of show and host details                                                        |
| `article`          | Article, blog post, or newsletter entry  | Outline, body, references, CTA                                                      |
| `other`            | Custom deliverable                       | Describe the deliverable in More details                                            |

The database keeps these canonical values. Raw imports also accept aliases such as `image`, `static post`, `reel`, `short video`, `long video`, and `youtube video`.

## Raw pipe import

The compatible format is:

```text
title | format | date and time | short brief [| caption [| hashtags [| location]]]
```

Examples use workspace-local time. An explicit ISO offset is also accepted for compatibility.

```text
Spring collection | static_post | 2026-09-05 09:00 | Single image announcing the pre-order
Studio behind the scenes | short_form_video | 2026-09-06 18:00 | 20-second vertical Reel showing the roasting process
How to brew the autumn blend | long_form_video | 2026-09-07 10:00 | Eight-minute YouTube tutorial with chapters
Spring collection | image | 2026-09-05T09:00:00+02:00 | Alias is normalized to static_post | Pre-order now | #spring #drop | Berlin
```

Raw pipe rows use the active channels by default. Select or clear channels after import in the grid.

## Spreadsheet import

Copy a header and rows from a spreadsheet. The `Channels` column is optional; channel names are matched to active workspace channels and remain editable.

```text
Title	Format	Date & time	Short brief	Channels
Spring collection	static_post	2026-09-05 09:00	Single-image pre-order announcement	Instagram, Facebook
Studio behind the scenes	short_form_video	2026-09-06 18:00	20-second vertical Reel	Instagram, TikTok
How to brew the autumn blend	long_form_video	2026-09-07 10:00	Eight-minute tutorial	YouTube
```

All rows are validated before saving. Missing title, format, or date, invalid dates, unsupported formats, malformed extensions, unknown channels, and more than 50 rows block the atomic save. An empty brief or duplicate date is a warning and does not block saving.

The displayed workspace timezone is authoritative for values without an offset. For example, `2026-09-05 09:00` in `Europe/Berlin` is stored as `2026-09-05T07:00:00.000Z` in September. DST gaps such as `2026-03-29 02:30` in Berlin are rejected rather than normalized to a different time.

Each successful row becomes a Draft with `formatPayload: { schemaVersion: 1 }`. Channel authorization, default assignments, and the transaction boundary are enforced on the server.
