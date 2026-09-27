# Linking a Meta publication to Planner

Planner does not publish directly to Meta. Publish or schedule the post in
Meta first, then link the resulting Facebook or Instagram object to the
matching Planner channel.

## User workflow

1. Open an existing Planner item and select the **Publish** tab.
2. Find the Facebook or Instagram channel card and choose **Link Meta post**.
3. Planner loads published posts from the last 90 days. Facebook also exposes
   future scheduled Page posts. Instagram scheduled media is not exposed by
   the current read-only media endpoint, so scheduled Instagram content will
   appear after it goes live. The first candidate is ranked using the Planner
   date and title/brief, but always verify the caption, preview, and date
   yourself.
4. Select the correct candidate and choose **Link selected post**.
5. Use **Refresh** after a scheduled post goes live. Planner changes its
   external state from **Scheduled** to **Published** only after Meta confirms
   the object is live.

Facebook and Instagram are linked independently. Linking stores publication
metadata only; it does not overwrite the Planner title, brief, caption, or
assets.

## Stories (temporary content)

An Instagram Story is live for 24 hours and has **no permanent link**. Planner
still lets you link one, and records it as Published — there is simply nothing
durable to open later. Stories are labelled **Story** in the candidate list;
Meta reports them as an Image or a Video, so the label comes from
`media_product_type`, not `media_type`.

- **No link** — the story row shows "Published · temporary content (no
  permanent link)". This is normal for a story, not a failed fetch.
- **Link expires {date}** — Meta returned a permalink and the story is still
  live. Open it while it lasts.
- **Temporary content · link no longer available** — the 24-hour window has
  closed. The link is removed from the card rather than left as a dead anchor.
  The status stays **Published**: the content was published, the artifact is
  gone by design.

Recording a story does not need a URL. In the manual **Record outcome** form,
leaving **Published URL** blank reveals an optional **Link expires at** field;
filling it is what allows a published outcome with no link.

Expired stories are handled by the background social sync worker, which needs no
Meta call — the stored expiry is authoritative. It only ever changes the Meta
link state, never the Planner publication status.

## States and recovery

- **Scheduled** — Meta has the post scheduled; Planner remains pending.
- **Published** — Meta has confirmed the post is live; Planner can record it as
  published.
- **Unavailable** — Meta no longer returns the linked object. The provider ID,
  permalink, timestamps, snapshot, and audit history are preserved. Unlink it
  manually before choosing a replacement.
- **Sync error** — Meta could not confirm the object. Retry with **Refresh**.

The background social sync worker reconciles linked scheduled objects. Manual
Refresh is still available when a user needs an immediate check. A Meta object
can only be linked to one Planner publication record.

## Connection permissions

The connection must be active and associated with the Planner channel. The
read-only Meta scopes include `pages_read_user_content` so Page feeds and
scheduled Page posts can be read. Publishing, ads, and write scopes are not
requested. Existing connections may need to be reauthorized before linking.

If the dialog reports a permission or expired-token error, reconnect Meta from
the channel settings, then return to the Planner item. If the connection is
not configured for the agency, an agency admin must configure Meta first.

## What linking does not do

- It does not create Planner items from unmatched Meta posts.
- It does not publish, edit, delete, or reschedule Meta content.
- It does not merge Facebook and Instagram links.
- It does not replace Planner copy or creative assets.
