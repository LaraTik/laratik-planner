import type { PlatformPermission } from "@/lib/auth/platform-access";

export type AgencyDetailCapabilities = Readonly<{
  canUpdate: boolean;
  canManagePlan: boolean;
  canManageLifecycle: boolean;
  canArchive: boolean;
  canRequestSupport: boolean;
  canAuditSupport: boolean;
}>;

export function deriveAgencyDetailCapabilities(
  permissions: ReadonlySet<PlatformPermission>,
): AgencyDetailCapabilities {
  return {
    canUpdate: permissions.has("platform.agency.update"),
    canManagePlan: permissions.has("platform.agency.plan.manage"),
    canManageLifecycle: permissions.has("platform.agency.lifecycle.manage"),
    canArchive: permissions.has("platform.agency.archive"),
    canRequestSupport: permissions.has("platform.support.request"),
    canAuditSupport: permissions.has("platform.audit.read"),
  };
}
