import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import {
  activeAgencyId,
  canAccessClientWorkspace,
  canAccessInternalWorkspace,
  type Actor,
} from "@/lib/auth/policy";

async function findWorkspaceBySlug(slug: string) {
  const agencyId = await activeAgencyId();
  if (!agencyId) return null;
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.slug, slug)))
    .limit(1);
  return workspace ?? null;
}

export async function getAccessibleWorkspace(actor: Actor, slug: string) {
  const workspace = await findWorkspaceBySlug(slug);
  if (!workspace || !(await canAccessInternalWorkspace(actor, workspace.id))) return null;
  return workspace;
}

export async function getClientWorkspace(actor: Actor, slug: string) {
  const workspace = await findWorkspaceBySlug(slug);
  if (!workspace || !(await canAccessClientWorkspace(actor, workspace.id))) return null;
  return workspace;
}
