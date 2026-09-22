# Linking a Meta publication to Planner

Planner does not publish directly to Meta. Publish or schedule the post in
Meta first, then link the resulting Facebook or Instagram object to the
matching Planner channel.

## User workflow

1. Open an existing Planner item and select the **Publish** tab.
2. Find the Facebook or Instagram channel card and choose **Link Meta post**.
3. Planner loads published posts from the last 90 days and future scheduled
   posts for that connected channel. The first candidate is ranked using the
   Planner date and title/brief, but always verify the caption, preview, and
   date yourself.
4. Select the correct candidate and choose **Link selected post**.
5. Use **Refresh** after a scheduled post goes live. Planner changes its
   external state from **Scheduled** to **Published** only after Meta confirms
   the object is live.

Facebook and Instagram are linked independently. Linking stores publication
metadata only; it does not overwrite the Planner title, brief, caption, or
assets.

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
scheduled posts can be read. Publishing, ads, and write scopes are not
requested. Existing connections may need to be reauthorized before linking.

If the dialog reports a permission or expired-token error, reconnect Meta from
the channel settings, then return to the Planner item. If the connection is
not configured for the agency, an agency admin must configure Meta first.

## What linking does not do

- It does not create Planner items from unmatched Meta posts.
- It does not publish, edit, delete, or reschedule Meta content.
- It does not merge Facebook and Instagram links.
- It does not replace Planner copy or creative assets.
