import { z } from "zod";
import { repairTruncatedJsonCandidates } from "./repair-truncated-json";

export type WorkspacePlanItem = {
  id: string;
  title: string;
  format: string;
  status: string;
  plannedPublishAt: Date;
};

export type WorkspaceAssistantEvidence = {
  id: string;
  source: string;
  retrievedAt: string;
  period: string;
  version?: string | null;
  completeness: "complete" | "bounded";
  itemCount: number;
};

export type WorkspaceAssistantFinding = {
  id: string;
  kind: "calendar_gap";
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
  evidenceIds: string[];
};

const findingSchema = z.object({
  title: z.string().trim().min(1).max(180),
  detail: z.string().trim().min(1).max(1_200),
  severity: z.enum(["low", "medium", "high"]),
  evidenceIds: z.array(z.string().max(160)).min(1).max(8),
});

const recommendationSchema = z.object({
  title: z.string().trim().min(1).max(180),
  detail: z.string().trim().min(1).max(1_200),
  evidenceIds: z.array(z.string().max(160)).min(1).max(8),
});

const proposedChangeSchema = z.object({
  field: z.enum(["title", "brief", "plannedPublishAt"]),
  title: z.string().trim().min(1).max(180),
  afterValue: z.string().trim().min(1).max(2_000),
  evidenceIds: z.array(z.string().max(160)).min(1).max(3),
});

const limitationSchema = z.string().trim().min(1).max(300);

const responseSchema = z.object({
  answer: z.string().trim().min(1).max(5_000),
  findings: z.array(findingSchema).max(8),
  recommendations: z.array(recommendationSchema).max(8),
  proposedChanges: z.array(proposedChangeSchema).max(3).default([]),
  limitations: z.array(limitationSchema).max(8),
});

export type WorkspaceAssistantResponse = z.infer<typeof responseSchema>;

export type WorkspaceAssistantToolResult = {
  name:
    | "get_plan_summary"
    | "get_calendar_distribution"
    | "get_content_mix"
    | "get_workload_summary"
    | "read_brand_knowledge"
    | "read_selected_plan_items"
    | "read_selected_content_item";
  summary: string;
  data: Record<string, string | number | string[]>;
};

export function analyzeWorkspacePlan(
  items: readonly WorkspacePlanItem[],
  input: { month: string; source: string; retrievedAt: string },
): {
  tools: WorkspaceAssistantToolResult[];
  findings: WorkspaceAssistantFinding[];
  evidence: WorkspaceAssistantEvidence[];
} {
  const evidenceId = `workspace-content-${input.month}`;
  const evidence: WorkspaceAssistantEvidence[] = [
    {
      id: evidenceId,
      source: input.source,
      retrievedAt: input.retrievedAt,
      period: input.month,
      completeness: items.length >= 200 ? "bounded" : "complete",
      itemCount: items.length,
    },
  ];
  const statusCounts = countBy(items, (item) => item.status);
  const formatCounts = countBy(items, (item) => item.format);
  const dailyCounts = countBy(items, (item) => item.plannedPublishAt.toISOString().slice(0, 10));
  const dated = items
    .map((item) => item.plannedPublishAt)
    .sort((a, b) => a.getTime() - b.getTime());
  const findings: WorkspaceAssistantFinding[] = [];

  for (let index = 1; index < dated.length; index += 1) {
    const previous = dated[index - 1];
    const current = dated[index];
    if (!previous || !current) continue;
    const gapDays = Math.floor((current.getTime() - previous.getTime()) / 86_400_000);
    if (gapDays > 7) {
      findings.push({
        id: `calendar-gap-${previous.toISOString().slice(0, 10)}-${current.toISOString().slice(0, 10)}`,
        kind: "calendar_gap",
        title: "Long gap between scheduled posts",
        detail: `${gapDays} days separate scheduled dates ${previous.toISOString().slice(0, 10)} and ${current.toISOString().slice(0, 10)}.`,
        severity: gapDays > 14 ? "high" : "medium",
        evidenceIds: [evidenceId],
      });
      if (findings.length === 8) break;
    }
  }

  const tools: WorkspaceAssistantToolResult[] = [
    {
      name: "get_plan_summary",
      summary: `The selected month contains ${items.length} active planned content items.`,
      data: {
        month: input.month,
        itemCount: items.length,
        statusCounts: Object.entries(statusCounts).map(([key, value]) => `${key}: ${value}`),
        evidenceId,
      },
    },
    {
      name: "get_calendar_distribution",
      summary: `${Object.keys(dailyCounts).length} distinct dates have planned content; ${findings.length} long-gap findings were detected.`,
      data: {
        activeDates: Object.keys(dailyCounts).length,
        dailyCounts: Object.entries(dailyCounts).map(([day, count]) => `${day}: ${count}`),
        findings: findings.map(
          ({ title, detail, severity }) => `${severity}: ${title} — ${detail}`,
        ),
        evidenceId,
      },
    },
    {
      name: "get_content_mix",
      summary: `${Object.keys(formatCounts).length} content formats appear in the selected month.`,
      data: {
        formatCounts: Object.entries(formatCounts).map(([format, count]) => `${format}: ${count}`),
        evidenceId,
      },
    },
  ];

  return { tools, findings, evidence };
}

