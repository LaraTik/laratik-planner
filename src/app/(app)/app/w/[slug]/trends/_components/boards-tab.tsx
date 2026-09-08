"use client";

import * as React from "react";
import { LayoutGrid } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TrendsBoardsTab({ workspaceSlug: _workspaceSlug }: { workspaceSlug: string }) {
  const t = useLocaleT();
  const [boards, setBoards] = React.useState<
    Array<{ id: string; name: string; description: string | null }>
  >([]);
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    void fetch(`/api/trends/boards?workspace=${encodeURIComponent(_workspaceSlug)}`)
      .then((response) => (response.ok ? response.json() : { boards: [] }))
      .then((body: { boards?: typeof boards }) => setBoards(body.boards ?? []))
      .catch(() => setBoards([]));
  }, [_workspaceSlug]);
  const createBoard = async () => {
    if (!name.trim()) return;
    const response = await fetch("/api/trends/boards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceSlug: _workspaceSlug, name }),
    });
    if (!response.ok) return;
    const body = (await response.json()) as { board?: (typeof boards)[number] };
    if (body.board) setBoards((current) => [...current, body.board!]);
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
      <div className="mx-auto mt-5 flex max-w-md gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("trends.boards.namePlaceholder") || "Board name"}
        />
        <Button type="button" onClick={() => void createBoard()} disabled={!name.trim()}>
          {t("common.create") || "Create"}
        </Button>
      </div>
      {boards.length > 0 ? (
        <ul className="mx-auto mt-5 max-w-md space-y-2 text-start">
          {boards.map((board) => (
            <li
              key={board.id}
              className="border-border bg-surface-card rounded-[var(--radius-control)] border p-3"
            >
              <p className="text-body text-fg-primary font-semibold">{board.name}</p>
              {board.description ? (
                <p className="text-label text-fg-muted mt-1">{board.description}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
