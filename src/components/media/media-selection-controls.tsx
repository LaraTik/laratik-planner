"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MediaCollectionActions } from "./media-collection-actions";
import { useLocaleT } from "@/components/i18n/locale-provider";

const EVENT_NAME = "laratik-media-selection-change";

export function MediaAssetSelectionCheckbox({
  assetId,
  title,
}: {
  assetId: string;
  title: string;
}) {
  const t = useLocaleT();
  const [checked, setChecked] = React.useState(false);
  return (
    <label className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)]">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => {
          const next = value === true;
          setChecked(next);
          document.dispatchEvent(
            new CustomEvent(EVENT_NAME, { detail: { assetId, checked: next } }),
          );
        }}
        aria-label={t("media.selectAsset", { name: title })}
      />
    </label>
  );
}

export function MediaSelectionToolbar() {
  const t = useLocaleT();
  const [selected, setSelected] = React.useState<string[]>([]);
  React.useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ assetId?: string; checked?: boolean }>).detail;
      if (!detail.assetId) return;
      setSelected((current) =>
        detail.checked
          ? [...new Set([...current, detail.assetId!])]
          : current.filter((id) => id !== detail.assetId),
      );
    };
    document.addEventListener(EVENT_NAME, onChange);
    return () => document.removeEventListener(EVENT_NAME, onChange);
  }, []);
  if (selected.length === 0) return null;
  return (
    <div
      className="border-border bg-primary-subtle flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
      data-testid="media-selection-toolbar"
    >
      <span className="text-body text-fg-primary font-semibold">
        {t("media.selectedCount", { count: selected.length })}
      </span>
      <div className="flex flex-wrap gap-2">
        <MediaCollectionActions
          assetIds={selected}
          title="selected-media"
          sourceType="library_selection"
          compact
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSelected([]);
            document
              .querySelectorAll<HTMLInputElement>('button[data-state="checked"]')
              .forEach((element) => element.click());
          }}
        >
          {t("media.clearSelection")}
        </Button>
      </div>
    </div>
  );
}
