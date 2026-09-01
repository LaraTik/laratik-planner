import { describe, expect, it } from "vitest";

import { renderNotificationEmailCopy } from "@/lib/notifications/email-copy";

describe("renderNotificationEmailCopy", () => {
  it("renders stored notification keys in the recipient locale", () => {
    expect(
      renderNotificationEmailCopy(
        {
          title: "You were mentioned in a comment",
          body: "Someone mentioned you.",
          messageKey: "notifications.kind.mention",
        },
        "ar",
      ),
    ).toEqual({
      subject: "تمت الإشارة إليك في تعليق",
      text: "أشار إليك أحدهم في تعليق على عنصر محتوى.",
    });
  });

  it("keeps persisted copy when no message key exists", () => {
    expect(
      renderNotificationEmailCopy({ title: "Legacy title", body: "Legacy body" }, "ar"),
    ).toEqual({ subject: "Legacy title", text: "Legacy body" });
  });
});
