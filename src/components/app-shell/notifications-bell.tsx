"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllReadAction, markReadAction } from "@/app/(app)/actions";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
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
}: {
  initial: NotificationRow[];
  initialUnread: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationRow[]>(initial);
  const [unread, setUnread] = React.useState<number>(initialUnread);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const firstActionRef = React.useRef<HTMLButtonElement | null>(null);

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
      console.error("[notifications] markAllRead failed", err);
      setItems(prevItems);
      setUnread(prevUnread);
    }
  };

  /**
   * Optimistic mark-one. Same rollback pattern.
   */
  const markOne = async (id: string) => {
    const prevItems = items;
    const prevUnread = unread;
    const now = new Date().toISOString();
    let wasUnread = false;
    setItems((cur) =>
      cur.map((n) => {
        if (n.id !== id) return n;
        wasUnread = !n.readAt;
        return { ...n, readAt: n.readAt ?? now };
      }),
    );
    setUnread((n) => (wasUnread ? Math.max(0, n - 1) : n));
    try {
      await markReadAction({ ids: [id] });
    } catch (err) {
      console.error("[notifications] markRead failed", err);
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
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            data-testid="unread-badge"
            className="bg-danger text-label text-on-danger absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-bold text-white"
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
          aria-label="Notifications"
          tabIndex={-1}
          className="border-border bg-surface fixed inset-x-2 top-14 z-50 max-h-[calc(100vh-4rem)] overflow-hidden rounded-[var(--radius-card)] border shadow-lg focus:outline-none sm:absolute sm:inset-auto sm:top-auto sm:right-0 sm:left-auto sm:mt-2 sm:w-96 sm:max-w-[calc(100vw-2rem)]"
        >
          <header className="border-border flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-body text-fg-primary font-semibold">Notifications</h3>
            {unread > 0 ? (
              <Button ref={firstActionRef} variant="ghost" size="sm" onClick={markAllRead}>
                <CheckCheck className="h-3 w-3" aria-hidden="true" />
                Mark all read
              </Button>
            ) : null}
          </header>
          {items.length === 0 ? (
            <p className="text-body text-fg-muted p-4 text-center">No notifications yet.</p>
          ) : (
            <ul
              className="max-h-[calc(100vh-8rem)] divide-y overflow-y-auto sm:max-h-96"
              role="list"
            >
              {items.map((n) => (
                <li
                  key={n.id}
                  className={[
                    "hover:bg-canvas flex items-start gap-2 px-3 py-2",
                    n.readAt ? "" : "bg-primary-subtle/20",
                  ].join(" ")}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-fg-primary font-semibold">{n.title}</p>
                    <p className="text-label text-fg-secondary">{n.body}</p>
                    <p className="text-label text-fg-muted mt-0.5">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                    {n.actionUrl ? (
                      <Link
                        href={n.actionUrl}
                        className="text-label text-primary hover:underline"
                        onClick={() => {
                          if (!n.readAt) {
                            void markOne(n.id);
                          }
                          setOpen(false);
                        }}
                      >
                        Open →
                      </Link>
                    ) : null}
                  </div>
                  {!n.readAt ? (
                    <button
                      type="button"
                      aria-label="Mark read"
                      onClick={() => void markOne(n.id)}
                      className="text-fg-muted hover:text-fg-primary"
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
