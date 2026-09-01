import * as React from "react";
import type { BrandPublishingRuleRow } from "@/lib/brand/service";
import { ArchiveWithUndo } from "./archive-with-undo";
import { archivePublishingRuleAction, restorePublishingRuleAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { SectionEmptyState } from "@/components/workspace/section-empty-state";
import { Link as LinkIcon } from "lucide-react";

/**
 * PublishingRuleList — the row-5 "Publishing Rules" section list.
 *
 * Round 4 adds:
 *   - A uniform `<EmptyState>` (replaces a `<p>No publishing rules
 *     yet…</p>`).
 *   - `ArchiveWithUndo` for the destructive action.
 *   - A clearer "General" / "Channel-specific" caption alongside the
 *     type badge so the colour is never the only signal.
 */
export interface PublishingRuleListProps {
  slug: string;
  canManage: boolean;
  rules: BrandPublishingRuleRow[];
  /**
   * Optional translator. When provided, the empty state title +
   * description render from `brandKit.empty.{publishingTitle,publishingDescription}`;
   * when omitted, the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

const RULE_TYPE_VARIANT: Record<string, "info" | "warning" | "default" | "primary" | "success"> = {
  alt_text: "info",
  hashtag: "primary",
  compliance: "warning",
  channel: "default",
  general: "default",
};

const RULE_TYPE_LABEL: Record<string, string> = {
  alt_text: "Alt text",
  hashtag: "Hashtags",
  compliance: "Compliance",
  channel: "Channel-specific",
  general: "General",
};

export function PublishingRuleList({ slug, canManage, rules, t }: PublishingRuleListProps) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  if (rules.length === 0) {
    return (
      <SectionEmptyState
        icon={LinkIcon}
        title={tr("brandKit.empty.publishingTitle", "No publishing rules yet")}
        description={tr(
          "brandKit.empty.publishingDescription",
          "Add the first one to set editorial guardrails — alt text, hashtag norms, compliance reminders — for the team.",
        )}
        testId="brand-kit-empty-publishing"
      />
    );
  }
  return (
    <ul className="space-y-2" data-testid="brand-kit-publishing-rules">
      {rules.map((rule) => {
        const variant = RULE_TYPE_VARIANT[rule.ruleType] ?? "default";
        const label = RULE_TYPE_LABEL[rule.ruleType] ?? "General";
        return (
          <li
            key={rule.id}
            data-testid={`brand-publishing-rule-${rule.id}`}
            className="bg-surface-subtle flex flex-col gap-1 rounded-[var(--radius-control)] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Badge variant={variant} className="w-fit">
                  {label}
                </Badge>
                <p className="text-body text-fg-primary font-semibold">{rule.title}</p>
              </div>
              {canManage ? (
                <ArchiveWithUndo
                  slug={slug}
                  id={rule.id}
                  label="publishing rule"
                  name={rule.title}
                  archiveAction={archivePublishingRuleAction}
                  restoreAction={restorePublishingRuleAction}
                  data-testid={`brand-publishing-rule-archive-${rule.id}`}
                />
              ) : null}
            </div>
            <p className="text-body text-fg-secondary whitespace-pre-line">{rule.content}</p>
          </li>
        );
      })}
    </ul>
  );
}
