"use client";

import * as React from "react";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { Calendar, FileText, MessageSquare, Palette } from "lucide-react";
import Link from "next/link";

type LinkRow = {
  id: string;
  targetType: "content_item" | "delivery" | "comment" | "brand_asset";
  targetId: string;
  label: string;
  href: string;
  clientVisible: boolean;
};

/**
 * "In use by" panel. Plan §3.3.
 *
 * Fetches `/api/media/assets/[id]/links` and renders a list grouped
 * by target type. Privacy (decision G) is honoured server-side; this
 * component never sees a link the actor isn't allowed to see.
 */
export function MediaAssetLinkList({ assetId, agencyId }: { assetId: string; agencyId: string }) {
  const t = useLocaleT();
  const [rows, setRows] = React.useState<LinkRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/media/assets/${assetId}/links?agencyId=${agencyId}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("links fetch failed");
        const payload = (await response.json()) as { links: LinkRow[] };
        if (!cancelled) setRows(payload.links);
      } catch {
        if (!cancelled) setError("links_failed");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [assetId, agencyId]);

  if (error) {
    return (
      <p className="text-label text-danger" role="alert">
        {t("media.manageError")}
      </p>
    );
  }

  if (rows === null) {
    return (
      <ul className="m-0 list-none p-0" aria-busy="true">
        <li className="bg-surface-subtle h-10 animate-pulse rounded-[var(--radius-control)]" />
        <li className="bg-surface-subtle mt-2 h-10 animate-pulse rounded-[var(--radius-control)]" />
      </ul>
    );
  }

  if (rows.length === 0) {
    return <p className="text-label text-fg-muted">{t("media.inUseBy.none")}</p>;
  }

  return (
    <ul className="m-0 list-none p-0">
      {rows.map((row) => (
        <li
          key={row.id}
          className="border-border flex items-center gap-2 border-b py-2 last:border-b-0"
        >
          {row.targetType === "content_item" ? (
            <Calendar className="text-fg-muted h-4 w-4" aria-hidden="true" />
          ) : row.targetType === "delivery" ? (
            <FileText className="text-fg-muted h-4 w-4" aria-hidden="true" />
          ) : row.targetType === "comment" ? (
            <MessageSquare className="text-fg-muted h-4 w-4" aria-hidden="true" />
          ) : (
            <Palette className="text-fg-muted h-4 w-4" aria-hidden="true" />
          )}
          <Link href={row.href} className="text-body text-fg-primary hover:underline">
            {row.label}
          </Link>
          {!row.clientVisible ? (
            <span className="bg-surface text-fg-muted rounded-full px-2 py-0.5 text-[10px] font-medium">
              {t("media.inUseBy.clientVisibleOff")}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
