"use client";
import * as React from "react";
import { useActionState } from "react";
import { createVoiceRuleAction } from "./actions";
import { useSuccessReset } from "@/lib/brand/use-success-reset";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { CharacterCountInput } from "@/components/workspace/character-count-input";
import { VoiceRuleSuggestions } from "./voice-rule-suggestions";

/**
 * VoiceForm — three inline sub-forms (Tone / Do / Don't) that all
 * submit through `createVoiceRuleAction` with a hidden `ruleType`
 * discriminator. The discriminator and the maximum length are
 * bound at the form level (tone is shorter — 60 chars — while
 * do/dont allow 280). The Zod schema on the server enforces the
 * same limits.
 *
 * Phase 8: each sub-form is now controlled so the AI suggestion
 * flow (`VoiceRuleSuggestions`) can fill the textarea when the
 * user picks a chip. The picker calls `onPick` and the parent
 * updates the state; the next submit posts the (possibly
 * edited) value.
 */
type RuleType = "tone" | "do" | "dont";

const MAX_LENGTH: Record<RuleType, number> = {
  tone: 60,
  do: 280,
  dont: 280,
};

const FIELD_LABEL_KEY: Record<RuleType, string> = {
  tone: "users.voiceForm.fieldTone",
  do: "users.voiceForm.fieldDo",
  dont: "users.voiceForm.fieldDont",
};
const FIELD_LABEL_FALLBACK: Record<RuleType, string> = {
  tone: "Tone",
  do: "Do",
  dont: "Don't",
};
const PLACEHOLDER_KEY: Record<RuleType, string> = {
  tone: "users.voiceForm.placeholderTone",
  do: "users.voiceForm.placeholderDo",
  dont: "users.voiceForm.placeholderDont",
};
const PLACEHOLDER_FALLBACK: Record<RuleType, string> = {
  tone: "Warm, direct, never patronising.",
  do: "Lead with the customer's outcome.",
  dont: "Avoid corporate jargon like 'synergy'.",
};
const SUBMIT_KEY: Record<RuleType, string> = {
  tone: "users.voiceForm.addTone",
  do: "users.voiceForm.addDo",
  dont: "users.voiceForm.addDont",
};
const SUBMIT_FALLBACK: Record<RuleType, string> = {
  tone: "Add tone",
  do: "Add do",
  dont: "Add don't",
};

function RuleSubForm({
  slug,
  ruleType,
  value,
  onValueChange,
  t,
}: {
  slug: string;
  ruleType: RuleType;
  value: string;
  onValueChange: (next: string) => void;
  /**
   * Optional translator. When provided, the field label +
   * placeholder + submit button render from
   * `users.voiceForm.*`; when omitted, the stored English copy
   * is used.
   */
  t?: (key: string) => string;
}) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  const [state, action] = useActionState(
    createVoiceRuleAction.bind(null, slug),
    {} as { error?: string; success?: boolean },
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  // Round 5: reset each sub-form on success so the user can add
  // another tone/do/don't without manually clearing the input.
  useSuccessReset(state, formRef);
  const max = MAX_LENGTH[ruleType];
  const useTextarea = ruleType !== "tone";
  return (
    <form ref={formRef} action={action} className="grid gap-3">
      <input type="hidden" name="ruleType" value={ruleType} />
      <FormField
        id={`voice-rule-${ruleType}-content`}
        label={tr(FIELD_LABEL_KEY[ruleType], FIELD_LABEL_FALLBACK[ruleType])}
        required
      >
        {useTextarea ? (
          <CharacterCountInput
            as="textarea"
            id={`voice-rule-${ruleType}-content`}
            name="content"
            required
            maxLength={max}
            rows={2}
            placeholder={tr(PLACEHOLDER_KEY[ruleType], PLACEHOLDER_FALLBACK[ruleType])}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
          />
        ) : (
          <CharacterCountInput
            id={`voice-rule-${ruleType}-content`}
            name="content"
            required
            maxLength={max}
            placeholder={tr(PLACEHOLDER_KEY[ruleType], PLACEHOLDER_FALLBACK[ruleType])}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
          />
        )}
      </FormField>
      <div className="flex items-center justify-end">
        <FormSubmitButton
          size="sm"
          label={tr(SUBMIT_KEY[ruleType], SUBMIT_FALLBACK[ruleType])}
          pendingLabel={tr("users.voiceForm.adding", "Adding…")}
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-label text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function VoiceForm({
  slug,
  t,
}: {
  slug: string;
  /**
   * Optional translator. When provided, threads t through to the
   * 3 RuleSubForm and 3 VoiceRuleSuggestions instances so the
   * field labels, placeholders, submit buttons, and AI suggestion
   * button labels render from the active locale; when omitted, the
   * stored English copy is used.
   */
  t?: (key: string) => string;
}) {
  const [tone, setTone] = React.useState("");
  const [doRule, setDoRule] = React.useState("");
  const [dontRule, setDontRule] = React.useState("");

  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-3">
      <Card padding="md">
        <div className="space-y-3">
          <RuleSubForm
            slug={slug}
            ruleType="tone"
            value={tone}
            onValueChange={setTone}
            {...(t ? { t } : {})}
          />
          <VoiceRuleSuggestions
            slug={slug}
            ruleType="tone"
            onPick={setTone}
            {...(t ? { t } : {})}
          />
        </div>
      </Card>
      <Card padding="md">
        <div className="space-y-3">
          <RuleSubForm
            slug={slug}
            ruleType="do"
            value={doRule}
            onValueChange={setDoRule}
            {...(t ? { t } : {})}
          />
          <VoiceRuleSuggestions
            slug={slug}
            ruleType="do"
            onPick={setDoRule}
            {...(t ? { t } : {})}
          />
        </div>
      </Card>
      <Card padding="md">
        <div className="space-y-3">
          <RuleSubForm
            slug={slug}
            ruleType="dont"
            value={dontRule}
            onValueChange={setDontRule}
            {...(t ? { t } : {})}
          />
          <VoiceRuleSuggestions
            slug={slug}
            ruleType="dont"
            onPick={setDontRule}
            {...(t ? { t } : {})}
          />
        </div>
      </Card>
    </div>
  );
}
