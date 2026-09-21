"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolvePeriodPreset, resolveCustomPeriod } from "@/lib/reports/aggregate";
import { renderReport } from "@/lib/reports/render";
import { listTemplates } from "@/lib/reports/templates";
import { saveReport } from "@/lib/reports/storage";

const SubmitSchema = z.object({
  templateId: z.string().min(1),
  workspaceIds: z.array(z.string().uuid()).min(1, "Pick at least one workspace."),
  channelIds: z.array(z.string().uuid()).min(1, "Pick at least one channel."),
  preset: z.enum(["7d", "30d", "90d", "custom"]),
  from: z.string().optional(),
  to: z.string().optional(),
  preparedFor: z.string().max(120).optional(),
});

export interface GenerateReportState {
  error?: string;
  ok?: boolean;
  reportId?: string;
}

export async function generateReportAction(
  _prev: GenerateReportState,
  formData: FormData,
): Promise<GenerateReportState> {
  const parsed = SubmitSchema.safeParse({
    templateId: formData.get("templateId"),
    workspaceIds: formData.getAll("workspaceIds"),
    channelIds: formData.getAll("channelIds"),
    preset: formData.get("preset"),
    from: formData.get("from") ?? undefined,
    to: formData.get("to") ?? undefined,
    preparedFor: formData.get("preparedFor") ?? undefined,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  // Reject unknown templates early. Even though SubmitSchema accepts
  // any string, the renderer would throw if `templateId` is unknown;
  // we want a friendlier error before the throw.
  if (!listTemplates().some((t) => t.id === parsed.data.templateId)) {
    return { error: "Template not available yet." };
  }

  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in." };
  const ctx = await resolveActiveAgencyContext({ actor: { id: session.user.id } });
  if (!ctx) return { error: "No active agency." };
  if (!(await isAgencyAdmin({ id: session.user.id }, ctx.agencyId))) {
    return { error: "Only agency admins can generate reports." };
  }

  const period =
    parsed.data.preset === "custom"
      ? resolveCustomPeriod(new Date(parsed.data.from!), new Date(parsed.data.to!))
      : { ...resolvePeriodPreset(parsed.data.preset), preset: parsed.data.preset };

  const result = await renderReport({
    templateId: parsed.data.templateId,
    ctx: {
      agencyId: ctx.agencyId,
      workspaceIds: parsed.data.workspaceIds,
      channelIds: parsed.data.channelIds,
      period,
      preparedFor: parsed.data.preparedFor ?? "",
    },
  });

  const row = await saveReport(
    {
      templateId: result.templateId,
      agencyId: ctx.agencyId,
      workspaceIds: parsed.data.workspaceIds,
      channelIds: parsed.data.channelIds,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      preset: period.preset,
      preparedFor: parsed.data.preparedFor ?? "",
    },
    result.buffer,
  );

  revalidatePath("/app/agency-settings/reports");
  return { ok: true, reportId: row.id };
}
