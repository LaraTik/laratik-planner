"use client";

import * as React from "react";
import { BookmarkPlus, Check, ChevronDown, Filter, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocaleT } from "@/components/i18n/locale-provider";

type Vertical = "fashion" | "food" | "tech" | "beauty" | "finance" | "travel" | "fitness";
const VERTICALS: ReadonlyArray<{ value: Vertical; label: string }> = [
  { value: "fashion", label: "Fashion" },
  { value: "food", label: "Food" },
  { value: "tech", label: "Tech" },
  { value: "beauty", label: "Beauty" },
  { value: "finance", label: "Finance" },
  { value: "travel", label: "Travel" },
  { value: "fitness", label: "Fitness" },
];

type SavedFilter = {
  id: string;
  name: string;
  shareScope: "private" | "workspace";
  payload: { vertical: Vertical | "all" };
};

const STORAGE_KEY = "laratik.trends.savedFilters";

function readSaved(): SavedFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedFilter[]) : [];
  } catch {
    return [];
  }
}

function writeSaved(filters: SavedFilter[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Saved Filters — three controls: filters button, save button, and
 * the saved-filters dropdown. v1 stores filters in `localStorage`
 * (the API route in `app/api/trends/saved-filters/route.ts` exposes
 * the server shape for future persistence).
 */
export function SavedFilters() {
  const t = useLocaleT();
  const [vertical, setVertical] = React.useState<Vertical | "all">("all");
  const [saved, setSaved] = React.useState<SavedFilter[]>(() => readSaved());
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [filterName, setFilterName] = React.useState("");
  const [shareConfirmed, setShareConfirmed] = React.useState<string | null>(null);
  void shareConfirmed;

  const handleSave = () => {
    if (!filterName.trim()) return;
    const next: SavedFilter = {
      id: crypto.randomUUID(),
      name: filterName.trim(),
      shareScope: "private",
      payload: { vertical },
    };
    const updated = [next, ...saved].slice(0, 20);
    setSaved(updated);
    writeSaved(updated);
    setFilterName("");
    setSaveOpen(false);
  };

  const handleShare = (id: string) => {
    const updated = saved.map((f) =>
      f.id === id ? { ...f, shareScope: "workspace" as const } : f,
    );
    setSaved(updated);
    writeSaved(updated);
    setShareConfirmed(id);
    setTimeout(() => setShareConfirmed(null), 2_500);
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" data-testid="trends-filters-button">
            <Filter className="h-4 w-4" aria-hidden="true" />
            {t("trends.filters.title") || "Filters"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t("trends.filters.vertical") || "Vertical"}</DropdownMenuLabel>
          <select
            data-testid="filter-vertical"
            value={vertical}
            onChange={(e) => setVertical(e.target.value as Vertical | "all")}
            className="border-border bg-surface-card mx-1 w-[calc(100%-0.5rem)] rounded border px-2 py-1 text-sm"
          >
            <option value="all">{t("trends.filters.all") || "All verticals"}</option>
            {VERTICALS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <button
              type="button"
              onClick={() => setSaveOpen(true)}
              data-testid="filter-save"
              className="flex w-full items-center gap-2"
            >
              <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
              {t("trends.filters.save") || "Save filter"}
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" data-testid="saved-filters-button">
            {t("trends.savedFilters.title") || "Saved"}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64" data-testid="saved-filters-dropdown">
          <DropdownMenuLabel>{t("trends.savedFilters.label") || "Saved filters"}</DropdownMenuLabel>
          {saved.length === 0 ? (
            <p className="text-label text-fg-muted px-2 py-3 text-sm">
              {t("trends.savedFilters.empty") || "No saved filters yet."}
            </p>
          ) : (
            saved.map((f) => (
              <DropdownMenuItem
                key={f.id}
                className="flex flex-col items-start gap-1"
                data-testid={`saved-filter-${f.id}`}
              >
                <span className="text-body text-fg-primary font-medium">{f.name}</span>
                <span className="text-label text-fg-muted text-xs">
                  {f.payload.vertical} · {f.shareScope}
                </span>
                {f.shareScope === "private" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      handleShare(f.id);
                    }}
                    data-testid="filter-share-workspace"
                    className="mt-1"
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("trends.savedFilters.share") || "Share with workspace"}
                  </Button>
                ) : (
                  <span
                    className="text-label text-success flex items-center gap-1"
                    data-testid="filter-share-confirmed"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("trends.savedFilters.shared") || "Shared"}
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("trends.filters.saveTitle") || "Save filter"}</DialogTitle>
            <DialogDescription>
              {t("trends.filters.saveBody") || "Name this filter so you can apply it again later."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="filter-name">{t("trends.filters.name") || "Name"}</Label>
            <Input
              id="filter-name"
              data-testid="filter-save-name"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder={t("trends.filters.namePlaceholder") || "My fashion pulse"}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>
              {t("common.cancel") || "Cancel"}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleSave}
              disabled={!filterName.trim()}
              data-testid="filter-save-confirm"
            >
              {t("trends.filters.save") || "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
