import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowUpRight, BarChart3, ShieldAlert } from "lucide-react";
import { FormField } from "@/components/forms/form-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/workspace/page-header";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole, INTERNAL_WORKSPACE_ROLES } from "@/lib/auth/policy";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { tForActive } from "@/lib/i18n/t-for-active";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "@/lib/i18n/format-locale";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { workspaceBasePath } from "@/lib/urls";
import { serverEnv } from "@/lib/validation/env";
import {
  listAdvertisingReportAccounts,
  loadAdvertisingReport,
} from "@/lib/advertising/reporting-query";
import { buildAdvertisingReportView } from "@/lib/advertising/reporting-view";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("advertising.reporting.title") };
}

type SearchParams = {
  accountId?: string | string[];
  since?: string | string[];
  until?: string | string[];
};

export default async function AdvertisingAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ agencySlug: string; slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const { t, code } = await tForActive();
  const { agencySlug, slug } = await params;
  const query = await searchParams;
  const workspace = await getAccessibleWorkspaceAtPath({ id: session.user.id }, agencySlug, slug);
  if (!workspace) notFound();
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [...INTERNAL_WORKSPACE_ROLES]))
  ) {
    notFound();
  }

  const basePath = `${workspaceBasePath(agencySlug, slug)}/analytics/advertising`;
  const until = validDate(firstQueryValue(query.until))
    ? firstQueryValue(query.until)!
    : localDate(workspace.timezone, new Date());
  const since = validDate(firstQueryValue(query.since))
    ? firstQueryValue(query.since)!
    : shiftDate(until, -29);
  const requestedAccountId = firstQueryValue(query.accountId);

  const heading = (
    <PageHeader
      eyebrow={workspace.name}
      title={t("advertising.reporting.title")}
      description={
        <>
          {t("advertising.reporting.description")}
          <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold">
            {workspace.timezone}
          </span>
        </>
      }
    />
  );

  if (!serverEnv.ADVERTISING_REPORTING_ENABLED) {
    return (
      <div className="space-y-6" data-testid="advertising-reporting-disabled">
        {heading}
        <ReportState
          icon={<ShieldAlert className="h-8 w-8" aria-hidden="true" />}
          title={t("advertising.reporting.disabledTitle")}
          description={t("advertising.reporting.disabledDescription")}
        />
      </div>
    );
  }

  const accounts = await listAdvertisingReportAccounts(db, {
    actor,
    agencyId: workspace.agencyId,
    workspaceId: workspace.id,
  });
  if (accounts.length === 0) {
    return (
      <div className="space-y-6" data-testid="advertising-reporting-no-access">
        {heading}
        <ReportState
          icon={<ShieldAlert className="h-8 w-8" aria-hidden="true" />}
          title={t("advertising.reporting.noAccessTitle")}
          description={t("advertising.reporting.noAccessDescription")}
          action={
            <Link
              href="/app/agency-settings/advertising"
              className="bg-primary text-label focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-4 py-2 font-semibold text-white focus:outline-none focus-visible:ring-2"
            >
              {t("advertising.reporting.openSettings")}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
      </div>
    );
  }

  const selectedAccount =
    accounts.find((account) => account.id === requestedAccountId) ?? accounts[0]!;
  const result = await loadAdvertisingReport(db, {
    actor,
    agencyId: workspace.agencyId,
    workspaceId: workspace.id,
    accountId: selectedAccount.id,
    since,
    until,
    surface: "workspace_dashboard",
  });

  if (result.kind !== "ok") {
    return (
      <div className="space-y-6" data-testid="advertising-reporting-forbidden">
        {heading}
        <ReportState
          icon={<ShieldAlert className="h-8 w-8" aria-hidden="true" />}
          title={t("advertising.reporting.permissionTitle")}
          description={t("advertising.reporting.permissionDescription")}
        />
      </div>
    );
  }

  const view = buildAdvertisingReportView(result.report.rows, result.objects);
  const maxDailySpend = Math.max(...view.dailySpend.map((day) => day.spend), 0);
  const freshnessLabel = t(`advertising.reporting.freshness.${result.freshness}`);
  const syncLabel = result.syncStatus
    ? t(`advertising.syncStatus.${result.syncStatus}`)
    : t("advertising.reporting.notAvailable");

  return (
    <div className="space-y-6" data-testid="advertising-reporting-page">
      {heading}
      <form
        method="get"
        action={basePath}
        className="border-border bg-surface grid gap-4 rounded-[var(--radius-card)] border p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
        data-testid="advertising-reporting-filters"
      >
        <FormField id="advertising-report-account" label={t("advertising.reporting.account")}>
          <select
            name="accountId"
            defaultValue={selectedAccount.id}
            className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 focus:outline-none focus-visible:ring-2"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="advertising-report-since" label={t("advertising.reporting.from")}>
          <Input name="since" type="date" defaultValue={since} />
        </FormField>
        <FormField id="advertising-report-until" label={t("advertising.reporting.to")}>
          <Input name="until" type="date" defaultValue={until} />
        </FormField>
        <button
          type="submit"
          className="bg-primary text-label focus-visible:ring-focus-ring min-h-11 rounded-[var(--radius-control)] px-4 font-semibold text-white focus:outline-none focus-visible:ring-2"
        >
          {t("advertising.reporting.apply")}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2" data-testid="advertising-reporting-status">
        <Badge variant={result.freshness === "fresh" ? "success" : "warning"}>
          {t("advertising.reporting.freshnessLabel")}: {freshnessLabel}
        </Badge>
        <Badge variant={result.partial ? "warning" : "outline"}>
          {result.partial
            ? t("advertising.reporting.partial")
            : t("advertising.reporting.complete")}
        </Badge>
        <span className="text-label text-fg-muted">
          {t("advertising.reporting.syncStatus")}: {syncLabel}
        </span>
      </div>
      {result.partial ? (
        <div
          className="border-warning/30 bg-warning-subtle text-fg-primary rounded-[var(--radius-card)] border p-4"
          role="status"
          data-testid="advertising-reporting-partial-warning"
        >
          <p className="text-body font-semibold">{t("advertising.reporting.partialTitle")}</p>
          <p className="text-label text-fg-secondary mt-1">
            {t("advertising.reporting.partialDescription")}
          </p>
        </div>
      ) : null}

      {result.report.rows.length === 0 ? (
        <Card variant="dashed" data-testid="advertising-reporting-empty">
          <EmptyState
            icon={<BarChart3 className="h-8 w-8" aria-hidden="true" />}
            title={t("advertising.reporting.emptyTitle")}
            description={t("advertising.reporting.emptyDescription")}
          />
        </Card>
      ) : (
        <>
          <section aria-labelledby="advertising-reporting-summary-title" className="space-y-3">
            <div>
              <h2
                id="advertising-reporting-summary-title"
                className="text-title-card text-fg-primary font-semibold"
              >
                {t("advertising.reporting.summaryTitle")}
              </h2>
              <p className="text-label text-fg-muted mt-1">
                {t("advertising.reporting.summaryDescription", { account: selectedAccount.name })}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <MetricCard
                label={t("advertising.reporting.spend")}
                value={money(result.report.totals.spend, selectedAccount.currency, code)}
              />
              <MetricCard
                label={t("advertising.reporting.impressions")}
                value={number(result.report.totals.impressions, code)}
              />
              <MetricCard
                label={t("advertising.reporting.clicks")}
                value={number(result.report.totals.clicks, code)}
              />
              <MetricCard
                label={t("advertising.reporting.results")}
                value={
                  result.report.totals.results === null
                    ? t("advertising.reporting.notAvailable")
                    : number(result.report.totals.results, code)
                }
              />
              <MetricCard
                label={t("advertising.reporting.ctr")}
                value={percent(result.report.totals.ctr, code, t)}
              />
              <MetricCard
                label={t("advertising.reporting.cpc")}
                value={moneyOrUnavailable(
                  result.report.totals.cpc,
                  selectedAccount.currency,
                  code,
                  t,
                )}
              />
              <MetricCard
                label={t("advertising.reporting.cpm")}
                value={moneyOrUnavailable(
                  result.report.totals.cpm,
                  selectedAccount.currency,
                  code,
                  t,
                )}
              />
            </div>
          </section>

          <Card data-testid="advertising-reporting-daily-spend">
            <CardHeader>
              <div>
                <CardTitle>{t("advertising.reporting.dailySpendTitle")}</CardTitle>
                <CardDescription>
                  {t("advertising.reporting.dailySpendDescription")}
                </CardDescription>
              </div>
              <span className="text-label text-fg-muted">
                {t("advertising.reporting.adCount", { count: number(view.adCount, code) })}
              </span>
            </CardHeader>
            <div
              className="space-y-3"
              role="img"
              aria-label={t("advertising.reporting.dailySpendChartLabel")}
            >
              {view.dailySpend.map((day) => (
                <div
                  key={day.date}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3"
                >
                  <span className="text-label text-fg-muted" dir="ltr">
                    {formatDate(new Date(`${day.date}T12:00:00Z`), code, {
                      timeZone: selectedAccount.timezone ?? workspace.timezone,
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <div className="bg-surface-subtle h-3 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{
                        width: `${maxDailySpend > 0 ? (day.spend / maxDailySpend) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-label text-fg-primary font-semibold">
                    {money(day.spend, selectedAccount.currency, code)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            padding="none"
            className="overflow-hidden"
            data-testid="advertising-reporting-campaigns"
          >
            <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
              <div>
                <CardTitle>{t("advertising.reporting.campaignsTitle")}</CardTitle>
                <CardDescription>{t("advertising.reporting.campaignsDescription")}</CardDescription>
              </div>
            </CardHeader>
            <div
              aria-label={t("advertising.reporting.campaignsTableLabel")}
              className="overflow-x-auto"
              role="region"
              tabIndex={0}
            >
              <table className="text-body w-full min-w-[760px] text-start">
                <caption className="sr-only">
                  {t("advertising.reporting.campaignsTableLabel")}
                </caption>
                <thead className="bg-surface-subtle text-label text-fg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold sm:px-5" scope="col">
                      {t("advertising.reporting.campaign")}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {t("advertising.reporting.ads")}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {t("advertising.reporting.spend")}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {t("advertising.reporting.impressions")}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {t("advertising.reporting.clicks")}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {t("advertising.reporting.results")}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {t("advertising.reporting.ctr")}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {t("advertising.reporting.cpc")}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {t("advertising.reporting.cpm")}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold" scope="col">
                      {t("advertising.reporting.status")}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold" scope="col">
                      {t("advertising.reporting.objective")}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {t("advertising.reporting.dailyBudget")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {view.campaigns.map((campaign) => (
                    <tr key={campaign.campaignId}>
                      <th className="px-4 py-3 text-start font-semibold sm:px-5" scope="row">
                        <span className="block">{campaign.name ?? campaign.campaignId}</span>
                        {campaign.name ? (
                          <bdi className="text-label text-fg-muted" dir="ltr">
                            {campaign.campaignId}
                          </bdi>
                        ) : null}
                      </th>
                      <td className="px-4 py-3 text-end">{number(campaign.adCount, code)}</td>
                      <td className="px-4 py-3 text-end">
                        {money(campaign.spend, selectedAccount.currency, code)}
                      </td>
                      <td className="px-4 py-3 text-end">{number(campaign.impressions, code)}</td>
                      <td className="px-4 py-3 text-end">{number(campaign.clicks, code)}</td>
                      <td className="px-4 py-3 text-end">
                        {campaign.results === null
                          ? t("advertising.reporting.notAvailable")
                          : number(campaign.results, code)}
                      </td>
                      <td className="px-4 py-3 text-end">{percent(campaign.ctr, code, t)}</td>
                      <td className="px-4 py-3 text-end">
                        {moneyOrUnavailable(campaign.cpc, selectedAccount.currency, code, t)}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {moneyOrUnavailable(campaign.cpm, selectedAccount.currency, code, t)}
                      </td>
                      <td className="px-4 py-3 text-start">
                        {campaign.status ?? t("advertising.reporting.notAvailable")}
                      </td>
                      <td className="px-4 py-3 text-start">
                        {campaign.objective ?? t("advertising.reporting.notAvailable")}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {campaign.dailyBudget
                          ? money(Number(campaign.dailyBudget), selectedAccount.currency, code)
                          : t("advertising.reporting.notAvailable")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {result.objects.some(
            (object) => object.objectType === "adset" && object.metadata?.targeting,
          ) ? (
            <Card data-testid="advertising-reporting-targeting">
              <CardHeader>
                <CardTitle>{t("advertising.reporting.targetingTitle")}</CardTitle>
                <CardDescription>{t("advertising.reporting.targetingDescription")}</CardDescription>
              </CardHeader>
              <div
                className="overflow-x-auto"
                role="region"
                tabIndex={0}
                aria-label={t("advertising.reporting.targetingTableLabel")}
              >
                <table className="text-body w-full min-w-[640px] text-start">
                  <caption className="sr-only">
                    {t("advertising.reporting.targetingTableLabel")}
                  </caption>
                  <thead className="bg-surface-subtle text-label text-fg-muted">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold" scope="col">
                        {t("advertising.reporting.adSet")}
                      </th>
                      <th className="px-4 py-3 text-start font-semibold" scope="col">
                        {t("advertising.reporting.targetingTitle")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {result.objects
                      .filter(
                        (object) => object.objectType === "adset" && object.metadata?.targeting,
                      )
                      .map((object) => (
                        <tr key={object.externalObjectId}>
                          <th className="px-4 py-3 text-start font-semibold" scope="row">
                            <span className="block">{object.name ?? object.externalObjectId}</span>
                            <bdi className="text-label text-fg-muted" dir="ltr">
                              {object.externalObjectId}
                            </bdi>
                          </th>
                          <td className="px-4 py-3 text-start">
                            {formatTargeting(object.metadata?.targeting)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          {view.promotedPosts?.length ? (
            <Card data-testid="advertising-reporting-promoted-posts">
              <CardHeader>
                <div>
                  <CardTitle>{t("advertising.reporting.promotedPostsTitle")}</CardTitle>
                  <CardDescription>
                    {t("advertising.reporting.promotedPostsDescription")}
                  </CardDescription>
                </div>
                <Badge variant="outline">{t("advertising.reporting.paidOnly")}</Badge>
              </CardHeader>
              <div
                aria-label={t("advertising.reporting.promotedPostsTableLabel")}
                className="overflow-x-auto"
                role="region"
                tabIndex={0}
              >
                <table className="text-body w-full min-w-[640px] text-start">
                  <caption className="sr-only">
                    {t("advertising.reporting.promotedPostsTableLabel")}
                  </caption>
                  <thead className="bg-surface-subtle text-label text-fg-muted">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold" scope="col">
                        {t("advertising.reporting.postId")}
                      </th>
                      <th className="px-4 py-3 text-end font-semibold" scope="col">
                        {t("advertising.reporting.ads")}
                      </th>
                      <th className="px-4 py-3 text-end font-semibold" scope="col">
                        {t("advertising.reporting.spend")}
                      </th>
                      <th className="px-4 py-3 text-end font-semibold" scope="col">
                        {t("advertising.reporting.impressions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {view.promotedPosts.map((post) => (
                      <tr key={post.postId}>
                        <th className="px-4 py-3 text-start font-semibold" scope="row">
                          <bdi dir="ltr">{post.postId}</bdi>
                        </th>
                        <td className="px-4 py-3 text-end">{number(post.adCount, code)}</td>
                        <td className="px-4 py-3 text-end">
                          {money(post.spend, selectedAccount.currency, code)}
                        </td>
                        <td className="px-4 py-3 text-end">{number(post.impressions, code)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          <Card data-testid="advertising-reporting-audience">
            <CardHeader>
              <div>
                <CardTitle>{t("advertising.reporting.audienceTitle")}</CardTitle>
                <CardDescription>{t("advertising.reporting.audienceDescription")}</CardDescription>
              </div>
            </CardHeader>
            {result.audience.length === 0 ? (
              <p className="text-label text-fg-secondary px-4 pb-4 sm:px-5">
                {t("advertising.reporting.audienceUnavailable")}
              </p>
            ) : (
              <div
                aria-label={t("advertising.reporting.audienceTableLabel")}
                className="overflow-x-auto"
                role="region"
                tabIndex={0}
              >
                <table className="text-body w-full min-w-[720px] text-start">
                  <caption className="sr-only">
                    {t("advertising.reporting.audienceTableLabel")}
                  </caption>
                  <thead className="bg-surface-subtle text-label text-fg-muted">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold" scope="col">
                        {t("advertising.reporting.breakdown")}
                      </th>
                      <th className="px-4 py-3 text-start font-semibold" scope="col">
                        {t("advertising.reporting.dimension")}
                      </th>
                      <th className="px-4 py-3 text-end font-semibold" scope="col">
                        {t("advertising.reporting.spend")}
                      </th>
                      <th className="px-4 py-3 text-end font-semibold" scope="col">
                        {t("advertising.reporting.impressions")}
                      </th>
                      <th className="px-4 py-3 text-end font-semibold" scope="col">
                        {t("advertising.reporting.reach")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {result.audience.map((row) => (
                      <tr key={`${row.reportDate}-${row.breakdown}-${row.dimensionValue}`}>
                        <th className="px-4 py-3 text-start font-semibold" scope="row">
                          {row.breakdown}
                        </th>
                        <td className="px-4 py-3 text-start">{row.dimensionValue}</td>
                        <td className="px-4 py-3 text-end">
                          {money(Number(row.spend), selectedAccount.currency, code)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          {row.impressions === null
                            ? t("advertising.reporting.notAvailable")
                            : number(row.impressions, code)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          {row.reach === null
                            ? t("advertising.reporting.notAvailable")
                            : number(row.reach, code)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      <p className="text-label text-fg-muted" data-testid="advertising-reporting-last-sync">
        {t("advertising.reporting.lastSync")}:{" "}
        {result.lastSuccessfulSyncAt
          ? formatDate(new Date(result.lastSuccessfulSyncAt), code, {
              timeZone: selectedAccount.timezone ?? workspace.timezone,
              dateStyle: "medium",
              timeStyle: "short",
            })
          : t("advertising.reporting.notAvailable")}
      </p>
    </div>
  );
}

function ReportState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <EmptyState icon={icon} title={title} description={description} action={action} />;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="sm">
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-title-card text-fg-primary mt-1 font-semibold" dir="ltr">
        {value}
      </p>
    </Card>
  );
}

function formatTargeting(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  return Object.entries(value as Record<string, unknown>)
    .slice(0, 8)
    .map(([key, entry]) => `${key}: ${typeof entry === "string" ? entry : JSON.stringify(entry)}`)
    .join(" · ");
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined): boolean {
  return (
    value !== undefined &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

function localDate(timeZone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function number(value: number, code: Parameters<typeof formatNumber>[1]): string {
  return formatNumber(value, code, { maximumFractionDigits: 2 });
}

function money(
  value: number,
  currency: string | null,
  code: Parameters<typeof formatNumber>[1],
): string {
  if (currency && /^[A-Z]{3}$/.test(currency))
    return formatCurrency(value, currency, code, { maximumFractionDigits: 2 });
  return `${number(value, code)}${currency ? ` ${currency}` : ""}`;
}

function moneyOrUnavailable(
  value: number | null,
  currency: string | null,
  code: Parameters<typeof formatNumber>[1],
  t: (key: string) => string,
): string {
  return value === null ? t("advertising.reporting.notAvailable") : money(value, currency, code);
}

function percent(
  value: number | null,
  code: Parameters<typeof formatNumber>[1],
  t: (key: string) => string,
): string {
  return value === null
    ? t("advertising.reporting.notAvailable")
    : formatPercent(value, code, { maximumFractionDigits: 2 });
}
