"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { resolvePeriodPreset, resolveCustomPeriod } from "@/lib/reports/aggregate";
import type { Period } from "@/lib/reports/templates/types";
import { renderReport } from "@/lib/reports/render";
import { listTemplates } from "@/lib/reports/templates";
import { saveReport } from "@/lib/reports/storage";
import { resolveAgencyReportSelection } from "@/features/reports/server";

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
  errorCode?: string;
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
    return { errorCode: "invalidInput" };
  }
  // Reject unknown templates early. Even though SubmitSchema accepts
  // any string, the renderer would throw if `templateId` is unknown;
  // we want a friendlier error before the throw.
  if (!listTemplates().some((t) => t.id === parsed.data.templateId)) {
    return { errorCode: "templateUnavailable" };
  }

  const session = await auth();
  if (!session?.user?.id) return { errorCode: "signInRequired" };
  const ctx = await resolveActiveAgencyContext({ actor: { id: session.user.id } });
  if (!ctx) return { errorCode: "agencyUnavailable" };
  if (!(await isAgencyAdmin({ id: session.user.id }, ctx.agencyId))) {
    return { errorCode: "agencyAdminRequired" };
  }

  let selection: Awaited<ReturnType<typeof resolveAgencyReportSelection>>;
  try {
    selection = await resolveAgencyReportSelection({
      agencyId: ctx.agencyId,
      workspaceIds: parsed.data.workspaceIds,
      channelIds: parsed.data.channelIds,
    });
  } catch {
    return { errorCode: "generationFailed" };
  }
  if (!selection) return { errorCode: "selectionChanged" };

  let period: Period;
  try {
    period =
      parsed.data.preset === "custom"
        ? resolveCustomPeriod(new Date(parsed.data.from ?? ""), new Date(parsed.data.to ?? ""))
        : { ...resolvePeriodPreset(parsed.data.preset), preset: parsed.data.preset };
  } catch {
    return { errorCode: "invalidDateRange" };
  }

  let row: Awaited<ReturnType<typeof saveReport>>;
  try {
    const result = await renderReport({
      templateId: parsed.data.templateId,
      ctx: {
        agencyId: ctx.agencyId,
        workspaceIds: selection.workspaceIds,
        channelIds: selection.channelIds,
        period,
        preparedFor: parsed.data.preparedFor ?? "",
      },
    });

    row = await saveReport(
      {
        templateId: result.templateId,
        agencyId: ctx.agencyId,
        workspaceIds: selection.workspaceIds,
        channelIds: selection.channelIds,
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        preset: period.preset,
        preparedFor: parsed.data.preparedFor ?? "",
      },
      result.buffer,
    );
  } catch {
    return { errorCode: "generationFailed" };
  }

  revalidatePath("/app/agency-settings/reports");
  return { ok: true, reportId: row.id };
}
