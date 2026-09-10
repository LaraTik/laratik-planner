import { Building2, ShieldAlert } from "lucide-react";
import { gatePlatformAdmin, type PlatformGateResult } from "@/lib/auth/platform-admin-gate";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { tForActive } from "@/lib/i18n/t-for-active";

/**
 * Platform routes layout (Milestone 1.8).
 *
 * Gates every route under `/app/platform/*` on platform-admin
 * authority (see `src/lib/auth/platform-admin-gate.ts`). On failure
 * the layout renders a "Forbidden" surface IN PLACE — it does NOT
 * redirect. Per the M1.8 spec:
 *
 *   "if not a platform admin, renders a 'Forbidden' message (not a
 *    redirect — keeps the URL stable for the audit log)"
 *
 * URL stability matters because the audit log records the URL the
 * actor attempted to view; a 302 to `/app` would mean the audit
 * reader cannot resolve what the actor saw vs. what they were sent
 * to. The non-redirecting 200 with a Forbidden surface is
 * intentional.
 *
 * On success, this layout is intentionally minimal: it does NOT add
 * a sub-sidebar, a tab strip, or any chrome that hides the inner
 * page's own `PageHeader`. The M1 surfaces (overview, agencies,
 * agency detail) each carry their own title + description; the
 * layout only enforces authorization.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const gate = await gatePlatformAdmin();
  if (gate.status === "forbidden") {
    const { t } = await tForActive();
    return (
      <PlatformForbidden
        reason={gate.reason}
        copy={{
          eyebrow: t("platform.forbiddenEyebrow"),
          title:
            gate.reason === "anonymous"
              ? t("platform.signInRequired")
              : t("platform.forbiddenTitle"),
          description:
            gate.reason === "anonymous"
              ? t("platform.forbiddenAnonymousDescription")
              : t("platform.forbiddenAdminDescription"),
          cardTitle: t("platform.forbiddenCardTitle"),
          cardDescription:
            gate.reason === "anonymous"
              ? t("platform.forbiddenAnonymousCardDescription")
              : t("platform.forbiddenAdminCardDescription"),
        }}
      />
    );
  }
  return <div className="space-y-6">{children}</div>;
}

type ForbiddenReason = Extract<PlatformGateResult, { status: "forbidden" }>["reason"];

function PlatformForbidden({
  reason,
  copy,
}: {
  reason: ForbiddenReason;
  copy: {
    eyebrow: string;
    title: string;
    description: string;
    cardTitle: string;
    cardDescription: string;
  };
}) {
  return (
    <div className="space-y-4" data-testid="platform-forbidden">
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      <Card padding="lg" variant="subtle">
        <div className="flex items-start gap-3">
          <span className="text-danger mt-0.5" aria-hidden="true">
            {reason === "anonymous" ? (
              <Building2 className="h-5 w-5" />
            ) : (
              <ShieldAlert className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0">
            <CardTitle>{copy.cardTitle}</CardTitle>
            <CardDescription>{copy.cardDescription}</CardDescription>
          </div>
        </div>
      </Card>
    </div>
  );
}
