"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import {
  archiveTask,
  createTask,
  restoreTask,
  updateTask,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/service";

function dateFromForm(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getActorContext() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  return { actor, agencyId: context.agencyId };
}

export async function createTaskAction(formData: FormData) {
  const { actor, agencyId } = await getActorContext();
  const task = await createTask(actor, {
    agencyId,
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    workspaceId: String(formData.get("workspaceId") ?? "") || null,
    assigneeId: String(formData.get("assigneeId") ?? "") || null,
    dueAt: dateFromForm(formData.get("dueDate")),
    priority: String(formData.get("priority") ?? "normal") as TaskPriority,
  });
  revalidatePath("/app/tasks");
  revalidatePath("/app/calendar");
  redirect(`/app/tasks/${task.id}`);
}

export async function updateTaskAction(taskId: string, formData: FormData) {
  const { actor } = await getActorContext();
  await updateTask(actor, taskId, {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    workspaceId: String(formData.get("workspaceId") ?? "") || null,
    assigneeId: String(formData.get("assigneeId") ?? "") || null,
    dueAt: dateFromForm(formData.get("dueDate")),
    priority: String(formData.get("priority") ?? "normal") as TaskPriority,
    status: String(formData.get("status") ?? "backlog") as TaskStatus,
  });
  revalidatePath(`/app/tasks/${taskId}`);
  revalidatePath("/app/tasks");
  revalidatePath("/app/calendar");
}

export async function archiveTaskAction(taskId: string) {
  const { actor } = await getActorContext();
  await archiveTask(actor, taskId);
  revalidatePath("/app/tasks");
  revalidatePath("/app/calendar");
  redirect("/app/tasks");
}

export async function restoreTaskAction(taskId: string) {
  const { actor } = await getActorContext();
  await restoreTask(actor, taskId);
  revalidatePath(`/app/tasks/${taskId}`);
  revalidatePath("/app/tasks");
  revalidatePath("/app/calendar");
}
