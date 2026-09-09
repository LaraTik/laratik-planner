"use client";

import * as React from "react";
import { FileText, LayoutGrid, Trash2 } from "lucide-react";
import Link from "next/link";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Board = { id: string; name: string; description: string | null };
type BoardItem = {
  savedAt: string;
  signal: { id: string; label: string; sourceUrl: string | null };
};

export function TrendsBoardsTab({
  workspaceSlug: _workspaceSlug,
  onBoardsChange,
}: {
  workspaceSlug: string;
  onBoardsChange?: (boards: Board[]) => void;
}) {
  const t = useLocaleT();
  const [boards, setBoards] = React.useState<
    Array<{ id: string; name: string; description: string | null }>
  >([]);
  const [name, setName] = React.useState("");
  const [selectedBoardId, setSelectedBoardId] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<BoardItem[]>([]);
  const [itemsError, setItemsError] = React.useState(false);
  React.useEffect(() => {
    void fetch(`/api/trends/boards?workspace=${encodeURIComponent(_workspaceSlug)}`)
      .then((response) => (response.ok ? response.json() : { boards: [] }))
      .then((body: { boards?: typeof boards }) => {
        const next = body.boards ?? [];
        setBoards(next);
        onBoardsChange?.(next);
        setSelectedBoardId((current) => current ?? next[0]?.id ?? null);
      })
      .catch(() => setBoards([]));
  }, [_workspaceSlug, onBoardsChange]);
  React.useEffect(() => {
    if (!selectedBoardId) return;
    void fetch(
      `/api/trends/boards/items?workspace=${encodeURIComponent(_workspaceSlug)}&boardId=${encodeURIComponent(selectedBoardId)}`,
    )
      .then((response) => {
        if (!response.ok) throw new Error("load_failed");
        setItemsError(false);
        return response.json();
      })
      .then((body: { items?: BoardItem[] }) => setItems(body.items ?? []))
      .catch(() => {
        setItems([]);
        setItemsError(true);
      });
  }, [_workspaceSlug, selectedBoardId]);
  const createBoard = async () => {
    if (!name.trim()) return;
    const response = await fetch("/api/trends/boards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceSlug: _workspaceSlug, name }),
    });
    if (!response.ok) return;
    const body = (await response.json()) as { board?: (typeof boards)[number] };
    if (body.board) {
      const next = [...boards, body.board];
      setBoards(next);
      onBoardsChange?.(next);
      setSelectedBoardId(body.board.id);
    }
    setName("");
  };
  return (
    <div
      data-testid="trends-boards"
      className="border-border bg-surface-subtle rounded-[var(--radius-card)] border p-8 text-center"
    >
      <LayoutGrid className="text-fg-muted mx-auto h-10 w-10" aria-hidden="true" />
      <h2 className="text-title-card text-fg-primary mt-3 font-semibold">
        {t("trends.boards.title") || "Boards"}
      </h2>
      <p className="text-body text-fg-secondary mx-auto mt-2 max-w-md">
        {t("trends.boards.body") ||
          "Create workspace collections for pitches, campaigns, or client reviews."}
      </p>
      <div className="mx-auto mt-5 flex max-w-md flex-wrap gap-2 text-start">
        <label htmlFor="trend-board-name" className="sr-only">
          {t("trends.boards.namePlaceholder") || "Board name"}
        </label>
        <Input
          id="trend-board-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("trends.boards.namePlaceholder") || "Board name"}
        />
        <Button type="button" onClick={() => void createBoard()} disabled={!name.trim()}>
          {t("trends.boards.create") || t("common.create") || "Create board"}
        </Button>
      </div>
      {boards.length > 0 ? (
        <div className="mx-auto mt-5 max-w-2xl space-y-4 text-start">
          <label
            htmlFor="trend-board-select"
            className="text-label text-fg-secondary font-semibold"
          >
            {t("trends.boards.title") || "Boards"}
          </label>
          <select
            id="trend-board-select"
            value={selectedBoardId ?? ""}
            onChange={(event) => setSelectedBoardId(event.target.value)}
            className="border-border bg-surface-card text-body text-fg-primary mt-1 h-11 w-full rounded-[var(--radius-control)] border px-3"
          >
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
          {itemsError ? (
            <p role="alert" className="text-body text-danger">
              {t("trends.boards.loadError") || "Could not load this board. Try again."}
            </p>
          ) : null}
          {items.length === 0 && !itemsError ? (
            <p className="border-border text-body text-fg-muted rounded-[var(--radius-control)] border p-4">
              {t("trends.boards.emptyItems") || "Save a trend here to make it useful later."}
            </p>
          ) : null}
          {items.length > 0 ? (
            <ul className="space-y-2" data-testid="trend-board-items">
              {items.map((item) => (
                <li
                  key={item.signal.id}
                  className="border-border bg-surface-card flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
                >
                  <bdi dir="auto" className="text-body text-fg-primary font-semibold">
                    {item.signal.label}
                  </bdi>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" className="min-h-11">
                      <Link
                        href={`/app/w/${_workspaceSlug}/planning/new?trendSignalId=${encodeURIComponent(item.signal.id)}`}
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        {t("trends.boards.createBrief") || "Create brief"}
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-11"
                      onClick={() => {
                        void fetch("/api/trends/boards/items", {
                          method: "DELETE",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            workspaceSlug: _workspaceSlug,
                            boardId: selectedBoardId,
                            signalId: item.signal.id,
                          }),
                        }).then((response) => {
                          if (response.ok)
                            setItems((current) =>
                              current.filter(
                                (currentItem) => currentItem.signal.id !== item.signal.id,
                              ),
                            );
                        });
                      }}
                      aria-label={`${t("trends.boards.remove") || "Remove"} ${item.signal.label}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      {t("trends.boards.remove") || "Remove"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
