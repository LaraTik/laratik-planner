import { describe, expect, it } from "vitest";
import { renderNotificationCopy } from "@/lib/notifications/service";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §1 — Stored system copy. The bell +
 * email dispatcher render the i18n at view / send time when the
 * row carries a `messageKey` + `messageParams`; otherwise the
 * stored title/body is the fallback. The helper below is the
 * single render site for the bell; the email dispatcher applies
 * the same lookup inline.
 */
describe("renderNotificationCopy", () => {
  it("returns the stored title + body when messageKey is null", () => {
    const out = renderNotificationCopy(
      { title: "English fallback", body: "Stored body", messageKey: null, messageParams: null },
      "ar",
    );
    expect(out).toEqual({ title: "English fallback", body: "Stored body" });
  });

  it("returns the stored title + body when messageKey is null even for the English locale", () => {
    const out = renderNotificationCopy(
      { title: "English fallback", body: "Stored body", messageKey: null, messageParams: null },
      "en",
    );
    expect(out).toEqual({ title: "English fallback", body: "Stored body" });
  });

  it("renders the Arabic catalog entry when messageKey is set and the locale is Arabic", () => {
    const out = renderNotificationCopy(
      {
        title: "English fallback",
        body: "English fallback body",
        messageKey: "notifications.kind.mention",
        messageParams: null,
      },
      "ar",
    );
    expect(out.title).toBe("تمت الإشارة إليك في تعليق");
    expect(out.body).toBe("أشار إليك أحدهم في تعليق على عنصر محتوى.");
  });

  it("renders the English catalog entry when messageKey is set and the locale is English", () => {
    const out = renderNotificationCopy(
      {
        title: "old english",
        body: "old english body",
        messageKey: "notifications.kind.mention",
        messageParams: null,
      },
      "en",
    );
    expect(out.title).toBe("You were mentioned in a comment");
    expect(out.body).toBe("Someone @mentioned you in a comment on a content item.");
  });

  it("interpolates the {reason} param into the publication failed body", () => {
    const out = renderNotificationCopy(
      {
        title: "Publish failure",
        body: "A channel failed to publish: hardcoded.",
        messageKey: "notifications.publication.failed",
        messageParams: { reason: "Meta OAuth 401" },
      },
      "ar",
    );
    expect(out.title).toBe("فشل النشر");
    expect(out.body).toBe("فشل نشر إحدى القنوات: Meta OAuth 401.");
  });

  it("falls back to the stored copy when the catalog key is missing (loud [key] wrapper)", () => {
    const out = renderNotificationCopy(
      {
        title: "Stored English title",
        body: "Stored English body",
        messageKey: "notifications.kind.does_not_exist",
        messageParams: null,
      },
      "ar",
    );
    // The loud-key wrapper triggers the fallback so the rendered
    // copy is the stored English text — keeps the bell readable
    // in production while still flagging the gap in the catalog
    // parity test.
    expect(out).toEqual({ title: "Stored English title", body: "Stored English body" });
  });

  it("interpolates per-event params (review_request with {title})", () => {
    const out = renderNotificationCopy(
      {
        title: `Review requested: "My Item"`,
        body: "A planner submitted this item for content review.",
        messageKey: "notifications.events.review_request",
        messageParams: { title: "My Item" },
      },
      "ar",
    );
    expect(out.title).toBe("طلب مراجعة: «My Item»");
    expect(out.body).toBe("قدّم المخطط هذا العنصر لمراجعة المحتوى.");
  });

  it("interpolates per-event params (changes_requested_with_reason)", () => {
    const out = renderNotificationCopy(
      {
        title: `Changes requested: "My Item"`,
        body: "Reviewer feedback: please shorten the caption",
        messageKey: "notifications.events.changes_requested_with_reason",
        messageParams: { title: "My Item", reason: "please shorten the caption" },
      },
      "ar",
    );
    expect(out.body).toBe("ملاحظات المراجع: please shorten the caption");
  });
});
