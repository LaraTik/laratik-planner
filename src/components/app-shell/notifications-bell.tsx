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
 * Notifications bell — shows the unread count, a popover with the last
 * 10 in-app notifications, and a "mark all read" action.
 *
 * Initial state is rendered server-side (the AppShell passes the first
 * 10 in). We re-fetch on mount via a small inline fetch so the badge
 * updates after a dispatch cycle.
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
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    await markAllReadAction();
    setItems((cur) => cur.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
  };

  const markOne = async (id: string) => {
    await markReadAction({ ids: [id] });
    setItems((cur) =>
      cur.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
    );
    setUnread((n) => Math.max(0, n - 1));
  };

  return (
    <div className="relative" ref={popoverRef}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="bg-danger text-label text-on-danger absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="border-border bg-surface absolute right-0 z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border shadow-lg"
        >
          <header className="border-border flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-body text-fg-primary font-semibold">Notifications</h3>
            {unread > 0 ? (
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                <CheckCheck className="h-3 w-3" aria-hidden="true" />
                Mark all read
              </Button>
            ) : null}
          </header>
          {items.length === 0 ? (
            <p className="text-body text-fg-muted p-4 text-center">No notifications yet.</p>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto" role="list">
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
                        onClick={() => markOne(n.id)}
                      >
                        Open →
                      </Link>
                    ) : null}
                  </div>
                  {!n.readAt ? (
                    <button
                      type="button"
                      aria-label="Mark read"
                      onClick={() => markOne(n.id)}
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
