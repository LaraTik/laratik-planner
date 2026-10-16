"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { sendCommunityReplyAction } from "@/lib/community/reply-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CommunityReplyForm({
  agencySlug,
  workspaceSlug,
  conversationId,
  canReply,
  visibility,
  placeholder,
  sendLabel,
  sendingLabel,
  successLabel,
  failureLabel,
  disabledLabel,
}: {
  agencySlug: string;
  workspaceSlug: string;
  conversationId: string | null;
  canReply: boolean;
  visibility: "public" | "private";
  placeholder: string;
  sendLabel: string;
  sendingLabel: string;
  successLabel: string;
  failureLabel: string;
  disabledLabel: string;
}) {
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState<"success" | "failure" | null>(null);
  const [pending, startTransition] = useTransition();
  const disabled = !conversationId || !canReply || pending;

  function submit() {
    if (!conversationId || !canReply || body.trim().length === 0) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await sendCommunityReplyAction(
        agencySlug,
        workspaceSlug,
        conversationId,
        body,
        visibility,
      );
      if (result.ok) {
        setBody("");
        setFeedback("success");
      } else {
        setFeedback("failure");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="border-border bg-surface-subtle flex items-end gap-2 rounded-[var(--radius-control)] border p-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          className="min-h-12 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          aria-label={placeholder}
        />
        <Button
          type="button"
          size="icon"
          aria-label={pending ? sendingLabel : sendLabel}
          onClick={submit}
          disabled={disabled || body.trim().length === 0}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {!canReply || !conversationId ? (
        <p className="text-label text-fg-muted">{disabledLabel}</p>
      ) : null}
      {feedback === "success" ? (
        <p className="text-label text-success" role="status">
          {successLabel}
        </p>
      ) : null}
      {feedback === "failure" ? (
        <p className="text-label text-danger" role="alert">
          {failureLabel}
        </p>
      ) : null}
    </div>
  );
}
