"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { recordPublicationAction } from "../actions";
import { Send } from "lucide-react";

type Channel = {
  id: string;
  accountName: string;
  platform: string;
  plannedPublishAtOverride: Date | null;
};
type Publication = {
  id: string;
  contentItemChannelId: string;
  status: "pending" | "published" | "failed" | "skipped";
  publishedUrl: string | null;
  note: string | null;
  failureReason: string | null;
};

export function PublishingSection({
  workspaceSlug,
  channels,
  publications,
  isPublisher,
  isManager,
}: {
  workspaceSlug: string;
  contentItemId: string;
  channels: Channel[];
  publications: Publication[];
  isPublisher: boolean;
  isManager: boolean;
}) {
  const [openChannel, setOpenChannel] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canRecord = isPublisher || isManager;

  if (channels.length === 0) return null;

  return (
    <Card>
      <CardTitle className="mb-3">Publishing (per channel)</CardTitle>
      <ul className="divide-border divide-y">
        {channels.map((ch) => {
          const pub = publications.find((p) => p.contentItemChannelId === ch.id);
          return (
            <li key={ch.id} className="py-3">
              <div className="flex items-center gap-3">
                <Badge variant="outline">{ch.platform}</Badge>
                <span className="text-body text-fg-primary font-semibold">{ch.accountName}</span>
                <Badge
                  variant={
                    pub?.status === "published"
                      ? "success"
                      : pub?.status === "skipped"
                        ? "default"
                        : pub?.status === "failed"
                          ? "danger"
                          : "info"
                  }
                >
                  {pub?.status ?? "pending"}
                </Badge>
                {canRecord ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setOpenChannel(openChannel === ch.id ? null : ch.id)}
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" /> Record
                  </Button>
                ) : null}
              </div>
              {pub?.publishedUrl ? (
                <p className="text-label text-fg-muted mt-1 break-all">
                  <a
                    href={pub.publishedUrl}
                    className="text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {pub.publishedUrl}
                  </a>
                </p>
              ) : null}
              {pub?.note ? <p className="text-label text-fg-muted mt-1">Note: {pub.note}</p> : null}
              {pub?.failureReason ? (
                <p className="text-label text-danger mt-1">Failure: {pub.failureReason}</p>
              ) : null}

              {openChannel === ch.id ? (
                <form
                  action={(fd) => {
                    const publishedUrl = (fd.get("publishedUrl") as string) || undefined;
                    const note = (fd.get("note") as string) || undefined;
                    const failureReason = (fd.get("failureReason") as string) || undefined;
                    start(async () => {
                      try {
                        await recordPublicationAction({
                          workspaceSlug,
                          contentItemChannelId: ch.id,
                          status: fd.get("status") as "published" | "skipped" | "failed",
                          ...(publishedUrl ? { publishedUrl } : {}),
                          ...(note ? { note } : {}),
                          ...(failureReason ? { failureReason } : {}),
                        });
                        setOpenChannel(null);
                      } catch (e) {
                        alert((e as Error).message);
                      }
                    });
                  }}
                  className="border-border bg-surface-subtle mt-3 space-y-2 rounded-[var(--radius-control)] border p-3"
                >
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <select
                      name="status"
                      className="border-border bg-surface text-body rounded-[var(--radius-control)] border px-2 py-1"
                      defaultValue="published"
                    >
                      <option value="published">Published</option>
                      <option value="skipped">Skipped</option>
                      <option value="failed">Failed</option>
                    </select>
                    <Input
                      type="url"
                      name="publishedUrl"
                      placeholder="https://… (if published)"
                      className="md:col-span-3"
                    />
                  </div>
                  <Input type="text" name="note" placeholder="Note (required if skipped)" />
                  <Input
                    type="text"
                    name="failureReason"
                    placeholder="Failure reason (required if failed)"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenChannel(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
