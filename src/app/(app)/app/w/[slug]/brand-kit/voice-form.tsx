"use client";
import * as React from "react";
import { useActionState } from "react";
import { createVoiceRuleAction } from "./actions";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";

/**
 * VoiceForm — three inline sub-forms (Tone / Do / Don't) that all
 * submit through `createVoiceRuleAction` with a hidden `ruleType`
 * discriminator. The discriminator and the maximum length are
 * bound at the form level (tone is shorter — 60 chars — while
 * do/dont allow 280). The Zod schema on the server enforces the
 * same limits.
 */
type RuleType = "tone" | "do" | "dont";

const MAX_LENGTH: Record<RuleType, number> = {
  tone: 60,
  do: 280,
  dont: 280,
};

const PLACEHOLDER: Record<RuleType, string> = {
  tone: "Warm, direct, never patronising.",
  do: "Lead with the customer's outcome.",
  dont: "Avoid corporate jargon like 'synergy'.",
};

const LABEL: Record<RuleType, string> = {
  tone: "Add tone",
  do: "Add do",
  dont: "Add don't",
};

function RuleSubForm({ slug, ruleType }: { slug: string; ruleType: RuleType }) {
  const [state, action] = useActionState(
    createVoiceRuleAction.bind(null, slug),
    {} as { error?: string; success?: boolean },
  );
  const max = MAX_LENGTH[ruleType];
  const useTextarea = ruleType !== "tone";
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="ruleType" value={ruleType} />
      <label className="text-label font-semibold">
        {ruleType === "tone" ? "Tone" : ruleType === "do" ? "Do" : "Don't"}
        {useTextarea ? (
          <textarea
            className="border-border bg-surface text-body text-fg-primary mt-1 block w-full rounded-[var(--radius-control)] border px-3 py-2"
            name="content"
            required
            maxLength={max}
            rows={2}
            placeholder={PLACEHOLDER[ruleType]}
          />
        ) : (
          <Input
            className="mt-1"
            name="content"
            required
            maxLength={max}
            placeholder={PLACEHOLDER[ruleType]}
          />
        )}
      </label>
      <div className="flex items-center justify-between">
        <span className="text-label text-fg-muted">{max} chars max</span>
        <FormSubmitButton size="sm" label={LABEL[ruleType]} pendingLabel="Adding…" />
      </div>
      {state?.error ? (
        <p role="alert" className="text-label text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function VoiceForm({ slug }: { slug: string }) {
  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-3">
      <Card padding="md">
        <RuleSubForm slug={slug} ruleType="tone" />
      </Card>
      <Card padding="md">
        <RuleSubForm slug={slug} ruleType="do" />
      </Card>
      <Card padding="md">
        <RuleSubForm slug={slug} ruleType="dont" />
      </Card>
    </div>
  );
}
