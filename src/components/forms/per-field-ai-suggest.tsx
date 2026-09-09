"use client";

import * as React from "react";
import { Sparkles, Loader2, RotateCcw, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Per-field AI suggest button + Insert / Replace / Try again
 * preview. Sits next to a field in the format-payload editor.
 *
 * Behaviour:
 *   - Click `Suggest` → POST to `/api/ai/generate` with
 *     `capability=caption_drafts` + the field name +
 *     `currentFieldValue` + (optionally) `contentLanguage`.
 *   - The route returns `{ text, parsed? }`. The preview
 *     shows the raw text in a read-only DirAwareTextarea
 *     (so the suggested text mirrors correctly if it's
 *     Arabic) plus Insert / Replace / Try again / Cancel.
 *   - Insert = append after the existing value (or set if empty).
 *   - Replace = overwrite. A confirmation prompt guards the
 *     destructive path (Replace is the bigger commitment).
 *   - Try again = repeat the call with the same params.
 *
 * Why "drafts only" + Insert/Replace instead of auto-typing:
 *   Master prompt §0.13 — "AI never bypasses human control."
 *   The route never writes to the DB; the user always confirms.
 *   This is the same contract the existing content-detail AI
 *   section uses.
 *
 * Why this is a separate component, not an extension of the
 * content-detail AI section: the format-payload editor lives
 * on the *content* detail page but the per-field buttons are
 * scoped to specific inputs. Reusing the section would force
 * the planner to context-switch between the section's
 * suggestion cards and the field they were filling.
 */
export type PerFieldAiField =
  | "caption"
  | "hook"
  | "mainMessage"
  | "callToAction"
  | "hashtags"
  | "firstComment"
  | "description"
  | "visualDirection"
  | "additionalNotes"
  | "notes";

export interface PerFieldAiSuggestProps {
  /** Workspace locale — drives the fallback dir for the preview. */
  locale?: string | undefined;
  /** The content item the AI is generating against. */
  contentItemId: string;
  /** Which field to draft. The route scopes the prompt. */
  field: PerFieldAiField;
  /** Current value of the field. Sent as the tone-anchor. */
  currentValue: string;
  /**
   * Optional locale the planner wants the draft in (e.g. the
   * editor's active translation). When omitted, the model's
   * default is used.
   */
  contentLanguage?: string | undefined;
  /**
   * Apply the suggestion. `mode` is "insert" (append) or
   * "replace" (overwrite). The editor handles the actual merge
   * — the component never touches the field state directly,
   * it just calls back with the text + a `parsed` value (for
   * structured fields like `hashtags`).
   */
  onApply: (text: string, mode: "insert" | "replace", parsed: string[] | null) => void;
  /**
   * Whether the agency's `caption_drafts` capability is on.
   * The button is hidden when false; the parent editor passes
   * the value through `enabledCapabilities.includes("caption_drafts")`.
   */
  enabled?: boolean | undefined;
  /**
   * Optional reason the button is disabled even though the
   * capability is on (e.g. "no API key configured"). Shown as
   * a tooltip on the button so the planner knows why.
   */
  disabledReason?: string | null | undefined;
  /**
   * Bound translator from the parent field renderer. Resolves
   * the "AI suggest" button label, the "Drafting…" spinner,
   * the preview header, the Insert / Replace / Try again /
   * Dismiss buttons + their aria-labels, the Replace
   * confirm dialog, and the empty-draft error through the
   * `formatEditor.editor.ai.*` catalog keys.
   */
  t: (key: string, params?: Record<string, string | number>) => string;
}

type SuggestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; text: string; parsed: string[] | null }
  | { kind: "error"; message: string };

const HASHTAG_FIELDS: ReadonlySet<PerFieldAiField> = new Set<PerFieldAiField>(["hashtags"]);

