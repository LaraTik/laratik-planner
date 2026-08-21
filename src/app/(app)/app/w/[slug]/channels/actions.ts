"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";
import { ChannelCommandSchema } from "@/lib/channels/command";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

export async function createChannelAction(slug: string, _previous: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { error: "Workspace manager access is required." };
  const parsed = ChannelCommandSchema.safeParse({
    platform: formData.get("platform"),
    accountName: formData.get("accountName"),
    handle: formData.get("handle") || undefined,
    url: formData.get("url") || undefined,
    accountType: formData.get("accountType") || undefined,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the account information." };
  await db.insert(socialChannels).values({ workspaceId: workspace.id, ...parsed.data });
  revalidatePath(`/app/w/${slug}/channels`);
  return { success: true };
}

export async function archiveChannelAction(slug: string, channelId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return;
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return;
  await db
    .update(socialChannels)
    .set({
      isActive: false,
      archivedAt: new Date(),
      archivedBy: session.user.id,
      updatedAt: new Date(),
    })
    .where(and(eq(socialChannels.id, channelId), eq(socialChannels.workspaceId, workspace.id)));
  revalidatePath(`/app/w/${slug}/channels`);
}

/**
 * Update a social channel's editable fields. Re-checks the
 * `workspace_manager` role at the server (never trust the client),
 * validates with the shared `ChannelCommandSchema`, scopes the update
 * to the actor's workspace, and bumps `updatedAt` so the table's
 * "Last updated" column reflects the change.
 *
 * `prev` is the existing action-state (typically `null` on the first
 * submit). It is unused but kept in the signature so the component can
 * bind this action the same way `createChannelAction` is bound with
 * `useActionState(action.bind(null, slug), initialState)`.
 */
export async function updateChannelAction(
  slug: string,
  channelId: string,
  _previous: unknown,
  formData: FormData,
) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { error: "Workspace not found." };
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"])))
    return { error: "Workspace manager access is required." };
  const parsed = ChannelCommandSchema.safeParse({
    platform: formData.get("platform"),
    accountName: formData.get("accountName"),
    handle: formData.get("handle") || undefined,
    url: formData.get("url") || undefined,
    accountType: formData.get("accountType") || undefined,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the account information." };
  await db
    .update(socialChannels)
    .set({
      platform: parsed.data.platform,
      accountName: parsed.data.accountName,
      handle: parsed.data.handle ?? null,
      url: parsed.data.url ?? null,
      accountType: parsed.data.accountType ?? null,
      isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
      updatedAt: new Date(),
    })
    .where(and(eq(socialChannels.id, channelId), eq(socialChannels.workspaceId, workspace.id)));
  revalidatePath(`/app/w/${slug}/channels`);
  return { success: true };
}
