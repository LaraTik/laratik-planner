"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllReadAction, markReadAction } from "@/app/(app)/actions";
import {
  NotificationItem,
  type NotificationListItem,
} from "@/components/app-shell/notification-item";
import { useLocaleCode } from "@/components/i18n/locale-provider";

type NotificationRow = NotificationListItem;

/**
 * Localized copy bundle for the notifications bell. The Server
 * Component parent resolves every string through the message
 * catalog and hands the bundle to the client. The client never
 * reaches for the catalog itself.
 */
export type NotificationsCopy = {
  triggerAriaLabel: string;
  triggerAriaLabelUnread: string;
  dialogAriaLabel: string;
  title: string;
  markAllRead: string;
  empty: string;
};

/**
 * Notifications bell — bell icon with unread badge, plus a popover
 * listing the latest 10 in-app notifications.
 *
 * UX details:
 *  - Outside click + Escape close the popover; focus returns to the bell.
 *  - On open, focus moves to the "Mark all read" button if there are
 *    unread items, or to the dialog itself otherwise (so screen readers
 *    announce it and arrow keys work).
 *  - Marking one or all read is **optimistic**: the UI updates immediately
 *    and rolls back if the server action throws.
 *  - The popover is right-aligned on desktop, full-width on mobile.
 */
