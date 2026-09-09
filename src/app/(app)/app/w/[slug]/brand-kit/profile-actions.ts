"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { BrandProfileSchema, saveBrandProfile } from "@/lib/brand/profile";

type ProfileActionState = { error?: string; success?: boolean; revision?: number };

function csv(value: FormDataEntryValue | null): string[] {
  return typeof value === "string"
    ? value
        .split(/[,\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export async function saveBrandProfileAction(
  slug: string,
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in is required." };
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) return { error: "Workspace not found." };
  const parsed = BrandProfileSchema.safeParse({
    businessName: String(formData.get("businessName") ?? ""),
    industry: String(formData.get("industry") ?? ""),
    location: String(formData.get("location") ?? ""),
    audience: String(formData.get("audience") ?? ""),
    goals: csv(formData.get("goals")),
    offers: csv(formData.get("offers")),
    competitors: csv(formData.get("competitors")),
    primaryLanguage: String(formData.get("primaryLanguage") ?? "en"),
    secondaryLanguage: String(formData.get("secondaryLanguage") ?? "") || null,
    tone: csv(formData.get("tone")),
    strengths: csv(formData.get("strengths")),
    constraints: csv(formData.get("constraints")),
    productionCapacity: String(formData.get("productionCapacity") ?? ""),
    paidOrganicMix: String(formData.get("paidOrganicMix") ?? ""),
    monthlyPriority: String(formData.get("monthlyPriority") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the profile." };
  try {
    const result = await saveBrandProfile({ id: session.user.id }, workspace.id, parsed.data);
    revalidatePath(`/app/w/${slug}/brand-kit`);
    revalidatePath(`/app/w/${slug}/brand-kit/profile`);
    return { success: true, revision: result.revision };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The profile could not be saved." };
  }
}
