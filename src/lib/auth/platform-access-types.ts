/**
 * Client-safe platform role identifiers and presentation metadata.
 *
 * This module intentionally has no database or `server-only` imports so forms
 * can render the same closed vocabulary that server validation enforces.
 */
export const PLATFORM_ROLE_VALUES = [
  "platform_owner",
  "agency_operator",
  "platform_auditor",
  "support_operator",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLE_VALUES)[number];

export const PLATFORM_ROLE_DETAILS: Record<
  PlatformRole,
  Readonly<{ label: string; description: string }>
> = {
  platform_owner: {
    label: "Platform Owner",
    description: "Full platform control, including access and archives",
  },
  agency_operator: {
    label: "Agency Operator",
    description: "Manage agencies and lifecycle, excluding archives",
  },
  platform_auditor: {
    label: "Platform Auditor",
    description: "Read-only agency, access, and audit oversight",
  },
  support_operator: {
    label: "Support Operator",
    description: "Request temporary support access",
  },
};
