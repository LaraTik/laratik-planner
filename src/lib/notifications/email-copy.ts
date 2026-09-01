import { tForResolved } from "@/messages";

type NotificationEmailInput = {
  title: string;
  body: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
};

/** Resolve notification email copy at send time for the recipient locale. */
export function renderNotificationEmailCopy(
  input: NotificationEmailInput,
  locale: string | null | undefined,
): { subject: string; text: string } {
  if (!input.messageKey) return { subject: input.title, text: input.body };

  const t = tForResolved(locale);
  const subject = t(`${input.messageKey}.title`, input.messageParams);
  const text = t(`${input.messageKey}.body`, input.messageParams);

  // Missing translations are intentionally loud in the catalog helper.
  // Keep the persisted copy as a safe fallback for old or incomplete keys.
  if (subject.startsWith("[") || text.startsWith("[")) {
    return { subject: input.title, text: input.body };
  }
  return { subject, text };
}
