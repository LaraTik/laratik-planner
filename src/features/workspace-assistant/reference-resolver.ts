import "server-only";
import { z } from "zod";
import { getContentItem, listWorkspaceContent } from "@/features/content/server";
import { PermissionDeniedError, type Actor } from "@/lib/auth/policy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonicalPlannerPath = /^\/app\/a\/[^/]+\/w\/([^/]+)\/planning\/([0-9a-f-]{36})(?:\/|$)/i;
const legacyPlannerPath = /^\/app\/w\/([^/]+)\/planning\/([0-9a-f-]{36})(?:\/|$)/i;
const monthNames = new Map<string, string>([
  ["january", "01"],
  ["jan", "01"],
  ["february", "02"],
  ["feb", "02"],
  ["march", "03"],
  ["mar", "03"],
  ["april", "04"],
  ["apr", "04"],
  ["may", "05"],
  ["june", "06"],
  ["jun", "06"],
  ["july", "07"],
  ["jul", "07"],
  ["august", "08"],
  ["aug", "08"],
  ["september", "09"],
  ["sep", "09"],
  ["october", "10"],
  ["oct", "10"],
  ["november", "11"],
  ["nov", "11"],
  ["december", "12"],
  ["dec", "12"],
  ["يناير", "01"],
  ["فبراير", "02"],
  ["مارس", "03"],
  ["أبريل", "04"],
  ["مايو", "05"],
  ["يونيو", "06"],
  ["يوليو", "07"],
  ["أغسطس", "08"],
  ["سبتمبر", "09"],
  ["أكتوبر", "10"],
  ["نوفمبر", "11"],
  ["ديسمبر", "12"],
]);

export const WorkspaceContentReferenceSchema = z.string().trim().min(1).max(500);

export type ResolvedWorkspaceContent = {
  id: string;
  title: string;
  brief: string;
  format: string;
  status: string;
  plannedPublishAt: string;
  revision: number;
  formatPayload: Record<string, unknown> | null;
  channels: { platform: string; accountName: string | null }[];
};

export type WorkspaceContentReferenceResult =
  | { status: "resolved"; item: ResolvedWorkspaceContent }
  | { status: "plan"; month: string | null }
  | { status: "ambiguous"; candidates: WorkspaceContentCandidate[] }
  | { status: "not_found" };

export type WorkspaceContentCandidate = {
  id: string;
  title: string;
  format: string;
  status: string;
  plannedPublishAt: string;
  revision: number;
};

type ParsedReference =
  | { kind: "id"; id: string }
  | { kind: "workspace_item_url"; id: string }
  | { kind: "plan_url"; month: string | null }
  | { kind: "selected_plan" }
  | { kind: "title"; title: string }
  | { kind: "invalid_url" };

export function parseWorkspaceContentReference(
  rawReference: string,
  workspaceSlug: string,
): ParsedReference {
  const reference = rawReference.trim();
  if (UUID.test(reference)) return { kind: "id", id: reference };
  if (
    /^(?:current|selected|this month's|this month|current month|current plan|selected plan|monthly plan|plan|الخطة الحالية|الخطة المحددة|هذه الخطة|الخطة)$/i.test(
      reference,
    )
  ) {
    return { kind: "selected_plan" };
  }

  const isUrl = /^(?:https?:\/\/|\/)/i.test(reference);
  if (isUrl) {
    let path: string;
    let searchParams: URLSearchParams;
    try {
      const url = new URL(reference, "https://planner.invalid");
      path = url.pathname;
      searchParams = url.searchParams;
    } catch {
      return { kind: "invalid_url" };
    }
    const itemMatch = canonicalPlannerPath.exec(path) ?? legacyPlannerPath.exec(path);
    if (itemMatch && itemMatch[1] === workspaceSlug) {
      const id = itemMatch[2] ?? "";
      return UUID.test(id) ? { kind: "workspace_item_url", id } : { kind: "invalid_url" };
    }
    const planPath =
      /^\/app\/a\/[^/]+\/w\/([^/]+)\/(?:calendar|planning)(?:\/|$)/i.exec(path) ??
      /^\/app\/w\/([^/]+)\/(?:calendar|planning)(?:\/|$)/i.exec(path);
    if (planPath?.[1] === workspaceSlug) {
      const month = searchParams.get("month") ?? searchParams.get("period");
      return {
        kind: "plan_url",
        month: month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null,
      };
    }
    return { kind: "invalid_url" };
  }

  const monthMatch = /^(?:(?:plan|calendar)\s+(?:for\s+)?)?(\d{4})-(0[1-9]|1[0-2])$/i.exec(
    reference,
  );
  if (monthMatch) return { kind: "plan_url", month: `${monthMatch[1]}-${monthMatch[2]}` };
  const namedMonth =
    /^(?:(?:plan|calendar)\s+(?:for\s+)?)?([\p{L}.]+)\s+(\d{4})(?:\s+plan)?$/iu.exec(reference);
  const monthNumber = namedMonth
    ? monthNames.get(namedMonth[1]!.replace(/\.$/, "").toLowerCase())
    : null;
  if (namedMonth && monthNumber)
    return { kind: "plan_url", month: `${namedMonth[2]}-${monthNumber}` };

  return { kind: "title", title: reference };
}

