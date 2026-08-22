import * as React from "react";
import type { BrandVoiceRuleRow } from "@/lib/brand/service";
import { ArchiveWithUndo } from "./archive-with-undo";
import { archiveVoiceRuleAction, restoreVoiceRuleAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Sparkles } from "lucide-react";

/**
 * VoiceRuleList — the row-4 "Voice & tone" section list.
 *
 * Round 4 adds:
 *   - A uniform `<EmptyState>` fallback (was already a one-off before).
 *   - `ArchiveWithUndo` for the destructive action (was a plain
 *     one-click icon).
 *   - A clearer rule-type icon + caption ("Tone" / "Do" / "Don't")
 *     so the badge colour is never the only signal (a master prompt
 *     §18 requirement).
 */
export interface VoiceRuleListProps {
  slug: string;
  canManage: boolean;
  rules: BrandVoiceRuleRow[];
}

const RULE_TYPE_VARIANT: Record<string, "success" | "danger" | "info"> = {
  do: "success",
  dont: "danger",
  tone: "info",
};

const RULE_TYPE_LABEL: Record<string, string> = {
  do: "Do",
  dont: "Don't",
  tone: "Tone",
};

export function VoiceRuleList({ slug, canManage, rules }: VoiceRuleListProps) {
  if (rules.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="h-7 w-7" aria-hidden="true" />}
        title="No voice guidance"
        description="Add do/don't/tone rules so the team writes in one voice. The rules surface in the editor's draft-time hints."
      />
    );
  }
  return (
    <ul className="space-y-2" data-testid="brand-kit-voice-rules">
      {rules.map((rule) => {
        const variant = RULE_TYPE_VARIANT[rule.ruleType] ?? "info";
        const label = RULE_TYPE_LABEL[rule.ruleType] ?? rule.ruleType;
        return (
          <li
            key={rule.id}
            data-testid={`brand-voice-rule-${rule.id}`}
            className="bg-surface-subtle flex items-start gap-3 rounded-[var(--radius-control)] p-3"
          >
            <Badge variant={variant} className="shrink-0">
              {label}
            </Badge>
            <p className="text-body text-fg-primary flex-1">{rule.content}</p>
            {canManage ? (
              <ArchiveWithUndo
                slug={slug}
                id={rule.id}
                label="voice rule"
                name={rule.content.slice(0, 40)}
                archiveAction={archiveVoiceRuleAction}
                restoreAction={restoreVoiceRuleAction}
                variant="archive"
                data-testid={`brand-voice-rule-archive-${rule.id}`}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
