import { z } from "zod";

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

const responseSchema = z.object({
  answer: z.string().trim().min(1).max(5_000),
  findings: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(180),
        detail: z.string().trim().min(1).max(1_200),
        severity: z.enum(["low", "medium", "high"]),
        evidenceIds: z.array(z.string().max(160)).min(1).max(8),
      }),
    )
    .max(8),
  recommendations: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(180),
        detail: z.string().trim().min(1).max(1_200),
        evidenceIds: z.array(z.string().max(160)).min(1).max(8),
      }),
    )
    .max(8),
  proposedChanges: z
    .array(
      z.object({
        field: z.enum(["title", "brief", "plannedPublishAt"]),
        title: z.string().trim().min(1).max(180),
        afterValue: z.string().trim().min(1).max(2_000),
        evidenceIds: z.array(z.string().max(160)).min(1).max(3),
      }),
    )
    .max(3)
    .default([]),
  limitations: z.array(z.string().trim().min(1).max(300)).max(8),
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
  const references = [
    ...parsed.findings.flatMap((finding) => finding.evidenceIds),
    ...parsed.recommendations.flatMap((recommendation) => recommendation.evidenceIds),
    ...parsed.proposedChanges.flatMap((change) => change.evidenceIds),
  ];
  if (references.some((reference) => !allowedEvidenceIds.has(reference))) {
    throw new Error("Workspace assistant returned an unknown evidence reference");
  }
  return parsed;
}

function countBy(items: readonly WorkspacePlanItem[], key: (item: WorkspacePlanItem) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}
