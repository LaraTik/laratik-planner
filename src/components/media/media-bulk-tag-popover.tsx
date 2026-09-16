"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { Tag, X } from "lucide-react";

/**
 * Bulk-tag popover. Plan §3.8 rule 4.
 *
 * Lets the user type a tag and submit it as `add`; existing tags on
 * each asset surface as removable chips with `remove` calls. Each
 * action calls `POST /api/media/assets/tags`.
 */
export function MediaBulkTagPopover({
  assetIds,
  onCompleted,
}: {
  assetIds: string[];
  onCompleted?: (updated: number, failures: Array<{ assetId: string; reason: string }>) => void;
}) {
  const t = useLocaleT();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [tag, setTag] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);

  async function addTag() {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/media/assets/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds, add: [trimmed] }),
      });
      if (!response.ok) throw new Error("tag add failed");
      const payload = (await response.json()) as {
        updated: number;
        failures: Array<{ assetId: string; reason: string }>;
      };
      setTags([...tags, trimmed]);
      setTag("");
      onCompleted?.(payload.updated, payload.failures);
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(target: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/media/assets/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds, remove: [target] }),
      });
      if (!response.ok) throw new Error("tag remove failed");
      const payload = (await response.json()) as {
        updated: number;
        failures: Array<{ assetId: string; reason: string }>;
      };
      setTags(tags.filter((t) => t !== target));
      onCompleted?.(payload.updated, payload.failures);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          <Tag className="me-2 h-4 w-4" aria-hidden="true" />
          {t("media.bulk.tag")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="flex flex-wrap gap-1 pb-2">
          {tags.length === 0 ? (
            <span className="text-label text-fg-muted">{t("media.tagEditor.empty")}</span>
          ) : (
            tags.map((tagValue) => (
              <button
                key={tagValue}
                type="button"
                onClick={() => removeTag(tagValue)}
                className="bg-surface-subtle text-fg-secondary hover:bg-danger-subtle inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs"
                aria-label={t("media.tagEditor.removeLabel", { tag: tagValue })}
              >
                {tagValue}
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            ))
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void addTag();
          }}
          className="flex gap-2"
        >
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder={t("media.tagEditor.addPlaceholder")}
            maxLength={64}
            className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring min-h-11 flex-1 rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:outline-none"
          />
          <Button type="submit" size="sm" disabled={busy || !tag.trim()}>
            {t("media.tagEditor.addLabel")}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
