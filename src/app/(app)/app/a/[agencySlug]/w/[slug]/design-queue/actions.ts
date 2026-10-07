"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { bulkArchiveContentItems, BulkArchiveSchema } from "@/lib/content/service";

/**
 * Design-queue bulk actions (FEAT-14, GAP-FULL-REVIEW-2026-08-25).
 *
 * The "Archive selected" server action wraps
 * `bulkArchiveContentItems` with a session check and the
 * revalidation. The form is posted from the
 * `DesignQueueBulkToolbar` client component which keeps the
 * selected-id state in the browser; the server never trusts the
 * selection and re-validates the schema + role gate.
 */

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return { id: session.user.id };
}

export async function bulkArchiveDesignQueueAction(input: {
  workspaceId: string;
  contentItemIds: string[];
}) {
  const actor = await requireSession();
  const parsed = BulkArchiveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  try {
    const result = await bulkArchiveContentItems(actor, parsed.data);
    revalidatePath(`/app`);
    return { ok: true, ...result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Bulk archive failed" };
  }
}
