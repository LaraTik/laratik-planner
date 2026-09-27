import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { securityAuditEvents, workspaces } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { workspaceRenameCommandSchema } from "@/lib/workspaces/rename-command";

/**
 * Workspace rename — display name only.
 *
 * Deliberately narrow: this writes `workspace.name` and nothing else.
 * It does **not** touch `workspace.slug`, `workspace.timezone`, or
 * `workspace_settings`. Rationale for each omission is in
 * `rename-command.ts`; the short version is that `slug` is the URL
 * identity and the key of the anti-IDOR workspace lookup, and
 * `timezone` is owned by the Lifecycle settings action.
 *
 * Every successful mutation writes a `workspace_rename` row to
 * `security_audit_event`. The workspace name appears in the app
 * chrome, in destructive confirmations (the bulk-reset dialog asks
 * the operator to type the workspace name), and in exported reports —
 * so who changed it, and from what to what, is audit-relevant even
 * though the value itself is not sensitive. `from`/`to` are stored
 * explicitly rather than as a key-set diff: for a single-field
 * rename the diff *is* the before/after pair.
 *
 * Concurrency: the workspace row is locked with `FOR UPDATE` before
 * the read, matching `updateWorkspaceSettings`. Two managers
 * renaming at once therefore serialize, and the second one compares
 * against the first one's committed value rather than a stale read.
 */
export async function renameWorkspace(actor: Actor, raw: unknown) {
  const input = workspaceRenameCommandSchema.parse(raw);

  await requirePolicy(
    hasWorkspaceRole(actor, input.workspaceId, ["workspace_manager"]),
    "rename_workspace",
  );

  return db.transaction(async (tx) => {
    // Serialize on the stable workspace row, then read the current
    // name inside the same transaction so the comparison below is
    // against a locked, committed value.
    await tx.execute(sql`SELECT id FROM workspace WHERE id = ${input.workspaceId} FOR UPDATE`);

    const [current] = await tx
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, input.workspaceId))
      .limit(1);

    if (!current) {
      throw new WorkspaceNotFoundError();
    }

    // A no-op rename is not an error and not an audit event — the
    // UI surfaces it as "nothing changed" so a double-click does not
    // spam the audit log with identical rows.
    if (current.name === input.name) {
      return { ok: true as const, changed: false as const, name: current.name };
    }

    await tx
      .update(workspaces)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(workspaces.id, input.workspaceId));

    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "workspace_rename",
      targetType: "workspace",
      targetId: input.workspaceId,
      outcome: "success",
      metadata: { from: current.name, to: input.name },
    });

    return { ok: true as const, changed: true as const, name: input.name };
  });
}

/**
 * Distinct from the policy error so the action layer can map a
 * vanished workspace to a 404-shaped message rather than the generic
 * "could not be saved" used for real write failures.
 */
export class WorkspaceNotFoundError extends Error {
  constructor() {
    super("Workspace not found");
    this.name = "WorkspaceNotFoundError";
  }
}
