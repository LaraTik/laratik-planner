"use client";

import * as React from "react";
import { AtSign, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MentionPicker — the autocomplete surface that pops up while the
 * user types `@` in the comment composer.
 *
 * The picker is decoupled from the composer's textarea so the
 * same component can be reused for any future @-mention surface
 * (e.g. a stand-alone "mention a teammate" button on the
 * team page). It owns its own keyboard handling (arrow up/down
 * to move, Enter / Tab to select, Escape to dismiss) and
 * surfaces the picked user via the `onSelect` callback.
 *
 * Why a portal: the picker renders into a `<div>` that is
 * positioned absolutely below the textarea. For long comment
 * threads the textarea is sometimes inside a card that has
 * `overflow: hidden`, so an inline popover would be clipped.
 * The portal here is a no-op when the parent doesn't have
 * overflow clipping, so we get the same visual result without
 * the complexity of a full Radix popover.
 */

export interface MentionableUser {
  id: string;
  displayName: string;
  email: string;
  image: string | null;
  roleLabel: string | null;
  isAgencyAdmin: boolean;
}

export interface MentionPickerProps {
  /** Currently-active query (text after the `@`). The picker
   *  re-fetches when this changes. */
  query: string;
  /** Current results from the search API. */
  users: MentionableUser[];
  /** Loading state — the picker renders a spinner. */
  loading: boolean;
  /** Index of the keyboard-highlighted user (0-based). */
  highlightedIndex: number;
  /** Called when the user confirms a selection (click, Enter, Tab). */
  onSelect: (user: MentionableUser) => void;
  /** Called when the user hovers / arrows to a different option. */
  onHighlight: (index: number) => void;
  /** Anchor for positioning — the textarea rect under the cursor.
   *  The picker positions itself directly below this rect. */
  anchorRect: { left: number; top: number; width: number } | null;
  /** When true, the picker is mounted (e.g. the user has typed
   *  `@something` and the composer hasn't dismissed it). */
  open: boolean;
}

export function MentionPicker({
  query,
  users,
  loading,
  highlightedIndex,
  onSelect,
  onHighlight,
  anchorRect,
  open,
}: MentionPickerProps) {
  if (!open) return null;
  return (
    <div
      role="listbox"
      aria-label="Mention suggestions"
      data-testid="mention-picker"
      className="bg-surface border-border fixed z-50 max-h-72 w-72 overflow-y-auto rounded-[var(--radius-control)] border shadow-lg"
      style={{
        left: anchorRect ? Math.max(8, anchorRect.left) : 0,
        top: anchorRect ? anchorRect.top : 0,
      }}
    >
      <div className="text-label text-fg-muted border-border flex items-center gap-1.5 border-b px-3 py-2 font-semibold">
        <AtSign className="h-3.5 w-3.5" aria-hidden="true" />
        {query ? (
          <>
            Mention someone matching <span className="text-fg-primary">&quot;{query}&quot;</span>
          </>
        ) : (
          <>Mention a teammate</>
        )}
      </div>
      {loading ? (
        <div className="text-label text-fg-muted flex items-center gap-2 px-3 py-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Searching…
        </div>
      ) : users.length === 0 ? (
        <p className="text-label text-fg-muted px-3 py-3">
          {query ? `No teammates match “${query}”.` : "Type a name to find a teammate to mention."}
        </p>
      ) : (
        <ul role="presentation">
          {users.map((u, i) => {
            const active = i === highlightedIndex;
            return (
              <li key={u.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-testid={`mention-option-${u.id}`}
                  data-mention-index={i}
                  className={cn(
                    "text-body flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus:outline-none",
                    active ? "bg-primary-subtle text-primary" : "hover:bg-surface-subtle",
                  )}
                  onMouseEnter={() => onHighlight(i)}
                  onMouseDown={(e) => {
                    // mousedown, not click — the textarea loses
                    // focus on click and the picker would dismiss
                    // before our state can be updated. mousedown
                    // fires before the textarea blur, so the
                    // selection lands in time.
                    e.preventDefault();
                    onSelect(u);
                  }}
                >
                  <Avatar user={u} />
                  <span className="min-w-0 flex-1">
                    <span className="text-body text-fg-primary block truncate font-semibold">
                      {u.displayName}
                    </span>
                    <span className="text-label text-fg-muted block truncate">{u.email}</span>
                  </span>
                  {u.roleLabel ? (
                    <span className="text-label text-fg-muted shrink-0 rounded-full border px-2 py-0.5 font-semibold">
                      {u.roleLabel}
                    </span>
                  ) : u.isAgencyAdmin ? (
                    <span className="text-label text-fg-muted shrink-0 rounded-full border px-2 py-0.5 font-semibold">
                      Agency admin
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Avatar({ user }: { user: MentionableUser }) {
  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.image} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="bg-primary-subtle text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
    >
      {user.displayName.charAt(0).toUpperCase()}
    </span>
  );
}
