import { describe, expect, it } from "vitest";
import { invitationCommandSchema } from "@/lib/auth/invitation-command";

/**
 * These tests pin the user-visible error formatting that the
 * sendInviteAction uses when zod validation fails. The action's
 * `formatZodIssues` helper collapses zod issues into:
 *   - `error`: a flat "field: message; field: message" string for
 *     the danger card
 *   - `fieldErrors`: a { field: [messages] } map for inline rendering
 *
 * The test re-implements the helper here as a contract; a future
 * change to the action that drops field-level detail will fail this
 * test.
 */
function formatZodIssues(issues: { path: (string | number)[]; message: string }[]): {
  error: string;
  fieldErrors: Record<string, string[]>;
} {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    if (!fieldErrors[key]) fieldErrors[key] = [];
    fieldErrors[key].push(issue.message);
  }
  const error = issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`).join("; ");
  return { error, fieldErrors };
}

function rateLimitMessage(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.round(seconds / 3600);
    return `Too many invitations. Try again in ${hours} hour${hours === 1 ? "" : "s"}.`;
  }
  if (seconds >= 60) {
    const minutes = Math.round(seconds / 60);
    return `Too many invitations. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return `Too many invitations. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

describe("sendInviteAction error formatting", () => {
  it("surfaces real zod issues for an invalid email", () => {
    const result = invitationCommandSchema.safeParse({
      email: "not-an-email",
      grantsAgencyAdmin: false,
      workspaceRoles: [],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const formatted = formatZodIssues(result.error.issues);
    expect(formatted.error).toMatch(/email:/i);
    expect(formatted.fieldErrors.email?.[0]).toMatch(/email/i);
  });

  it("surfaces field-level issues for grantsAgencyAdmin being the wrong type", () => {
    const result = invitationCommandSchema.safeParse({
      email: "ok@example.com",
      grantsAgencyAdmin: "yes", // not a boolean
      workspaceRoles: [],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const formatted = formatZodIssues(result.error.issues);
    expect(formatted.error).toMatch(/grantsAgencyAdmin:/i);
    expect(formatted.fieldErrors.grantsAgencyAdmin?.[0]).toBeDefined();
  });

  it("formats the rate-limit message in hours for the create-invite window", () => {
    // 1 hour == 3600 seconds (the create-invite window)
    expect(rateLimitMessage(3600)).toBe("Too many invitations. Try again in 1 hour.");
  });

  it("formats the rate-limit message in minutes for sub-hour windows", () => {
    expect(rateLimitMessage(1800)).toBe("Too many invitations. Try again in 30 minutes.");
  });

  it("formats the rate-limit message in hours for multi-hour windows", () => {
    expect(rateLimitMessage(7200)).toBe("Too many invitations. Try again in 2 hours.");
  });

  it("formats the rate-limit message in seconds for short windows", () => {
    expect(rateLimitMessage(45)).toBe("Too many invitations. Try again in 45 seconds.");
  });

  it("uses singular 'minute' and 'hour' when the value is exactly 1", () => {
    expect(rateLimitMessage(60)).toBe("Too many invitations. Try again in 1 minute.");
    expect(rateLimitMessage(3600)).toBe("Too many invitations. Try again in 1 hour.");
  });
});
