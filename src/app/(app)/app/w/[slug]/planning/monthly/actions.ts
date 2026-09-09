"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { createMonthlyPlanningSession } from "@/lib/ai/monthly-planning";

export async function createMonthlySessionAction(slug: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) redirect("/app");
  const month = String(formData.get("month") ?? "");
  const created = await createMonthlyPlanningSession({ id: session.user.id }, workspace.id, month);
  redirect(`/app/w/${slug}/planning/monthly/${created.id}`);
}
