"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { recordPublicationAction } from "../actions";
import { Package, Send, Info } from "lucide-react";

type Channel = {
  id: string;
  accountName: string;
  platform: string;
  /**
   * ISO 8601 string (or null). The page is a Server Component — Date
   * objects are not in React's RSC serialisation surface, so the
   * source-of-truth Date from `getContentItem` is converted to a
   * string in `page.tsx` before crossing the boundary. A raw Date here
   * would throw "An error occurred in the Server Components render"
   * (minified to React #441) on the post-action revalidation re-render.
   */
  plannedPublishAtOverride: string | null;
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
  contentItemId,
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
  const [formError, setFormError] = useState<string | null>(null);
  const canRecord = isPublisher || isManager;
  const hasChannels = channels.length > 0;

  return (
    <Card data-testid="publishing-section">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Publishing</CardTitle>
          <CardDescription>
            {hasChannels
              ? "Per-channel publication status. Add or remove channels, then record outcomes as you go live."
              : "Add at least one social channel to this content item to record publication outcomes."}
          </CardDescription>
        </div>
        {/* Publish Package — always discoverable, never silently hidden.
            When the user can't act on it (no channels yet, or not a
            publisher / manager), the link renders a tooltip explaining
            why instead of disappearing from the UI. The same `disabled`
            affordance pattern is used for other "no access yet"
            surfaces (e.g. the workflow bar's "Assign designer"
            trigger). */}
        <span className="group relative">
          <Link
            href={`/app/w/${workspaceSlug}/planning/${contentItemId}/publish`}
            className="text-primary focus-visible:ring-focus-ring text-body inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid="publish-package-link"
            aria-describedby={!hasChannels ? "publish-package-disabled-help" : undefined}
          >
            <Package className="h-4 w-4" aria-hidden="true" />
            Configure publish package
          </Link>
          {!hasChannels ? (
            <span
              id="publish-package-disabled-help"
              role="tooltip"
              className="border-border bg-surface text-fg-primary text-label pointer-events-none invisible absolute top-full right-0 z-20 mt-2 w-64 rounded-[var(--radius-control)] border p-2 opacity-0 shadow-md transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
            >
              Add at least one channel to this content item first — the publish package configures
              what gets sent to each channel.
            </span>
          ) : null}
        </span>
      </div>
      {!hasChannels ? (
        <div
          className="border-border bg-surface-subtle flex items-start gap-3 rounded-[var(--radius-control)] border border-dashed p-3"
          data-testid="publishing-no-channels"
        >
          <Info className="text-fg-secondary mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="text-body text-fg-secondary space-y-1">
            <p>
              No channels yet. Open the publish package to pick which social accounts this item
              should be published to, then come back here to record outcomes as each channel goes
              live.
            </p>
          </div>
        </div>
      ) : null}
      {hasChannels ? (
        <ul className="divide-border divide-y" data-testid="publishing-channels-list">
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
                {pub?.note ? (
                  <p className="text-label text-fg-muted mt-1">Note: {pub.note}</p>
                ) : null}
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
                        setFormError(null);
                        // Read the action's `{ error?: string }` return value
                        // rather than relying on a thrown error — Next.js 16
                        // hashes thrown action errors into a digest in the
                        // RSC response and drops the original message.
                        const result = await recordPublicationAction({
                          workspaceSlug,
                          contentItemChannelId: ch.id,
                          status: fd.get("status") as "published" | "skipped" | "failed",
                          ...(publishedUrl ? { publishedUrl } : {}),
                          ...(note ? { note } : {}),
                          ...(failureReason ? { failureReason } : {}),
                        });
                        if (result?.error) {
                          setFormError(result.error);
                        } else {
                          setOpenChannel(null);
                        }
                      });
                    }}
                    className="border-border bg-surface-subtle mt-3 space-y-2 rounded-[var(--radius-control)] border p-3"
                  >
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                      <div>
                        <label
                          htmlFor={`publication-status-${ch.id}`}
                          className="text-label mb-1 block font-medium"
                        >
                          Outcome
                        </label>
                        <select
                          id={`publication-status-${ch.id}`}
                          name="status"
                          className="border-border bg-surface text-body min-h-11 w-full rounded-[var(--radius-control)] border px-2 py-1"
                          defaultValue="published"
                        >
                          <option value="published">Published</option>
                          <option value="skipped">Skipped</option>
                          <option value="failed">Failed</option>
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <label
                          htmlFor={`published-url-${ch.id}`}
                          className="text-label mb-1 block font-medium"
                        >
                          Published URL
                        </label>
                        <Input
                          id={`published-url-${ch.id}`}
                          type="url"
                          name="publishedUrl"
                          placeholder="https://…"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor={`publication-note-${ch.id}`}
                        className="text-label mb-1 block font-medium"
                      >
                        Skip note
                      </label>
                      <Input id={`publication-note-${ch.id}`} type="text" name="note" />
                    </div>
                    <div>
                      <label
                        htmlFor={`publication-failure-${ch.id}`}
                        className="text-label mb-1 block font-medium"
                      >
                        Failure reason
                      </label>
                      <Input id={`publication-failure-${ch.id}`} type="text" name="failureReason" />
                    </div>
                    {formError ? (
                      <p role="alert" className="text-body text-danger">
                        {formError}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={pending}>
                        {pending ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpenChannel(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
