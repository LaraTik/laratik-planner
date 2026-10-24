"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  AdvertisingEntityType,
  AdvertisingTaxonomyLabelType,
} from "@/lib/advertising/reporting-metadata";

export type AdvertisingLocalTagView = {
  id: string;
  entityType: AdvertisingEntityType;
  entityId: string;
  labelType: AdvertisingTaxonomyLabelType;
  tagValue: string;
};

type Labels = {
  title: string;
  add: string;
  remove: string;
  placeholder: string;
  topic: string;
  brand: string;
  platform: string;
  objective: string;
  language: string;
  month: string;
  error: string;
};
const labelTypes: AdvertisingTaxonomyLabelType[] = [
  "topic",
  "brand",
  "platform",
  "objective",
  "language",
  "month",
];

export function AdvertisingTaxonomyEditor({
  workspaceSlug,
  accountId,
  entityType,
  entityId,
  initialTags,
  labels,
}: {
  workspaceSlug: string;
  accountId: string;
  entityType: AdvertisingEntityType;
  entityId: string;
  initialTags: readonly AdvertisingLocalTagView[];
  labels: Labels;
}) {
  const [tags, setTags] = useState([...initialTags]);
  const [labelType, setLabelType] = useState<AdvertisingTaxonomyLabelType>("topic");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const textForType = (type: AdvertisingTaxonomyLabelType) => labels[type];

  const add = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/advertising/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: workspaceSlug,
          accountId,
          entityType,
          entityId,
          labelType,
          tagValue: value,
        }),
      });
      if (!response.ok) throw new Error("tag_failed");
      const payload = (await response.json()) as { tag?: AdvertisingLocalTagView | null };
      if (payload.tag && !tags.some((tag) => tag.id === payload.tag?.id))
        setTags((current) => [...current, payload.tag!]);
      setValue("");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tag: AdvertisingLocalTagView) => {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/advertising/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: workspaceSlug,
          accountId,
          entityType,
          entityId,
          labelType: tag.labelType,
          tagValue: tag.tagValue,
        }),
      });
      if (!response.ok) throw new Error("tag_failed");
      setTags((current) => current.filter((candidate) => candidate.id !== tag.id));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="border-border-subtle space-y-2 border-t px-3 py-2"
      data-testid={`advertising-taxonomy-${entityId}`}
    >
      <p className="text-label text-fg-muted font-semibold">{labels.title}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag.id} variant="outline" className="gap-1 pe-1">
            {textForType(tag.labelType)}: {tag.tagValue}
            <button
              type="button"
              aria-label={`${labels.remove}: ${tag.tagValue}`}
              onClick={() => void remove(tag)}
              disabled={busy}
              className="focus-visible:ring-focus-ring inline-flex min-h-6 min-w-6 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={labels.title}
          value={labelType}
          onChange={(event) => setLabelType(event.target.value as AdvertisingTaxonomyLabelType)}
          className="border-border bg-surface text-label text-fg-primary min-h-10 rounded-[var(--radius-control)] border px-2"
        >
          {labelTypes.map((type) => (
            <option key={type} value={type}>
              {textForType(type)}
            </option>
          ))}
        </select>
        <Input
          className="min-h-10 min-w-32 flex-1"
          value={value}
          maxLength={80}
          placeholder={labels.placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void add();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void add()}
          disabled={!value.trim() || busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
          {labels.add}
        </Button>
      </div>
      {error ? (
        <p className="text-label text-danger" role="alert">
          {labels.error}
        </p>
      ) : null}
    </div>
  );
}
