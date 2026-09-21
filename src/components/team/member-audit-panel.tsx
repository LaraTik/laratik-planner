import * as React from "react";
import { ShieldCheck, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * AuditPanel — read-only surface mounted at the bottom of the
 * member-edit drawer.
 *
 * The list is intentionally short (5 rows max); it gives the actor the
 * context they need to think carefully about their next change:
 * "last edit was 3 weeks ago by Maya, role changed designer →
 *  workspace_manager". The audit data lives in `security_audit_event`
 * and is captured by the inviter / deactivator / role-updater server
 * actions — this component does not write, it only displays.
 *
 * The panel is empty-state friendly: a member with no prior
 * edits renders a friendly "first edit coming up" message instead of
 * an empty box that would suggest a bug.
 */

export type MemberAuditEntry = {
  /** Server-issued id, opaque to the UI. */
  id: string;
  /** Free-text action key (e.g. `member_roles_update`). */
  action: string;
  /** Human label, already translated by the caller. */
  label: string;
  /** Outcome line for failed/denied events. Empty string for success. */
  outcome: string;
  /** "success" | "denied" | "failed" — controls badge color. */
  outcomeKind: "success" | "denied" | "failed";
  /** ISO timestamp from the audit row. */
  at: Date;
  /** Optional actor display name. */
  actorName: string | null;
  /** Optional metadata excerpt (e.g. role delta summary). */
  metadata: string | null;
};

export interface MemberAuditPanelProps {
  entries: readonly MemberAuditEntry[];
  /** Bilingual hook — defaults to a passthrough so callers can omit it. */
  t?: (key: string, params?: Record<string, string | number>) => string;
  dataTestId?: string;
}

export function MemberAuditPanel({
  entries,
  t,
  dataTestId = "member-audit-panel",
}: MemberAuditPanelProps) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
  return (
    <section
      aria-labelledby={`${dataTestId}-title`}
      data-testid={dataTestId}
      className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-4"
    >
      <header className="mb-3 flex items-center gap-2">
        <History className="text-fg-secondary h-4 w-4" aria-hidden="true" />
        <h3 id={`${dataTestId}-title`} className="text-label text-fg-primary font-semibold">
          {tr("users.memberEdit.auditTitle", "Recent changes")}
        </h3>
        <ShieldCheck className="text-fg-muted ms-auto h-3.5 w-3.5" aria-hidden="true" />
      </header>
      {entries.length === 0 ? (
        <p className="text-body text-fg-muted" data-testid={`${dataTestId}-empty`}>
          {tr(
            "users.memberEdit.auditEmpty",
            "No prior access changes on file. The first change you make will appear here for the team to audit later.",
          )}
        </p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid={`${dataTestId}-row-${entry.action}-${entry.id}`}
              className="border-border bg-surface flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] border px-3 py-2"
            >
              <Badge variant={outcomeVariant(entry.outcomeKind)}>{entry.outcome}</Badge>
              <span className="text-body text-fg-primary font-medium">{entry.label}</span>
              {entry.actorName ? (
                <span className="text-label text-fg-muted">
                  {tr("users.memberEdit.auditBy", "by {name}", { name: entry.actorName })}
                </span>
              ) : null}
              {entry.metadata ? (
                <span className="text-label text-fg-muted ms-auto font-mono">{entry.metadata}</span>
              ) : null}
              <time dateTime={entry.at.toISOString()} className="text-label text-fg-muted w-full">
                {entry.at.toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function outcomeVariant(kind: MemberAuditEntry["outcomeKind"]): "success" | "warning" | "danger" {
  switch (kind) {
    case "success":
      return "success";
    case "denied":
      return "warning";
    case "failed":
      return "danger";
  }
}
