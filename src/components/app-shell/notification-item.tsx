"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";

/**
 * Minimal serialised shape for a single notification row. Dates are
 * ISO strings because the bell is a client component and can't
 * serialise Date objects across the server→client boundary.
 */
export type NotificationListItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export interface NotificationItemProps {
  item: NotificationListItem;
  /**
   * Called when the user clicks the "Mark read" button. The bell
   * handles optimistic update + server-action rollback.
   */
  onMarkRead: (id: string) => void;
  /**
   * Called when the user clicks the "Open →" action link (if any).
   * The bell typically uses this to close the popover after a click.
   */
  onActionClick?: (id: string) => void;
}

/**
 * NotificationItem — one row in the notifications popover. Renders the
 * title, body, localised createdAt, an optional "Open →" action link,
 * and an optional "Mark read" button. Unread items get a subtle
 * primary-subtle background highlight.
 *
 * Extracted from `NotificationsBell` so the same row shape is
 * available to the future mobile notifications surface (Stitch
 * `d54ed2b8_studioflow---inbox---mobile-list`) and any other list
 * that surfaces in-app notifications.
 */
export function NotificationItem({ item, onMarkRead, onActionClick }: NotificationItemProps) {
  const isUnread = !item.readAt;
  const locale = useLocaleCode();
  const t = useLocaleT();
  const createdAt = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
  }).format(new Date(item.createdAt));
  return (
    <li
      className={[
        "hover:bg-canvas flex items-start gap-2 px-3 py-2",
        isUnread ? "bg-primary-subtle/20" : "",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <p className="text-body text-fg-primary font-semibold">{item.title}</p>
        <p className="text-label text-fg-secondary">{item.body}</p>
        <p className="text-label text-fg-muted mt-0.5">{createdAt}</p>
        {item.actionUrl ? (
          <Link
            href={item.actionUrl}
            className="text-label text-primary hover:underline"
            onClick={() => {
              if (isUnread) onMarkRead(item.id);
              onActionClick?.(item.id);
            }}
          >
            {t("notifications.open")} →
          </Link>
        ) : null}
      </div>
      {isUnread ? (
        <button
          type="button"
          aria-label={t("notifications.markRead")}
          onClick={() => onMarkRead(item.id)}
          className="text-fg-muted hover:text-fg-primary"
        >
          <Check className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}
