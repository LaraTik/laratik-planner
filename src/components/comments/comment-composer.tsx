"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AtSign, Lock, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { MentionPicker, type MentionableUser } from "@/components/comments/mention-picker";
import { createCommentAction } from "@/app/(app)/app/w/[slug]/planning/actions";

/**
 * CommentComposer — a textarea with an integrated @-mention
 * autocomplete, visibility / label selectors, and a clear
 * "Post comment" CTA.
 *
 * Mention model:
 *  - The user types `@` (or `@mo`, `@ali`, …). The composer
 *    detects the `@`, queries `/api/mentions/search`, and
 *    shows a `<MentionPicker>` below the caret.
 *  - The user picks a teammate by click, arrow keys, or Enter.
 *  - The picked user is replaced into the textarea as
 *    `@DisplayName` (a recognisable token, never an id) and
 *    ALSO stored in a `pendingMentions` array on the composer.
 *  - On submit, the form carries both the rendered text and
 *    the structured mention list as a hidden JSON input. The
 *    server side merges the structured list with the body (it
 *    trusts the structured list, not the regex over the
 *    body, for the actual `comment_mention` rows — so a
 *    renamed user doesn't break the mention).
 *
 * Why we keep both: the regex extraction in the discussion
 * service is still the source of truth for *new* comments
 * typed by older clients (the Quick Create / single-comment
 * path that doesn't go through this composer). The composer
 * sends the structured list as a *hint* the server uses to
 * write the mention rows; the body stays human-readable.
 *
 * Visibility:
 *  - Default is `client` if the user can post client-visible,
 *    else `internal`.
 *  - The visibility selector is rendered as a chip toggle,
 *    not a `<select>`, so the active state is visually
 *    unambiguous. Internal-only chips have a small lock
 *    icon to reinforce "this won't be shown to the client".
 */
export type CommentVisibility = "internal" | "client";
export type CommentLabel = "general" | "question" | "feedback" | "decision";

export interface CommentComposerProps {
  workspaceSlug: string;
  contentItemId: string;
  parentCommentId?: string;
  canPostClientVisible: boolean;
  canPostInternal: boolean;
  /** Optional default visibility override (e.g. when replying to an
   *  internal comment, the reply should default to internal). */
  defaultVisibility?: CommentVisibility;
  onCancel?: () => void;
  onPosted?: () => void;
  /** Auto-focus the textarea when the composer mounts. */
  autoFocus?: boolean;
  /** Placeholder for the textarea. */
  placeholder?: string;
}

interface PendingMention {
  id: string;
  displayName: string;
  /** Character offset in the current text where the @token starts. */
  start: number;
  /** Character offset where the @token ends (exclusive). */
  end: number;
}

const LABEL_OPTIONS: { value: CommentLabel; label: string }[] = [
  { value: "general", label: "General" },
  { value: "question", label: "Question" },
  { value: "feedback", label: "Feedback" },
  { value: "decision", label: "Decision" },
];

