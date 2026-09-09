import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { activityEvents, brandProfileRevisions, brandProfiles } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";

const Csv = z.array(z.string().trim().min(1).max(160)).max(30);

export const BrandProfileSchema = z.object({
  businessName: z.string().trim().max(160).default(""),
  industry: z.string().trim().max(160).default(""),
  location: z.string().trim().max(160).default(""),
  audience: z.string().trim().max(2_000).default(""),
  goals: Csv.default([]),
  offers: Csv.default([]),
  competitors: Csv.default([]),
  primaryLanguage: z.enum(["en", "ar"]).default("en"),
  secondaryLanguage: z.enum(["en", "ar"]).nullable().default(null),
  tone: Csv.default([]),
  strengths: Csv.default([]),
  constraints: Csv.default([]),
  productionCapacity: z.string().trim().max(2_000).default(""),
  paidOrganicMix: z.string().trim().max(500).default(""),
  monthlyPriority: z.string().trim().max(2_000).default(""),
});

export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export async function getBrandProfile(workspaceId: string): Promise<{
  profile: BrandProfile;
  revision: number;
} | null> {
  const [row] = await db
    .select({ profile: brandProfiles.profile, revision: brandProfiles.revision })
    .from(brandProfiles)
    .where(eq(brandProfiles.workspaceId, workspaceId))
    .limit(1);
  if (!row) return null;
  return { profile: BrandProfileSchema.parse(row.profile ?? {}), revision: row.revision };
}

export async function saveBrandProfile(
  actor: Actor,
  workspaceId: string,
  input: BrandProfile,
): Promise<{ revision: number }> {
  const profile = BrandProfileSchema.parse(input);
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "save_brand_profile",
  );
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ revision: brandProfiles.revision })
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, workspaceId))
      .limit(1);
    const revision = (existing?.revision ?? 0) + 1;
    await tx.insert(brandProfileRevisions).values({
      workspaceId,
      revision,
      profile,
      createdBy: actor.id,
    });
    await tx
      .insert(brandProfiles)
      .values({ workspaceId, profile, revision, updatedBy: actor.id })
      .onConflictDoUpdate({
        target: brandProfiles.workspaceId,
        set: { profile, revision, updatedBy: actor.id, updatedAt: new Date() },
      });
    await tx.insert(activityEvents).values({
      workspaceId,
      actorId: actor.id,
      kind: "update",
      summary: `Updated brand profile revision ${revision}`,
      afterData: { revision },
    });
    return { revision };
  });
}
