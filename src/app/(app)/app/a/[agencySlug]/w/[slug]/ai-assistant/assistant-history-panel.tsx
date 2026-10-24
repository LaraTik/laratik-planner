"use client";

import {
  Archive,
  MoreHorizontal,
  Pin,
  PinOff,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useId } from "react";
import { DirAwareInput } from "@/components/forms/dir-aware-textarea";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AssistantConversationSummary = {
  id: string;
  title: string;
  mode: "ask" | "plan" | "apply";
  responseLocale: "ar" | "en";
  pinnedAt: string | null;
  updatedAt: string;
};

export type AssistantHistoryLabels = {
  conversations: string;
  newConversation: string;
  searchConversations: string;
  rename: string;
  archive: string;
  deleteConversation: string;
  archivedConversations: string;
  activeConversations: string;
  restoreConversation: string;
  pinConversation: string;
  unpinConversation: string;
  pinnedConversation: string;
  noConversations: string;
  noSearchResults: string;
};

export function AssistantHistoryPanel({
  conversations,
  currentConversationId,
  archivedView,
  search,
  locale,
  labels,
  onSearchChange,
  onArchivedViewChange,
  onNewConversation,
  onOpenConversation,
  onRenameConversation,
  onArchiveConversation,
  onDeleteConversation,
  onRestoreConversation,
  onTogglePin,
}: {
  conversations: AssistantConversationSummary[];
  currentConversationId: string | null;
  archivedView: boolean;
  search: string;
  locale: string;
  labels: AssistantHistoryLabels;
  onSearchChange: (value: string) => void;
  onArchivedViewChange: (archived: boolean) => void;
  onNewConversation: () => void;
  onOpenConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onArchiveConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRestoreConversation: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
}) {
  const searchId = useId();
  const visibleConversations = conversations.filter((conversation) =>
    conversation.title.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)),
  );

  return (
    <section className="flex min-h-0 flex-col gap-3" aria-label={labels.conversations}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title-card text-fg-primary font-semibold">{labels.conversations}</h2>
        {!archivedView ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={labels.newConversation}
            title={labels.newConversation}
            onClick={onNewConversation}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="bg-surface-subtle grid grid-cols-2 gap-1 rounded-[var(--radius-control)] p-1">
        <Button
          type="button"
          size="sm"
          variant={archivedView ? "ghost" : "default"}
          aria-pressed={!archivedView}
          onClick={() => onArchivedViewChange(false)}
        >
          {labels.activeConversations}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={archivedView ? "default" : "ghost"}
          aria-pressed={archivedView}
          onClick={() => onArchivedViewChange(true)}
        >
          {labels.archivedConversations}
        </Button>
      </div>
      <div className="border-border flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3">
        <Search className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
        <label htmlFor={searchId} className="sr-only">
          {labels.searchConversations}
        </label>
        <DirAwareInput
          id={searchId}
          locale={locale}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={labels.searchConversations}
          className="text-body min-h-10 min-w-0 flex-1 bg-transparent outline-none"
        />
      </div>
      {visibleConversations.length ? (
        <ul className="min-h-0 space-y-1 overflow-y-auto">
          {visibleConversations.map((conversation) => {
            const pinned = Boolean(conversation.pinnedAt);
            const current = currentConversationId === conversation.id;
            return (
              <li
                key={conversation.id}
                className={
                  "group border-border flex min-w-0 items-center gap-1 rounded-[var(--radius-control)] border p-1 " +
                  (current ? "bg-primary-subtle border-primary/40" : "bg-surface")
                }
              >
                <button
                  type="button"
                  onClick={() => onOpenConversation(conversation.id)}
                  aria-current={current ? "page" : undefined}
                  className="text-body text-fg-primary hover:bg-surface-subtle min-h-11 min-w-0 flex-1 truncate rounded px-2 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <bdi dir="auto" className="min-w-0 flex-1 truncate">
                      {conversation.title}
                    </bdi>
                    {pinned ? (
                      <span
                        className="text-primary inline-flex shrink-0"
                        title={labels.pinnedConversation}
                      >
                        <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">{labels.pinnedConversation}</span>
                      </span>
                    ) : null}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={pinned ? labels.unpinConversation : labels.pinConversation}
                  aria-pressed={pinned}
                  title={pinned ? labels.unpinConversation : labels.pinConversation}
                  onClick={() => onTogglePin(conversation.id, !pinned)}
                >
                  {pinned ? (
                    <PinOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Pin className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={labels.rename}
                      title={labels.rename}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {archivedView ? (
                      <DropdownMenuItem onSelect={() => onRestoreConversation(conversation.id)}>
                        <RotateCcw className="me-2 h-4 w-4" aria-hidden="true" />
                        {labels.restoreConversation}
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onSelect={() => onRenameConversation(conversation.id, conversation.title)}
                        >
                          <Pencil className="me-2 h-4 w-4" aria-hidden="true" />
                          {labels.rename}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onArchiveConversation(conversation.id)}>
                          <Archive className="me-2 h-4 w-4" aria-hidden="true" />
                          {labels.archive}
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem
                      className="text-danger focus:text-danger"
                      onSelect={() => onDeleteConversation(conversation.id)}
                    >
                      <Trash2 className="me-2 h-4 w-4" aria-hidden="true" />
                      {labels.deleteConversation}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body text-fg-muted bg-surface-subtle rounded-[var(--radius-control)] px-3 py-4">
          {conversations.length ? labels.noSearchResults : labels.noConversations}
        </p>
      )}
    </section>
  );
}