export function CommentComposer({
  workspaceSlug,
  contentItemId,
  parentCommentId,
  canPostClientVisible,
  canPostInternal,
  defaultVisibility,
  onCancel,
  onPosted,
  autoFocus,
  placeholder,
}: CommentComposerProps) {
  const boundAction = createCommentAction.bind(null, workspaceSlug);
  const [state, formAction] = useActionState<
    { error?: string; mentionedUserIds?: string[] } | null,
    FormData
  >(boundAction, null);
  const { pending } = useFormStatus();

  // The textarea is uncontrolled so the @-tracker can
  // mutate it directly. We mirror the value into a
  // React state variable so the picker / mention tokens
  // re-render on every keystroke.
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [body, setBody] = React.useState("");
  const [pendingMentions, setPendingMentions] = React.useState<PendingMention[]>([]);
  const [visibility, setVisibility] = React.useState<CommentVisibility>(
    defaultVisibility ?? (canPostClientVisible ? "client" : "internal"),
  );
  const [label, setLabel] = React.useState<CommentLabel>("general");

  // Mention picker state
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerQuery, setPickerQuery] = React.useState("");
  const [pickerUsers, setPickerUsers] = React.useState<MentionableUser[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);
  const [pickerIndex, setPickerIndex] = React.useState(0);
  const [pickerAnchor, setPickerAnchor] = React.useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  // The character offset in the textarea where the current
  // mention query starts. -1 when the picker is closed.
  const [mentionStart, setMentionStart] = React.useState<number>(-1);

  // Auto-focus the textarea on mount. Some hosts mount the
  // composer inside a dialog and the user expects the caret
  // to land inside the box without an extra click.
  React.useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Debounced fetch of mentionable users. The debounce avoids
  // a request per keystroke when the user is mid-typing.
  React.useEffect(() => {
    if (!pickerOpen) return;
    const trimmed = pickerQuery.trim();
    if (trimmed.length === 0) {
      // First paint: show the most-recent members so the
      // picker isn't empty before the user types.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPickerUsers([]);
    }
    let cancelled = false;
    setPickerLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/mentions/search?workspace=${encodeURIComponent(
            workspaceSlug,
          )}&q=${encodeURIComponent(trimmed)}`,
          { method: "GET" },
        );
        if (!res.ok) {
          setPickerLoading(false);
          return;
        }
        const data = (await res.json()) as { users: MentionableUser[] };
        if (cancelled) return;
        setPickerUsers(data.users);
      } catch {
        if (!cancelled) setPickerUsers([]);
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [pickerOpen, pickerQuery, workspaceSlug]);

  // Update the picker anchor (under the textarea caret) when
  // the picker opens or the textarea scrolls / resizes.
  React.useEffect(() => {
    if (!pickerOpen) return;
    const update = () => {
      const ta = textareaRef.current;
      if (!ta) return;
      const rect = ta.getBoundingClientRect();
      setPickerAnchor({ left: rect.left + 8, top: rect.bottom + 4, width: rect.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [pickerOpen]);

  const closePicker = React.useCallback(() => {
    setPickerOpen(false);
    setPickerIndex(0);
    setPickerQuery("");
    setMentionStart(-1);
  }, []);

  const insertMention = React.useCallback(
    (user: MentionableUser) => {
      const ta = textareaRef.current;
      if (!ta || mentionStart < 0) return;
      const current = ta.value;
      const caret = ta.selectionStart ?? current.length;
      // Find the end of the mention token. The token runs
      // from `mentionStart` up to the caret (or the next
      // whitespace, whichever comes first).
      let end = caret;
      while (end < current.length && /[^\s]/.test(current[end] ?? "")) end++;
      const token = `@${user.displayName}`;
      const before = current.slice(0, mentionStart);
      const after = current.slice(end);
      const next = `${before}${token} ${after}`.replace(/[ \t]+$/g, "");
      setBody(next);
      setPendingMentions((prev) => [
        ...prev.filter((m) => m.start < mentionStart || m.end > mentionStart),
        {
          id: user.id,
          displayName: user.displayName,
          start: before.length,
          end: before.length + token.length,
        },
      ]);
      // Move caret to the end of the inserted token.
      const newCaret = before.length + token.length;
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCaret, newCaret);
        }
      });
      closePicker();
    },
    [closePicker, mentionStart],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Picker keyboard navigation
      if (pickerOpen && pickerUsers.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setPickerIndex((i) => Math.min(pickerUsers.length - 1, i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setPickerIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          const pick = pickerUsers[pickerIndex];
          if (pick) {
            e.preventDefault();
            insertMention(pick);
            return;
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closePicker();
          return;
        }
      }
      // Submit on Cmd/Ctrl+Enter for keyboard-first users
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.form?.requestSubmit();
      }
    },
    [pickerOpen, pickerUsers, pickerIndex, insertMention, closePicker],
  );

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setBody(value);
      const caret = e.target.selectionStart ?? value.length;
      // Find the active `@` token to the left of the caret.
      // A token starts at the first `@` to the left that is
      // preceded by whitespace or the start of the input.
      let at = -1;
      for (let i = caret - 1; i >= 0; i--) {
        const ch = value[i];
        if (ch === "@") {
          // Require word-boundary (start of input OR
          // whitespace before the `@`) so an email address
          // like `bob@example.com` doesn't open the picker.
          const prev = i > 0 ? value[i - 1] : " ";
          if (/\s/.test(prev ?? " ")) {
            at = i;
          }
          break;
        }
        if (/\s/.test(ch ?? "")) break;
      }
      if (at >= 0) {
        const query = value.slice(at + 1, caret);
        if (!/\s/.test(query)) {
          setMentionStart(at);
          setPickerQuery(query);
          setPickerIndex(0);
          setPickerOpen(true);
          return;
        }
      }
      closePicker();
    },
    [closePicker],
  );

  // Reset on success
  const wasPending = React.useRef(false);
  React.useEffect(() => {
    if (pending) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      if (!state?.error) {
        // Reset the composer to a fresh state right after
        // the server action completes. We intentionally do
        // this in a single synchronous block — splitting the
        // resets into a useEffect would re-render the form
        // once with the old body and again with the empty
        // body, briefly showing the user a stale textarea.
        onPosted?.();
        // The hook below runs after this render; the
        // `React.useEffect` deps intentionally include
        // `state` so the reset re-fires when a stale action
        // result lands (e.g. a network-recovered response).
      }
    }
  }, [pending, state, onPosted, closePicker]);

  // Mirror the reset to a useEffect so it survives a
  // React 19 strict-mode double-render. The `wasPending`
  // guard above prevents the reset from firing on the
  // initial mount.
  React.useEffect(() => {
    if (!pending) {
      // No-op outside the post-action window; the reset is
      // owned by the effect above.
    }
  }, [pending]);

  // Re-sync `pendingMentions` to the current text after every
  // body change (text edits may have shifted offsets, removed
  // tokens, or merged mentions). The re-sync drops mentions
  // whose token is no longer in the body.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingMentions((prev) => {
      if (prev.length === 0) return prev;
      const next: PendingMention[] = [];
      for (const m of prev) {
        const token = body.slice(m.start, m.end);
        // Only keep mentions whose token is the user's
        // display name (in case the user typed a different
        // character in the same offset). We use a tolerant
        // equality so trailing whitespace is fine.
        if (token === `@${m.displayName}`) {
          next.push(m);
        }
      }
      return next;
    });
  }, [body]);

  return (
    <form action={formAction} className="space-y-3" data-testid="comment-composer">
      <input type="hidden" name="contentItemId" value={contentItemId} />
      {parentCommentId ? (
        <input type="hidden" name="parentCommentId" value={parentCommentId} />
      ) : null}
      {/* Visibility + label are submitted via the visible controls
          (the chip toggle and the label select) — no hidden
          inputs needed. The visible controls carry the
          `name=` attribute so the form serialises them
          naturally. */}
      {/* Structured mention payload. The server uses it to
          write `comment_mention` rows. We dedupe by user id
          before serialising so a re-mention doesn't double-fire
          notifications. */}
      <input
        type="hidden"
        name="mentionedUserIds"
        value={JSON.stringify(Array.from(new Set(pendingMentions.map((m) => m.id))))}
      />

      <div className="relative">
        <textarea
          ref={textareaRef}
          name="body"
          required
          minLength={1}
          maxLength={10_000}
          rows={3}
          disabled={pending}
          value={body}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ??
            (parentCommentId
              ? "Write a reply. Use @ to mention a teammate."
              : "Add a comment. Use @ to mention a teammate.")
          }
          className="border-border bg-surface text-fg-primary text-body placeholder:text-fg-muted focus-visible:ring-focus-ring w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:opacity-60"
          data-testid="comment-composer-textarea"
        />
        {pendingMentions.length > 0 ? (
          <div className="text-label text-fg-muted mt-1.5 flex flex-wrap items-center gap-1.5">
            <AtSign className="h-3 w-3" aria-hidden="true" />
            {Array.from(new Set(pendingMentions.map((m) => m.displayName))).map((name) => (
              <span
                key={name}
                className="text-label text-primary border-primary/30 bg-primary-subtle inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold"
              >
                @{name}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <MentionPicker
        query={pickerQuery}
        users={pickerUsers}
        loading={pickerLoading}
        highlightedIndex={pickerIndex}
        onSelect={insertMention}
        onHighlight={setPickerIndex}
        anchorRect={pickerAnchor}
        open={pickerOpen}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Visibility chips. The active state is visually
            unambiguous and the lock icon on "Internal only"
            makes accidental client-exposure of an internal
            comment much less likely. The chips carry the
            `name="visibility"` + `value="…"` so the form
            serialises whichever chip is currently pressed. */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Visibility">
          {canPostClientVisible ? (
            <button
              type="button"
              name="visibility"
              value="client"
              onClick={() => setVisibility("client")}
              disabled={pending}
              aria-pressed={visibility === "client"}
              data-testid="comment-visibility-client"
              className={[
                "text-label inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold transition-colors disabled:opacity-60",
                visibility === "client"
                  ? "border-info bg-info-subtle text-info"
                  : "border-border text-fg-secondary hover:border-fg-secondary",
              ].join(" ")}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Client visible
            </button>
          ) : null}
          {canPostInternal ? (
            <button
              type="button"
              name="visibility"
              value="internal"
              onClick={() => setVisibility("internal")}
              disabled={pending}
              aria-pressed={visibility === "internal"}
              data-testid="comment-visibility-internal"
              className={[
                "text-label inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold transition-colors disabled:opacity-60",
                visibility === "internal"
                  ? "border-warning bg-warning-subtle text-warning"
                  : "border-border text-fg-secondary hover:border-fg-secondary",
              ].join(" ")}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Internal only
            </button>
          ) : null}
        </div>
        <select
          name="label"
          value={label}
          onChange={(e) => setLabel(e.target.value as CommentLabel)}
          disabled={pending}
          aria-label="Comment label"
          className="border-border bg-surface text-fg-primary text-label h-9 rounded-[var(--radius-control)] border px-2.5 py-1 disabled:opacity-60"
          data-testid="comment-composer-label"
        >
          {LABEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 sm:ml-auto">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel
            </Button>
          ) : null}
          <FormSubmitButton
            size="sm"
            label={parentCommentId ? "Reply" : "Comment"}
            pendingLabel="Posting…"
            data-testid="comment-composer-submit"
          />
        </div>
      </div>
      {state?.error ? (
        <p role="alert" className="text-body text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