export function PerFieldAiSuggest({
  locale,
  contentItemId,
  field,
  currentValue,
  contentLanguage,
  onApply,
  enabled = true,
  disabledReason = null,
  t,
}: PerFieldAiSuggestProps) {
  const [state, setState] = React.useState<SuggestState>({ kind: "idle" });
  const [replaceOpen, setReplaceOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const inFlight = React.useRef<AbortController | null>(null);
  const requestId = React.useRef(0);

  // When the user changes the source value (e.g. types more
  // text), an existing draft is stale. Clear it so the next
  // click of "Suggest" produces a fresh one. This is the
  // "derived from currentValue" pattern; the React
  // `set-state-in-effect` lint warns about it but the
  // alternative (compute `isStale` in render and conditionally
  // render) is a worse user experience — the preview would
  // vanish mid-frame.
  React.useEffect(() => {
    inFlight.current?.abort();
    requestId.current += 1;
    // The preview is intentionally derived from the current field value.
    // Resetting it here prevents applying a result against stale text.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotice(null);
    setCopied(false);
    if (state.kind === "ready" || state.kind === "error") {
      setState({ kind: "idle" });
    }
    // Intentionally only on `currentValue` change — we don't
    // want the preview to vanish while the user is reading it.
    return () => inFlight.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue]);

  if (!enabled) return null;

  const isHashtag = HASHTAG_FIELDS.has(field);
  const suggestAria = t("formatEditor.editor.ai.suggestFieldAria", { field });

  async function suggest() {
    if (state.kind === "loading") return;
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    const id = ++requestId.current;
    setNotice(null);
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentItemId,
          capability: "caption_drafts",
          field,
          currentFieldValue: currentValue,
          ...(contentLanguage ? { contentLanguage } : {}),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (id !== requestId.current) return;
        setState({
          kind: "error",
          message: data.error ?? t("formatEditor.editor.ai.requestFailed", { status: res.status }),
        });
        return;
      }
      const data = (await res.json()) as {
        text?: string;
        parsed?: string[] | null;
      };
      const text = (data.text ?? "").trim();
      if (!text) {
        setState({ kind: "error", message: t("formatEditor.editor.ai.emptyDraft") });
        return;
      }
      if (id !== requestId.current) return;
      setState({ kind: "ready", text, parsed: data.parsed ?? null });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setState({
        kind: "error",
        message: (err as Error).message ?? t("formatEditor.editor.ai.unknownError"),
      });
    }
  }

  function cancelSuggest() {
    requestId.current += 1;
    inFlight.current?.abort();
    inFlight.current = null;
    setState({ kind: "idle" });
    setNotice(t("formatEditor.editor.ai.cancelled"));
  }

  function apply(mode: "insert" | "replace") {
    if (state.kind !== "ready") return;
    const parsed = isHashtag
      ? state.text
          .split(/[\s,]+/)
          .map((value) => value.trim())
          .filter((value) => value.startsWith("#") && value.length > 1)
      : state.parsed;
    onApply(state.text, mode, parsed);
    setNotice(t("formatEditor.editor.ai.applySuccess"));
    setReplaceOpen(false);
  }

  return (
    <div className="space-y-2" data-testid={`per-field-ai-${field}`}>
      {state.kind === "idle" || state.kind === "error" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={suggest}
          disabled={Boolean(disabledReason)}
          aria-label={disabledReason ?? suggestAria}
          title={disabledReason ?? suggestAria}
          className="text-primary hover:bg-primary-subtle"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t("formatEditor.editor.ai.suggest")}
        </Button>
      ) : null}

      {state.kind === "loading" ? (
        <div
          className="text-label text-fg-muted inline-flex items-center gap-2"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t("formatEditor.editor.ai.drafting")}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11"
            onClick={cancelSuggest}
          >
            {t("formatEditor.editor.ai.cancel") || "Cancel"}
          </Button>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <p role="alert" className="text-label text-danger">
          {state.message}
        </p>
      ) : null}

      {state.kind === "ready" ? (
        <div className="border-primary-subtle bg-primary-subtle/40 space-y-2 rounded-[var(--radius-control)] border p-2">
          <p
            className="text-label text-fg-secondary font-semibold"
            role="status"
            aria-live="polite"
          >
            {contentLanguage
              ? t("formatEditor.editor.ai.suggestionHeaderWithLanguage", {
                  language: contentLanguage,
                })
              : t("formatEditor.editor.ai.suggestionHeader")}
          </p>
          {contentLanguage ? (
            <span
              className="text-label text-fg-muted inline-flex rounded-full border px-2 py-0.5"
              aria-label={t("formatEditor.editor.ai.languageBadge", { language: contentLanguage })}
            >
              {contentLanguage}
            </span>
          ) : null}
          <DirAwareTextarea
            locale={locale}
            value={state.text}
            onChange={(event) => setState({ ...state, text: event.target.value })}
            rows={Math.min(6, Math.max(2, state.text.split("\n").length + 1))}
            className="bg-surface"
            aria-label={t("formatEditor.editor.ai.suggestionHeader")}
          />
          {isHashtag && state.parsed ? (
            <ul className="flex flex-wrap gap-1.5" aria-label={t("formatEditor.fields.hashtags")}>
              {state.text
                .split(/[\s,]+/)
                .filter((tag) => tag.startsWith("#"))
                .map((tag, i) => (
                  <li
                    key={`${tag}-${i}`}
                    className="border-primary-subtle bg-surface text-body text-fg-primary rounded-full border px-2 py-0.5"
                  >
                    {tag}
                  </li>
                ))}
            </ul>
          ) : null}
          {notice ? (
            <p className="text-label text-success" role="status" aria-live="polite">
              {notice}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => apply("insert")}
              aria-label={t("formatEditor.editor.ai.insertAria")}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />{" "}
              {t("formatEditor.editor.ai.insert")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setReplaceOpen(true)}
              aria-label={t("formatEditor.editor.ai.replaceAria")}
            >
              {t("formatEditor.editor.ai.replace")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              onClick={() =>
                void navigator.clipboard?.writeText(state.text).then(() => setCopied(true))
              }
            >
              {copied ? t("formatEditor.editor.ai.copied") : t("formatEditor.editor.ai.copy")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={suggest}
              aria-label={t("formatEditor.editor.ai.tryAgainAria")}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{" "}
              {t("formatEditor.editor.ai.tryAgain")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setState({ kind: "idle" })}
              aria-label={t("formatEditor.editor.ai.dismissAria")}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> {t("formatEditor.editor.ai.dismiss")}
            </Button>
          </div>
        </div>
      ) : null}
      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent closeAriaLabel={t("common.close") || "Close"}>
          <DialogHeader>
            <DialogTitle>{t("formatEditor.editor.ai.replaceTitle")}</DialogTitle>
            <DialogDescription>{t("formatEditor.editor.ai.replaceBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setReplaceOpen(false)}>
              {t("formatEditor.editor.ai.cancel") || "Cancel"}
            </Button>
            <Button type="button" onClick={() => apply("replace")}>
              {t("formatEditor.editor.ai.confirmReplace") || t("formatEditor.editor.ai.replace")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