export function NotificationsBell({
  initial,
  initialUnread,
  badgeTestId,
  copy,
}: {
  initial: NotificationRow[];
  initialUnread: number;
  badgeTestId?: string;
  copy: NotificationsCopy;
}) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationRow[]>(initial);
  const [unread, setUnread] = React.useState<number>(initialUnread);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const firstActionRef = React.useRef<HTMLButtonElement | null>(null);
  const router = useRouter();

  // FEAT-AUDIT-R3 — background poll. The bell fetches the
  // notifications + unread count once on the server (passed in
  // via props) and never refreshes until the user navigates or
  // clicks a server action that calls `revalidatePath("/app")`.
  // A long-running page (planning detail, brand kit, calendar)
  // can sit with a stale badge indefinitely. A 30s `router.refresh`
  // is the cheapest fix; it re-fetches the layout's RSC tree
  // (which includes the fresh `listNotificationsForUser` /
  // `countUnreadNotifications` reads) without disturbing the
  // popover state. The interval is cleared when the component
  // unmounts and paused while the popover is open so the user
  // doesn't see rows they just dismissed flicker.
  React.useEffect(() => {
    if (open) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [open, router]);

  // F22 — keyboard shortcut. Cmd/Ctrl+J (or plain "j" outside
  // a text input) toggles the bell popover. The popover already
  // has Escape handling (line 97) and the open-effect below
  // moves focus to the dialog, so the toggle is symmetric.
  // The handler only fires when the user is NOT typing into a
  // text input or contenteditable region — opening the bell
  // while writing a comment would be a papercut.
  React.useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const isToggle = (e.key === "j" || e.key === "J") && (e.metaKey || e.ctrlKey);
      const isPlainJ = e.key === "j" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
      if (isToggle || isPlainJ) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click + Escape; restore focus to the trigger.
  React.useEffect(() => {
    if (!open) return;
    const triggerAtOpen = triggerRef.current;
    const onDown = (e: MouseEvent) => {
      if (
        triggerAtOpen?.contains(e.target as Node) ||
        dialogRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      triggerAtOpen?.focus();
    };
  }, [open]);

  // Move focus into the dialog when it opens.
  React.useEffect(() => {
    if (!open) return;
    // Defer to the next frame so the popover is mounted + tabbable.
    const id = window.requestAnimationFrame(() => {
      if (unread > 0 && firstActionRef.current) {
        firstActionRef.current.focus();
      } else {
        dialogRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, unread]);

  /**
   * Optimistic mark-all. Snapshots the previous state, attempts the
   * server action, and rolls back on failure.
   */
  const markAllRead = async () => {
    const prevItems = items;
    const prevUnread = unread;
    const now = new Date().toISOString();
    setItems((cur) => cur.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    setUnread(0);
    try {
      await markAllReadAction();
    } catch (err) {
      Sentry.captureException(err, { tags: { scope: "notifications.markAllRead" } });
      setItems(prevItems);
      setUnread(prevUnread);
    }
  };

  /**
   * Optimistic mark-one. Same rollback pattern.
   *
   * The `wasUnread` value is read from the latest committed `items`
   * snapshot before the updater fires. The previous implementation
   * mutated a `let wasUnread` variable inside the `setItems` updater,
   * which is unsafe under React Strict Mode (the updater can run
   * twice and the second invocation observes the first's mutation,
   * making the unread counter decrement twice on a single click).
   * Pre-computing the boolean keeps the optimistic update a pure
   * function of the prior state.
   */
  const markOne = async (id: string) => {
    const prevItems = items;
    const prevUnread = unread;
    const target = items.find((n) => n.id === id);
    const wasUnread = target ? !target.readAt : false;
    const now = new Date().toISOString();
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? now } : n)));
    setUnread((n) => (wasUnread ? Math.max(0, n - 1) : n));
    try {
      await markReadAction({ ids: [id] });
    } catch (err) {
      Sentry.captureException(err, { tags: { scope: "notifications.markRead" } });
      setItems(prevItems);
      setUnread(prevUnread);
    }
  };

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label={
          unread > 0
            ? copy.triggerAriaLabelUnread.replace("{count}", String(unread))
            : copy.triggerAriaLabel
        }
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-live="polite"
            aria-atomic="true"
            data-testid={badgeTestId}
            className="bg-danger text-label text-on-danger absolute -end-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="false"
          aria-label={copy.dialogAriaLabel}
          tabIndex={-1}
          className="border-border bg-surface fixed inset-x-2 top-14 z-50 max-h-[calc(100vh-4rem)] overflow-hidden rounded-[var(--radius-card)] border shadow-lg focus:outline-none sm:absolute sm:inset-auto sm:end-0 sm:top-auto sm:mt-2 sm:w-96 sm:max-w-[calc(100vw-2rem)]"
        >
          <header className="border-border flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-body text-fg-primary font-semibold">{copy.title}</h3>
            {unread > 0 ? (
              <Button ref={firstActionRef} variant="ghost" size="sm" onClick={markAllRead}>
                <CheckCheck className="h-3 w-3" aria-hidden="true" />
                {copy.markAllRead}
              </Button>
            ) : null}
          </header>
          {items.length === 0 ? (
            <p className="text-body text-fg-muted p-4 text-center">{copy.empty}</p>
          ) : (
            <R13GroupedNotificationList
              items={items}
              onMarkOne={(id) => void markOne(id)}
              onActionClick={() => setOpen(false)}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * R13 — day grouping. The bell previously rendered notifications
 * as a flat list; once a user has 30+ unread rows, scanning
 * becomes hard. We group the rows by Today / Yesterday / Earlier
 * using the user's local timezone (the list is rendered
 * client-side so the server-rendered `Date` string is in the
 * recipient's locale). The grouping is computed in render —
 * cheap (O(n)) and only runs when the popover is open.
 */
function dayBucketLabel(date: Date, now: Date, locale: string): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / (1000 * 60 * 60 * 24),
  );
  const t = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return t.format(date);
  return t.format(date);
}

function R13GroupedNotificationList({
  items,
  onMarkOne,
  onActionClick,
}: {
  items: NotificationRow[];
  onMarkOne: (id: string) => void;
  onActionClick: (id: string) => void;
}) {
  const locale = useLocaleCode();
  // Group by the day-bucket label, preserving the items' original
  // sort order (server returns newest-first via `desc(createdAt)`).
  const groups: { label: string; rows: NotificationRow[] }[] = [];
  const now = new Date();
  for (const n of items) {
    const label = dayBucketLabel(new Date(n.createdAt), now, locale);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(n);
    else groups.push({ label, rows: [n] });
  }
  return (
    <ul
      className="max-h-[calc(100vh-8rem)] overflow-y-auto sm:max-h-96"
      role="list"
      data-testid="notifications-bell-grouped-list"
    >
      {groups.map((g) => (
        <li key={g.label} data-testid={`notifications-bell-day-group-${g.label}`}>
          <div className="text-label text-fg-muted bg-surface-subtle sticky top-0 z-10 px-3 py-1 font-semibold tracking-wide uppercase">
            {g.label}
          </div>
          <ul role="list" className="divide-y">
            {g.rows.map((n) => (
              <NotificationItem
                key={n.id}
                item={n}
                onMarkRead={(id) => onMarkOne(id)}
                onActionClick={() => onActionClick(n.id)}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
