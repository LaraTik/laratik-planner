import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";
import { listRequestsForAgency } from "@/lib/support";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { SupportRequestDecisionForm } from "./decision-form";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("agencyPlan.supportReviewTitle") };
}

export default async function AgencySupportRequestsPage() {
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) redirect("/setup");
  const { t, code } = await tForActive();
  if (!(await isAgencyAdmin(actor, context.agencyId))) {
    return (
      <div className="space-y-4" data-testid="agency-support-forbidden">
        <PageHeader
          title={t("agencyPlan.supportReviewTitle")}
          description={t("agencyPlan.forbiddenBody")}
        />
        <Link
          href="/app/agency-settings/plan"
          className="text-primary focus-visible:ring-focus-ring inline-flex min-h-[var(--control-touch)] items-center gap-1 rounded-[var(--radius-control)] px-2 py-2 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("agencyPlan.backToPlan")}
        </Link>
      </div>
    );
  }

  const requests = await listRequestsForAgency(context.agencyId, { limit: 100 });
  const pending = requests.filter((request) => request.status === "pending");
  const history = requests.filter((request) => request.status !== "pending").slice(0, 10);

  return (
    <div className="space-y-6" data-testid="agency-support-review">
      <PageHeader
        eyebrow={t("agencyPlan.eyebrow")}
        title={t("agencyPlan.supportReviewTitle")}
        description={t("agencyPlan.supportReviewDescription")}
        action={
          <Link
            href="/app/agency-settings/plan"
            className="text-primary focus-visible:ring-focus-ring inline-flex min-h-[var(--control-touch)] items-center gap-1 rounded-[var(--radius-control)] px-2 py-2 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("agencyPlan.backToPlan")}
          </Link>
        }
      />

      <section aria-labelledby="agency-support-pending-title" className="space-y-3">
        <h2
          id="agency-support-pending-title"
          className="text-title-section text-fg-primary font-semibold"
        >
          {t("agencyPlan.supportPendingHeading", { count: pending.length })}
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            title={t("agencyPlan.supportNoPendingTitle")}
            description={t("agencyPlan.supportNoPendingBody")}
            data-testid="agency-support-no-pending"
          />
        ) : (
          <div className="space-y-4">
            {pending.map((request) => (
              <Card
                key={request.id}
                padding="lg"
                data-testid={`agency-support-request-${request.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="font-mono">{request.ticketReference}</CardTitle>
                    <CardDescription className="mt-1">
                      {t("agencyPlan.supportRequestedAt", {
                        date: formatRelativeDate(request.createdAt, new Date(), code),
                      })}
                    </CardDescription>
                  </div>
                  <Badge variant="warning">{t("agencyPlan.supportStatus.pending")}</Badge>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-label text-fg-muted">{t("agencyPlan.supportColScope")}</dt>
                    <dd className="text-body text-fg-primary mt-1">
                      {request.scopeMetadataOnly
                        ? t("agencyPlan.supportScopeMetadata")
                        : request.scopeWorkspaceId
                          ? t("agencyPlan.supportScopeWorkspace", {
                              prefix: request.scopeWorkspaceId.slice(0, 8),
                            })
                          : t("agencyPlan.supportScopeAgency")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-label text-fg-muted">{t("agencyPlan.supportColHours")}</dt>
                    <dd className="text-body text-fg-primary mt-1">
                      {t("agencyPlan.supportDurationHours", {
                        count: request.requestedDurationHours,
                      })}
                    </dd>
                  </div>
                </dl>
                <div className="bg-surface-subtle mt-4 rounded-[var(--radius-control)] p-3">
                  <p className="text-label text-fg-muted">{t("agencyPlan.supportReason")}</p>
                  <p className="text-body text-fg-primary mt-1 whitespace-pre-wrap">
                    {request.reason}
                  </p>
                </div>
                <div className="border-border mt-5 border-t pt-4">
                  <SupportRequestDecisionForm
                    requestId={request.id}
                    downloadsRequested={request.downloadsRequested}
                    locale={code}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <section aria-labelledby="agency-support-history-title" className="space-y-3">
          <h2
            id="agency-support-history-title"
            className="text-title-section text-fg-primary font-semibold"
          >
            {t("agencyPlan.supportRecentHeading")}
          </h2>
          <div className="space-y-3">
            {history.map((request) => (
              <Card
                key={request.id}
                padding="sm"
                data-testid={`agency-support-history-${request.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body text-fg-primary font-mono">
                    {request.ticketReference}
                  </span>
                  <Badge
                    variant={
                      request.status === "approved"
                        ? "success"
                        : request.status === "rejected"
                          ? "danger"
                          : "outline"
                    }
                  >
                    {t(`agencyPlan.supportStatus.${request.status}`, {
                      defaultValue: request.status,
                    })}
                  </Badge>
                </div>
                {request.decisionReason ? (
                  <p className="text-label text-fg-secondary mt-2 whitespace-pre-wrap">
                    {request.decisionReason}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