export function parseWorkspaceAssistantResponse(
  text: string,
  allowedEvidenceIds: ReadonlySet<string>,
): WorkspaceAssistantResponse {
  const normalized = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = responseSchema.parse(JSON.parse(normalized) as unknown);
  assertKnownEvidenceReferences(parsed, allowedEvidenceIds);
  return parsed;
}

/**
 * Schema used to validate a response that had to be recovered from a
 * truncated provider answer.
 *
 * `answer` stays required — a recovered document without an answer is not
 * usable. The collections default to empty so a document that was cut off
 * before it emitted them can still be shown; the caller discloses the
 * truncation in the response limitations.
 */
const recoveredResponseSchema = z.object({
  answer: responseSchema.shape.answer,
  findings: z.array(findingSchema).max(8).default([]),
  recommendations: z.array(recommendationSchema).max(8).default([]),
  proposedChanges: z.array(proposedChangeSchema).max(3).default([]),
  limitations: z.array(limitationSchema).max(8).default([]),
});

export type WorkspaceAssistantParseResult = {
  /** The validated response. */
  response: WorkspaceAssistantResponse;
  /**
   * True when the provider cut the answer off and it was recovered from the
   * truncated document. The caller must disclose this to the user.
   */
  truncated: boolean;
};

/**
 * Parse an assistant response, recovering it from a truncated document when
 * the strict parse fails.
 *
 * A provider that reaches its output budget stops mid-document, so the raw
 * text is a *prefix* of a valid JSON document. Discarding it loses the parts
 * that were already complete — normally the `answer` field, which the model
 * emits first. Recovery is only accepted when the repaired document passes
 * schema validation and every evidence reference is known; otherwise the
 * original failure is raised unchanged.
 */
export function parseWorkspaceAssistantResponseWithRecovery(
  text: string,
  allowedEvidenceIds: ReadonlySet<string>,
): WorkspaceAssistantParseResult {
  try {
    return {
      response: parseWorkspaceAssistantResponse(text, allowedEvidenceIds),
      truncated: false,
    };
  } catch (strictError) {
    // The provider stopped mid-document. Recover the parts that are
    // complete, starting from the most complete recovery, and keep the
    // first one that yields a usable answer.
    for (const candidate of repairTruncatedJsonCandidates(text)) {
      const pruned = pruneRecoveredEntries(candidate, allowedEvidenceIds);
      if (!pruned) continue;
      const recovered = recoveredResponseSchema.safeParse(pruned);
      if (!recovered.success) continue;
      return { response: recovered.data, truncated: true };
    }
    throw strictError;
  }
}

/**
 * Drop the entries of a recovered document that cannot be shown.
 *
 * A truncated document often contains one entry that is itself half-written
 * — a finding without a detail, or one that cites evidence outside the
 * authorized context. Rejecting the whole document would throw away the
 * findings that are complete, so unusable entries are removed instead. The
 * caller discloses the truncation, so the user is told the answer is
 * incomplete.
 */
function pruneRecoveredEntries(
  value: unknown,
  allowedEvidenceIds: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    ...record,
    findings: pruneEntryList(record.findings, findingSchema, allowedEvidenceIds, 8),
    recommendations: pruneEntryList(
      record.recommendations,
      recommendationSchema,
      allowedEvidenceIds,
      8,
    ),
    proposedChanges: pruneEntryList(
      record.proposedChanges,
      proposedChangeSchema,
      allowedEvidenceIds,
      3,
    ),
    limitations: Array.isArray(record.limitations)
      ? record.limitations
          .filter(
            (limitation): limitation is string =>
              typeof limitation === "string" &&
              limitation.trim().length > 0 &&
              limitation.length <= 300,
          )
          .slice(0, 8)
      : [],
  };
}

function pruneEntryList(
  value: unknown,
  schema: z.ZodType<{ evidenceIds: string[] }>,
  allowedEvidenceIds: ReadonlySet<string>,
  maximum: number,
) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => {
      const parsed = schema.safeParse(entry);
      if (!parsed.success) return false;
      return parsed.data.evidenceIds.every((evidenceId) => allowedEvidenceIds.has(evidenceId));
    })
    .slice(0, maximum);
}

function assertKnownEvidenceReferences(
  parsed: {
    findings: ReadonlyArray<{ evidenceIds: readonly string[] }>;
    recommendations: ReadonlyArray<{ evidenceIds: readonly string[] }>;
    proposedChanges: ReadonlyArray<{ evidenceIds: readonly string[] }>;
  },
  allowedEvidenceIds: ReadonlySet<string>,
) {
  const references = [
    ...parsed.findings.flatMap((finding) => finding.evidenceIds),
    ...parsed.recommendations.flatMap((recommendation) => recommendation.evidenceIds),
    ...parsed.proposedChanges.flatMap((change) => change.evidenceIds),
  ];
  if (references.some((reference) => !allowedEvidenceIds.has(reference))) {
    throw new Error("Workspace assistant returned an unknown evidence reference");
  }
}

function countBy(items: readonly WorkspacePlanItem[], key: (item: WorkspacePlanItem) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}
