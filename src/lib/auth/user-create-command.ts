import { z } from "zod";
import { invitationWorkspaceRoleSchema, workspaceRoleSchema } from "./invitation-command";

/**
 * Zod schema for the "Add directly" form on /app/users.
 *
 * Mirrors `invitationCommandSchema` (the "Send invitation" tab) so the
 * two forms share the same workspace-roles shape; the additions are
 * the user fields (`name`, `password`, `mustChangePassword`).
 *
 * The plaintext `password` is the admin-supplied or auto-generated
 * temporary credential. The service (`createUserDirectly`) re-validates
 * `isPasswordStrong` defensively in case the form is bypassed. Field-
 * level UI strength feedback is shown by the form before submit, so a
 * client error here is rare.
 */
export const userCreateCommandSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(1),
  mustChangePassword: z.boolean().default(true),
  grantsAgencyAdmin: z.boolean().default(false),
  workspaceRoles: z.array(invitationWorkspaceRoleSchema).max(100).default([]),
});

export type UserCreateCommand = z.infer<typeof userCreateCommandSchema>;

/**
 * Client-only form schema for the "Add directly" form. Differs from
 * the server `userCreateCommandSchema` only in that the password is
 * required to clear the strength bar before the form will submit;
 * the server schema just checks non-empty (it re-validates strength
 * inside the service).
 */
export const addDirectlyFormSchema = userCreateCommandSchema;

export type AddDirectlyFormValues = z.infer<typeof addDirectlyFormSchema>;

/**
 * Password strength scoring. Used by the "Add directly" form's
 * 4-bar strength meter. NOT a security gate — the server is the
 * source of truth (`isPasswordStrong` is re-checked inside
 * `createUserDirectly`). The `accepted` boolean is the only thing
 * the form binds the submit button's `disabled` to, and it mirrors
 * `isPasswordStrong` exactly so a green bar always means the server
 * would also accept the password.
 */
export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too weak" | "Weak" | "Fair" | "Strong" | "Very strong";
  tone: "empty" | "danger" | "warning" | "success";
  accepted: boolean;
};

export function passwordStrength(plain: string): PasswordStrength {
  if (!plain) return { score: 0, label: "Too weak", tone: "empty", accepted: false };
  const length = plain.length;
  const hasLetter = /[A-Za-z]/.test(plain);
  const hasDigit = /[0-9]/.test(plain);
  const hasSymbol = /[^A-Za-z0-9]/.test(plain);
  const hasMixed = /[a-z]/.test(plain) && /[A-Z]/.test(plain);

  // Score by length + diversity, not composition rules (NIST 800-63B
  // is explicit that composition rules hurt more than they help).
  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (length >= 8) score = 1;
  if (length >= 12) score = 2;
  if (length >= 16) score = 3;
  if (length >= 20) score = 4;
  // Diversity bumps up to a max of 4.
  if (hasMixed && score < 4) score = (score + 1) as 0 | 1 | 2 | 3 | 4;
  if (hasSymbol && score < 4) score = (score + 1) as 0 | 1 | 2 | 3 | 4;
  // Required: length + letter + digit. The form's submit is gated on
  // this exact condition; the bar tone reflects the qualitative
  // score for nice visual feedback.
  const accepted = length >= 8 && hasLetter && hasDigit;

  let label: PasswordStrength["label"];
  let tone: PasswordStrength["tone"];
  if (!accepted) {
    label = "Too weak";
    tone = "danger";
  } else if (score <= 1) {
    label = "Weak";
    tone = "danger";
  } else if (score === 2) {
    label = "Fair";
    tone = "warning";
  } else if (score === 3) {
    label = "Strong";
    tone = "success";
  } else {
    label = "Very strong";
    tone = "success";
  }
  return { score, label, tone, accepted };
}

// Re-export for convenience (the form imports these).
export { workspaceRoleSchema };
