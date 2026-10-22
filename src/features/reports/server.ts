import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialChannels, workspaces } from "@/lib/db/schema";

export interface AgencyReportSelection {
  workspaceIds: string[];
  channelIds: string[];
}

/**
 * Verify every submitted report scope belongs to the active agency and
 * that each selected channel belongs to one of the selected workspaces.
 * Return only the validated IDs so callers persist the same safe scope
 * that will be rendered.
 */
export async function resolveAgencyReportSelection(input: {
  agencyId: string;
  workspaceIds: string[];
  channelIds: string[];
}): Promise<AgencyReportSelection | null> {
  if (
    input.workspaceIds.length === 0 ||
    input.channelIds.length === 0 ||
    new Set(input.workspaceIds).size !== input.workspaceIds.length ||
    new Set(input.channelIds).size !== input.channelIds.length
  ) {
    return null;
  }

  const agencyWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(eq(workspaces.agencyId, input.agencyId), inArray(workspaces.id, input.workspaceIds)),
    );
  if (agencyWorkspaces.length !== input.workspaceIds.length) return null;

  const agencyChannels = await db
    .select({ id: socialChannels.id })
    .from(socialChannels)
    .innerJoin(workspaces, eq(workspaces.id, socialChannels.workspaceId))
    .where(
      and(
        eq(workspaces.agencyId, input.agencyId),
        inArray(workspaces.id, input.workspaceIds),
        inArray(socialChannels.id, input.channelIds),
      ),
    );
  if (agencyChannels.length !== input.channelIds.length) return null;

  return {
    workspaceIds: input.workspaceIds,
    channelIds: input.channelIds,
  };
}
