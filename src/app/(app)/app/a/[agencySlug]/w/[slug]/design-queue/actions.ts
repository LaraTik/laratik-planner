"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { PermissionDeniedError } from "@/lib/auth/policy";
import { logError } from "@/lib/observability/logger";
import { bulkArchiveContentItems, BulkArchiveSchema } from "@/features/content/server";

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

export type BulkArchiveDesignQueueErrorCode =
  "unauthenticated" | "invalidSelection" | "forbidden" | "failed";

export async function bulkArchiveDesignQueueAction(input: unknown) {
  const session = await auth();
  if (!session?.user?.id) return { errorCode: "unauthenticated" as const };
  const parsed = BulkArchiveSchema.safeParse(input);
  if (!parsed.success) return { errorCode: "invalidSelection" as const };
  try {
    const result = await bulkArchiveContentItems({ id: session.user.id }, parsed.data);
    revalidatePath(`/app`);
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof PermissionDeniedError) return { errorCode: "forbidden" as const };
    logError("design_queue.bulk_archive_failed", { err, workspaceId: parsed.data.workspaceId });
    return { errorCode: "failed" as const };
  }
}
