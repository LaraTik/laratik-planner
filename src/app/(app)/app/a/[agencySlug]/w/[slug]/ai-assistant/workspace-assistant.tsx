"use client";

import { useId, useState, type FormEvent } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DirAwareTextarea } from "@/components/forms/dir-aware-textarea";

type Labels = {
  emptyTitle: string;
  emptyDescription: string;
  summarize: string;
  findGaps: string;
  improve: string;
  placeholder: string;
  send: string;
  sending: string;
  assistant: string;
  you: string;
  evidence: string;
  source: string;
  capturedAt: string;
  itemCount: string;
  boundedData: string;
  completeData: string;
  limitations: string;
  error: string;
  privacy: string;
  readOnly: string;
};

type Message = { role: "user" | "assistant"; content: string };
type AssistantReply = {
  answer: {
    answer: string;
    findings: {
      title: string;
      detail: string;
      severity: "low" | "medium" | "high";
      evidenceIds: string[];
    }[];
    recommendations: { title: string; detail: string; evidenceIds: string[] }[];
    limitations: string[];
  };
  evidence: {
    id: string;
    source: string;
    retrievedAt: string;
    period: string;
    completeness: string;
    itemCount: number;
  }[];
  deterministicFindings: {
    title: string;
    detail: string;
    severity: string;
    evidenceIds: string[];
  }[];
};

export function WorkspaceAssistant({
  workspaceSlug,
  locale,
  labels,
}: {
  workspaceSlug: string;
  locale: string;
  labels: Labels;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inputId = useId();
  const quickPrompts = [
    [labels.summarize, "Summarize this month's plan and highlight its main strengths."],
    [labels.findGaps, "Find scheduling gaps and explain the evidence."],
    [labels.improve, "Suggest practical improvements to this month's plan."],
  ] as const;

  async function submit(event?: FormEvent<HTMLFormElement>, selected?: string) {
    event?.preventDefault();
    const message = (selected ?? draft).trim();
    if (!message || busy) return;
    const history = messages.slice(-8);
    const nextMessages = [...messages, { role: "user" as const, content: message }];
    setMessages(nextMessages);
    setDraft("");
    setBusy(true);
    setError(false);
    setReply(null);
    try {
      const response = await fetch("/api/ai/workspace-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceSlug, message, history }),
      });
      const data = (await response.json()) as AssistantReply | { error?: string };
      if (!response.ok || !("answer" in data)) throw new Error("assistant_request_failed");
      setReply(data);
      setMessages([...nextMessages, { role: "assistant", content: data.answer.answer }]);
    } catch {
      setError(true);
      setMessages(nextMessages);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4" aria-label={labels.assistant}>
      <div className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-6">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl py-5 text-center">
            <span className="bg-primary-subtle text-primary mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-title-section text-fg-primary font-semibold">
              {labels.emptyTitle}
            </h2>
            <p className="text-body text-fg-secondary mx-auto mt-2 max-w-xl">
              {labels.emptyDescription}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {quickPrompts.map(([label, prompt]) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  onClick={() => void submit(undefined, prompt)}
                  disabled={busy}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="mx-auto max-w-3xl space-y-4" aria-live="polite">
            {messages.map((message, index) => (
              <li
                key={`${message.role}-${index}`}
                className={message.role === "user" ? "ms-auto max-w-[85%]" : "max-w-[95%]"}
              >
                <p className="text-label text-fg-muted mb-1 font-semibold">
                  {message.role === "user" ? labels.you : labels.assistant}
                </p>
                <div
                  className={`text-body rounded-[var(--radius-control)] px-3 py-2 ${message.role === "user" ? "bg-primary-subtle text-fg-primary" : "bg-surface-subtle text-fg-primary"}`}
                >
                  {message.content}
                </div>
              </li>
            ))}
            {busy ? (
              <li role="status" className="text-body text-fg-muted">
                {labels.sending}
              </li>
            ) : null}
          </ol>
        )}

        {error ? (
          <p role="alert" className="text-body text-danger mt-4">
            {labels.error}
          </p>
        ) : null}

        {reply ? (
          <div className="border-border mx-auto mt-5 max-w-3xl space-y-4 border-t pt-4">
            {reply.deterministicFindings.length ? (
              <section aria-label={labels.findGaps}>
                <h3 className="text-title-card text-fg-primary font-semibold">{labels.findGaps}</h3>
                <ul className="mt-2 space-y-2">
                  {reply.deterministicFindings.map((finding, index) => (
                    <li
                      key={`${finding.title}-${index}`}
                      className="bg-surface-subtle rounded-[var(--radius-control)] p-3"
                    >
                      <p className="text-body text-fg-primary font-semibold">{finding.title}</p>
                      <p className="text-body text-fg-secondary mt-1">{finding.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {reply.answer.findings.length || reply.answer.recommendations.length ? (
              <section>
                <h3 className="text-title-card text-fg-primary font-semibold">{labels.improve}</h3>
                <ul className="mt-2 space-y-2">
                  {[...reply.answer.findings, ...reply.answer.recommendations].map(
                    (item, index) => (
                      <li
                        key={`${item.title}-${index}`}
                        className="bg-surface-subtle rounded-[var(--radius-control)] p-3"
                      >
                        <p className="text-body text-fg-primary font-semibold">{item.title}</p>
                        <p className="text-body text-fg-secondary mt-1">{item.detail}</p>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            ) : null}
            {reply.answer.limitations.length ? (
              <section>
                <h3 className="text-label text-fg-primary font-semibold">{labels.limitations}</h3>
                <ul className="text-label text-fg-secondary mt-1 list-inside list-disc">
                  {reply.answer.limitations.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="text-label text-fg-muted">
              <p className="font-semibold">{labels.evidence}</p>
              {reply.evidence.map((item) => (
                <div key={item.id} className="mt-1">
                  <p>
                    {labels.source}: {item.source} · {item.period} · {item.itemCount}{" "}
                    {labels.itemCount}
                  </p>
                  <p>
                    {labels.capturedAt}:{" "}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      numberingSystem: "latn",
                    }).format(new Date(item.retrievedAt))}
                  </p>
                  <p>
                    {item.completeness === "bounded" ? labels.boundedData : labels.completeData}
                  </p>
                </div>
              ))}
            </section>
          </div>
        ) : null}
      </div>

      <form
        className="border-border bg-surface flex items-end gap-2 rounded-[var(--radius-card)] border p-3"
        onSubmit={(event) => void submit(event)}
      >
        <label className="sr-only" htmlFor={inputId}>
          {labels.placeholder}
        </label>
        <DirAwareTextarea
          id={inputId}
          locale={locale}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={labels.placeholder}
          maxLength={1_000}
          rows={2}
          className="border-border bg-surface text-body min-h-11 min-w-0 flex-1 resize-y rounded-[var(--radius-control)] border px-3 py-2"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !draft.trim()} aria-label={labels.send}>
          <Send className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{labels.send}</span>
        </Button>
      </form>
      <div className="text-label text-fg-muted flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1">
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
          {labels.readOnly}
        </p>
        <p>{labels.privacy}</p>
      </div>
    </section>
  );
}
