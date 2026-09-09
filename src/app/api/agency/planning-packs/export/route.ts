import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { planningInstructionPacks } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { exportInstructionPack } from "@/lib/ai/instruction-packs";
import {
  PlanningInstructionPackManifestSchema,
  type PlanningInstructionPackManifest,
} from "@/lib/ai/planning-contract";

export async function GET(request: NextRequest) {
  const session = await auth();
  const actor = await currentActor();
  const context = actor ? await resolveActiveAgencyContext({ actor }) : null;
  const id = request.nextUrl.searchParams.get("id");
  if (
    !session?.user?.id ||
    !actor ||
    !context ||
    !(await isAgencyAdmin(actor, context.agencyId)) ||
    !id
  )
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [pack] = await db
    .select({
      name: planningInstructionPacks.name,
      sourceMarkdown: planningInstructionPacks.sourceMarkdown,
      manifest: planningInstructionPacks.manifest,
    })
    .from(planningInstructionPacks)
    .where(
      and(
        eq(planningInstructionPacks.id, id),
        eq(planningInstructionPacks.agencyId, context.agencyId),
        isNull(planningInstructionPacks.workspaceId),
      ),
    )
    .limit(1);
  if (!pack) return NextResponse.json({ error: "Instruction pack not found" }, { status: 404 });
  const body = exportInstructionPack({
    ...pack,
    manifest: PlanningInstructionPackManifestSchema.parse(
      pack.manifest,
    ) as PlanningInstructionPackManifest,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${pack.name.replace(/[^a-z0-9-_]+/gi, "-")}.md"`,
    },
  });
}