export async function resolveWorkspaceContentReference(
  actor: Actor,
  workspaceId: string,
  workspaceSlug: string,
  rawReference: string,
): Promise<WorkspaceContentReferenceResult> {
  const parsed = WorkspaceContentReferenceSchema.safeParse(rawReference);
  if (!parsed.success) return { status: "not_found" };
  const reference = parseWorkspaceContentReference(parsed.data, workspaceSlug);

  if (reference.kind === "invalid_url") return { status: "not_found" };
  if (reference.kind === "selected_plan") return { status: "plan", month: null };
  if (reference.kind === "plan_url") return { status: "plan", month: reference.month };
  if (reference.kind === "id" || reference.kind === "workspace_item_url") {
    const item = await getAuthorizedItem(actor, workspaceId, reference.id);
    return item ? { status: "resolved", item } : { status: "not_found" };
  }

  const candidates = await listWorkspaceContent(actor, workspaceId, {
    search: reference.title,
    limit: 10,
  });
  const title = reference.title.toLocaleLowerCase();
  const matchingTitles = candidates.filter((candidate) =>
    candidate.title.toLocaleLowerCase().includes(title),
  );
  const exactMatches = matchingTitles.filter(
    (candidate) => candidate.title.trim().toLocaleLowerCase() === title,
  );
  const ranked = exactMatches.length ? exactMatches : matchingTitles;
  if (ranked.length === 0) return { status: "not_found" };

  const safeCandidates = ranked.slice(0, 5).map(toCandidate);
  if (ranked.length > 1) return { status: "ambiguous", candidates: safeCandidates };
  const item = await getAuthorizedItem(actor, workspaceId, ranked[0]!.id);
  return item ? { status: "resolved", item } : { status: "not_found" };
}

async function getAuthorizedItem(actor: Actor, workspaceId: string, itemId: string) {
  try {
    const item = await getContentItem(actor, itemId);
    if (!item || item.workspaceId !== workspaceId) return null;
    return {
      id: item.id,
      title: item.title,
      brief: item.brief.slice(0, 2_000),
      format: item.format,
      status: item.status,
      plannedPublishAt: item.plannedPublishAt.toISOString(),
      revision: item.revision,
      formatPayload: item.formatPayload as Record<string, unknown> | null,
      channels: item.channels.map((channel) => ({
        platform: channel.platform,
        accountName: channel.accountName,
      })),
    } satisfies ResolvedWorkspaceContent;
  } catch (error) {
    // An unknown and a cross-workspace reference have the same external result.
    if (error instanceof PermissionDeniedError) return null;
    throw error;
  }
}

function toCandidate(item: {
  id: string;
  title: string;
  format: string;
  status: string;
  plannedPublishAt: Date;
  revision: number;
}): WorkspaceContentCandidate {
  return {
    id: item.id,
    title: item.title,
    format: item.format,
    status: item.status,
    plannedPublishAt: item.plannedPublishAt.toISOString(),
    revision: item.revision,
  };
}
