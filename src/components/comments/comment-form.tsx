"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { createCommentAction } from "@/app/(app)/app/w/[slug]/planning/actions";

export interface CommentFormProps {
  workspaceSlug: string;
  contentItemId: string;
  parentCommentId?: string;
  canPostClientVisible: boolean;
  canPostInternal: boolean;
  onCancel?: () => void;
  /** Called when the server action succeeds, so the parent can show a
   *  "posting…" placeholder that the server-rendered list replaces on
   *  next navigation. */
  onPosted?: () => void;
}

/**
 * CommentForm — new-comment / reply composer. Default visibility is
 * "client" when the user can post client-visible, else "internal".
 *
 * On successful submit, the form is reset and `onPosted` fires so the
 * parent can collapse the form / clear the reply target.
 */
export function CommentForm({
  workspaceSlug,
  contentItemId,
  parentCommentId,
  canPostClientVisible,
  canPostInternal,
  onCancel,
  onPosted,
}: CommentFormProps) {
  const boundAction = createCommentAction.bind(null, workspaceSlug);
  // The action returns `{ error }` on validation failure, `null` on success.
  const [state, formAction] = useActionState(boundAction, null);
  const { pending } = useFormStatus();

  // Default visibility: prefer client-visible when the user can post
  // both — agency-side users should still see their comments by default.
  const defaultVisibility: "internal" | "client" = canPostClientVisible ? "client" : "internal";

  const formRef = React.useRef<HTMLFormElement | null>(null);
  const wasPending = React.useRef(false);

  // When the action completes (pending goes false after being true),
  // clear the form + notify the parent. If the action errored, leave
  // the body so the user can fix it.
  React.useEffect(() => {
    if (pending) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      if (!state?.error) {
        formRef.current?.reset();
        onPosted?.();
      }
    }
  }, [pending, state, onPosted]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="contentItemId" value={contentItemId} />
      {parentCommentId ? (
        <input type="hidden" name="parentCommentId" value={parentCommentId} />
      ) : null}
      <textarea
        name="body"
        required
        minLength={1}
        maxLength={10_000}
        rows={3}
        disabled={pending}
        placeholder={parentCommentId ? "Write a reply…" : "Add a comment. Use @name to mention."}
        className="border-border bg-surface text-fg-primary text-body w-full rounded-[var(--radius-control)] border px-3 py-2 disabled:opacity-60"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="text-label text-fg-secondary flex items-center gap-2">
          Visibility:
          <select
            name="visibility"
            defaultValue={defaultVisibility}
            disabled={pending}
            className="border-border bg-surface text-fg-primary rounded-[var(--radius-control)] border px-2 py-1 text-sm"
          >
            {canPostClientVisible ? <option value="client">Client visible</option> : null}
            {canPostInternal ? <option value="internal">Internal only</option> : null}
          </select>
        </label>
        <label className="text-label text-fg-secondary flex items-center gap-2">
          Label:
          <select
            name="label"
            defaultValue="general"
            disabled={pending}
            className="border-border bg-surface text-fg-primary rounded-[var(--radius-control)] border px-2 py-1 text-sm"
          >
            <option value="general">General</option>
            <option value="question">Question</option>
            <option value="feedback">Feedback</option>
            <option value="decision">Decision</option>
          </select>
        </label>
        <div className="flex items-center gap-2 sm:ml-auto">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          ) : null}
          <FormSubmitButton
            size="sm"
            label={parentCommentId ? "Reply" : "Comment"}
            pendingLabel="Posting…"
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
