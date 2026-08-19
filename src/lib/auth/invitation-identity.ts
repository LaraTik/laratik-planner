import { z } from "zod";

const NormalizedEmailSchema = z.string().trim().toLowerCase().email();

export function normalizeEmailAddress(value: string): string {
  const parsed = NormalizedEmailSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid email address");
  return parsed.data;
}

export function invitationIdentityMatches(input: {
  invitedEmail: string;
  signedInEmail: string | null;
  emailVerifiedAt: Date | null;
}): boolean {
  if (!input.signedInEmail || !input.emailVerifiedAt) return false;
  try {
    return normalizeEmailAddress(input.invitedEmail) === normalizeEmailAddress(input.signedInEmail);
  } catch {
    return false;
  }
}
