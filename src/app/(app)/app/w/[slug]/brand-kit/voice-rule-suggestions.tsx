"use client";
import * as React from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { suggestVoiceRulesAction } from "./actions";

/**
 * VoiceRuleSuggestions — the AI-suggest button that sits under
 * each voice sub-form (tone / do / don't). When the user clicks
 * "Suggest", the component calls `suggestVoiceRulesAction` and
 * renders the 2-3 returned rules as clickable chips. Clicking a
 * chip fills the matching textarea; the user can edit before
 * submitting.
 *
 * The button is the only surface that calls the AI for voice
 * rules. We deliberately do NOT auto-populate the form on mount
 * (a model call per page load is wasteful) and we deliberately
 * do NOT auto-submit the suggestion (every AI output is a draft
 * the user must review — master prompt §0.13 "AI never bypasses
 * human control").
 */
export interface VoiceRuleSuggestionsProps {
  slug: string;
  ruleType: "tone" | "do" | "dont";
  /** Called with the chosen suggestion so the parent can fill the form. */
  onPick: (value: string) => void;
  /**
   * Optional translator. When provided, the suggest button label,
   * the "Pick a suggestion to fill the form" hint, the empty-state
   * line, and the error fallback all render from
   * `users.voiceSuggestions.*`; when omitted, the stored English
   * copy is used.
   */
  t?: (key: string) => string;
}

type Status = "idle" | "loading" | "ready" | "error";

const SUGGEST_KEY: Record<"tone" | "do" | "dont", string> = {
  tone: "users.voiceSuggestions.suggestTone",
  do: "users.voiceSuggestions.suggestDo",
  dont: "users.voiceSuggestions.suggestDont",
};
const SUGGEST_FALLBACK: Record<"tone" | "do" | "dont", string> = {
  tone: "Suggest tone",
  do: "Suggest do rules",
  dont: "Suggest don'ts",
};

export function VoiceRuleSuggestions({ slug, ruleType, onPick, t }: VoiceRuleSuggestionsProps) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  const [status, setStatus] = React.useState<Status>("idle");
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  async function onSuggest() {
    setStatus("loading");
    setError(null);
    const res = await suggestVoiceRulesAction(slug, ruleType);
    if (!res.ok) {
      setStatus("error");
      setError(res.error ?? tr("users.voiceSuggestions.errorFallback", "AI suggestion failed."));
      return;
    }
    setSuggestions(res.suggestions ?? []);
    setStatus("ready");
  }

  return (
    <div className="space-y-2" data-testid={`voice-suggest-${ruleType}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSuggest}
          disabled={status === "loading"}
          data-testid={`voice-suggest-${ruleType}-button`}
          className="text-label text-primary border-border hover:bg-primary-subtle focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {tr(SUGGEST_KEY[ruleType], SUGGEST_FALLBACK[ruleType])}
        </button>
        {status === "ready" && suggestions.length > 0 ? (
          <span className="text-label text-fg-muted">
            {tr(
              "users.voiceSuggestions.pickHint",
              "Pick a suggestion to fill the form, then edit.",
            )}
          </span>
        ) : null}
      </div>
      {status === "error" && error ? (
        <p role="alert" className="text-label text-danger">
          {error}
        </p>
      ) : null}
      {status === "ready" && suggestions.length === 0 ? (
        <p className="text-label text-fg-muted">
          {tr(
            "users.voiceSuggestions.empty",
            "The model did not return any suggestions. Try again or write one yourself.",
          )}
        </p>
      ) : null}
      {status === "ready" && suggestions.length > 0 ? (
        <ul className="flex flex-col gap-1.5" data-testid={`voice-suggest-${ruleType}-list`}>
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onPick(s)}
                data-testid={`voice-suggest-${ruleType}-option-${i}`}
                className="border-border bg-surface hover:border-primary hover:bg-primary-subtle focus-visible:ring-focus-ring text-body text-fg-primary block w-full rounded-[var(--radius-control)] border px-3 py-2 text-start transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
