import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Bookmark,
  CalendarDays,
  Download,
  Search,
  ShieldAlert,
} from "lucide-react";
import { FormField } from "@/components/forms/form-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/workspace/page-header";
import { ListPagination } from "@/components/ui/list-pagination";
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
import {
  buildBudgetPacingInsights,
  buildCampaignPerformanceInsights,
  buildCreativeFatigueInsights,
} from "@/lib/advertising/intelligence";
import { querySocialPostObservations } from "@/lib/social/analytics-query";
import {
  AdvertisingIntelligencePanel,
  type AdvertisingIntelligenceLabels,
} from "./advertising-intelligence-panel";
import {
  AdvertisingReportVisuals,
  type AdvertisingReportVisualLabels,
} from "./advertising-report-visuals";
import {
  AdvertisingClientReport,
  type AdvertisingClientReportLabels,
} from "./advertising-client-report";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("advertising.reporting.title") };
}

type SearchParams = {
  accountId?: string | string[];
  since?: string | string[];
  until?: string | string[];
  campaignPage?: string | string[];
  adSetPage?: string | string[];
  adPage?: string | string[];
  audiencePage?: string | string[];
  presentation?: string | string[];
  search?: string | string[];
  objective?: string | string[];
  status?: string | string[];
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
  const rangeIsValid =
    since <= until &&
    new Date(`${until}T00:00:00Z`).getTime() - new Date(`${since}T00:00:00Z`).getTime() <=
      93 * 24 * 60 * 60 * 1000;

  const heading = (
    <div className="space-y-3">
      <nav
        aria-label={t("advertising.reporting.breadcrumbAria")}
        className="text-label text-fg-muted"
      >
        <ol className="flex flex-wrap items-center gap-2">
          <li>{t("advertising.reporting.breadcrumbIntegrations")}</li>
          <li aria-hidden="true">/</li>
          <li>{t("advertising.reporting.breadcrumbAdvertising")}</li>
          <li aria-hidden="true">/</li>
          <li className="text-fg-primary font-medium" aria-current="page">
            {t("advertising.reporting.breadcrumbReporting")}
          </li>
        </ol>
      </nav>
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
    </div>
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
  if (!rangeIsValid) {
    return (
      <div className="space-y-6" data-testid="advertising-reporting-invalid-range">
        {heading}
        <ReportState
          icon={<ShieldAlert className="h-8 w-8" aria-hidden="true" />}
          title={t("advertising.reporting.invalidRangeTitle")}
          description={t("advertising.reporting.invalidRangeDescription")}
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
  const campaignSearch = firstQueryValue(query.search)?.trim().toLowerCase() ?? "";
  const objectiveFilter = firstQueryValue(query.objective) ?? "";
  const statusFilter = firstQueryValue(query.status) ?? "";
  const visibleCampaigns = view.campaigns.filter((campaign) => {
    const searchMatch =
      campaignSearch.length === 0 ||
      (String(campaign.name ?? "") + " " + campaign.campaignId)
        .toLowerCase()
        .includes(campaignSearch);
    const objectiveMatch = !objectiveFilter || campaign.objective === objectiveFilter;
    const statusMatch = !statusFilter || campaign.status === statusFilter;
    return searchMatch && objectiveMatch && statusMatch;
  });
  const campaignInsights = buildCampaignPerformanceInsights(visibleCampaigns);
  const budgetPacing = buildBudgetPacingInsights(visibleCampaigns, since, until);
  const creativeFatigue = buildCreativeFatigueInsights(result.report.rows, view.ads, since, until);
  const organicByPostId = await loadOrganicPromotedPosts({
    postIds: new Set(view.promotedPosts?.map((post) => post.postId) ?? []),
    workspaceId: workspace.id,
    timezone: workspace.timezone,
    since,
    until,
  });
  const freshnessLabel = t(`advertising.reporting.freshness.${result.freshness}`);
  const syncLabel = result.syncStatus
    ? t(`advertising.syncStatus.${result.syncStatus}`)
    : t("advertising.reporting.notAvailable");
  const campaignPage = paginate(visibleCampaigns, firstQueryValue(query.campaignPage));
  const adSetPage = paginate(view.adSets, firstQueryValue(query.adSetPage));
  const adPage = paginate(view.ads, firstQueryValue(query.adPage));
  const audiencePage = paginate(result.audience, firstQueryValue(query.audiencePage));
  const clientReportHref = `${basePath}?${new URLSearchParams({
    accountId: selectedAccount.id,
    since,
    until,
    presentation: "client",
  }).toString()}`;
  const objectiveOptions = [
    ...new Set(view.campaigns.map((campaign) => campaign.objective).filter(Boolean)),
  ] as string[];
  const statusOptions = [
    ...new Set(view.campaigns.map((campaign) => campaign.status).filter(Boolean)),
  ] as string[];

  if (firstQueryValue(query.presentation) === "client") {
    return (
      <div className="space-y-6" data-testid="advertising-client-report-shell">
        <AdvertisingClientReport
          accountName={selectedAccount.name}
          accountId={selectedAccount.id}
          workspaceId={workspace.id}
          currency={selectedAccount.currency}
          since={since}
          until={until}
          freshness={freshnessLabel}
          partial={result.partial}
          totals={result.report.totals}
          campaigns={view.campaigns}
          performance={campaignInsights}
          pacing={budgetPacing}
          fatigue={creativeFatigue}
          promotedPosts={view.promotedPosts ?? []}
          organicByPostId={
            new Map(
              [...organicByPostId.entries()].map(
                ([postId, value]) => [postId, value.views] as const,
              ),
            )
          }
          backHref={`${basePath}?accountId=${encodeURIComponent(selectedAccount.id)}&since=${since}&until=${until}`}
          labels={advertisingClientReportLabels(t)}
          locale={code}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="advertising-reporting-page">
      {heading}
      <form
        method="get"
        action={basePath}
        className="border-border bg-surface grid gap-4 rounded-[var(--radius-card)] border p-4 sm:grid-cols-2 xl:grid-cols-6 xl:items-end"
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
        <FormField id="advertising-report-search" label={t("advertising.reporting.search")}>
          <div className="relative">
            <Search
              className="text-fg-muted pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id="advertising-report-search"
              name="search"
              defaultValue={campaignSearch}
              placeholder={t("advertising.reporting.searchPlaceholder")}
              className="ps-9"
            />
          </div>
        </FormField>
        <FormField id="advertising-report-objective" label={t("advertising.reporting.objective")}>
          <select
            id="advertising-report-objective"
            name="objective"
            defaultValue={objectiveFilter}
            className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 focus:outline-none focus-visible:ring-2"
          >
            <option value="">{t("advertising.reporting.allObjectives")}</option>
            {objectiveOptions.map((objective) => (
              <option key={objective} value={objective}>
                {objective}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="advertising-report-status" label={t("advertising.reporting.status")}>
          <select
            id="advertising-report-status"
            name="status"
            defaultValue={statusFilter}
            className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 focus:outline-none focus-visible:ring-2"
          >
            <option value="">{t("advertising.reporting.allStatuses")}</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </FormField>
        <button
          type="submit"
          className="bg-primary text-label focus-visible:ring-focus-ring min-h-11 rounded-[var(--radius-control)] px-4 font-semibold text-white focus:outline-none focus-visible:ring-2"
        >
          {t("advertising.reporting.apply")}
        </button>
        <a
          href={`/api/advertising/report?${new URLSearchParams({
            accountId: selectedAccount.id,
            workspaceId: workspace.id,
            since,
            until,
            surface: "csv_export",
          }).toString()}`}
          className="border-border text-label text-fg-primary focus-visible:ring-focus-ring inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border px-4 font-semibold focus:outline-none focus-visible:ring-2"
          download
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("advertising.reporting.exportCsv")}
        </a>
      </form>
      <p className="text-label text-fg-muted -mt-3 inline-flex items-center gap-2">
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        {t("advertising.reporting.periodSummary", { since, until })}
      </p>

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
        <Link
          href={clientReportHref}
          className="text-label text-primary focus-visible:ring-focus-ring ms-auto inline-flex min-h-9 items-center gap-1 rounded font-semibold focus:outline-none focus-visible:ring-2"
        >
          <Bookmark className="h-4 w-4" aria-hidden="true" />
          {t("advertising.reporting.openClientReport")}
        </Link>
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
            <div className="flex flex-wrap items-end justify-between gap-3">
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
              <Badge variant="outline">
                {t("advertising.reporting.periodSummary", { since, until })}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
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
                label={t("advertising.reporting.activeAds")}
                value={
                  view.activeAdCount === null
                    ? t("advertising.reporting.notAvailable")
                    : number(view.activeAdCount, code)
                }
                testId="advertising-reporting-active-ads"
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
          <AdvertisingIntelligencePanel
            campaigns={campaignInsights}
            pacing={budgetPacing}
            fatigue={creativeFatigue}
            currency={selectedAccount.currency}
            locale={code}
            audienceCount={result.audience.length}
            labels={advertisingIntelligenceLabels(t)}
          />
          <AdvertisingReportVisuals
            dailySpend={view.dailySpend}
            campaigns={view.campaigns}
            currency={selectedAccount.currency}
            locale={code}
            labels={advertisingReportVisualLabels(t)}
          />
          <ReportViewTabs t={t} />

          <Card
            id="advertising-reporting-campaigns"
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
                  {campaignPage.items.map((campaign) => (
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
            <ReportPagination
              page={campaignPage.page}
              totalPages={campaignPage.totalPages}
              total={campaignPage.total}
              from={campaignPage.from}
              to={campaignPage.to}
              testId="advertising-reporting-campaigns-pagination"
              pageParam="campaignPage"
              basePath={basePath}
              accountId={selectedAccount.id}
              since={since}
              until={until}
              t={t}
            />
          </Card>
          <Card id="advertising-reporting-adsets" data-testid="advertising-reporting-adsets">
            <CardHeader>
              <CardTitle>{t("advertising.reporting.adSetsTitle")}</CardTitle>
              <CardDescription>{t("advertising.reporting.adSetsDescription")}</CardDescription>
            </CardHeader>
            {view.adSets.length === 0 ? (
              <p className="text-label text-fg-secondary px-4 pb-4">
                {t("advertising.reporting.notAvailable")}
              </p>
            ) : (
              <div
                className="overflow-x-auto"
                role="region"
                tabIndex={0}
                aria-label={t("advertising.reporting.adSetsTableLabel")}
              >
                <table className="text-body w-full min-w-[760px] text-start">
                  <caption className="sr-only">
                    {t("advertising.reporting.adSetsTableLabel")}
                  </caption>
                  <thead className="bg-surface-subtle text-label text-fg-muted">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold" scope="col">
                        {t("advertising.reporting.adSet")}
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
                      <th className="px-4 py-3 text-start font-semibold" scope="col">
                        {t("advertising.reporting.status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {adSetPage.items.map((adSet) => (
                      <tr key={adSet.adSetId}>
                        <th className="px-4 py-3 text-start font-semibold" scope="row">
                          <span className="block">{adSet.name ?? adSet.adSetId}</span>
                          <bdi className="text-label text-fg-muted" dir="ltr">
                            {adSet.adSetId}
                          </bdi>
                        </th>
                        <td className="px-4 py-3 text-end">{number(adSet.adCount, code)}</td>
                        <td className="px-4 py-3 text-end">
                          {money(adSet.spend, selectedAccount.currency, code)}
                        </td>
                        <td className="px-4 py-3 text-end">{number(adSet.impressions, code)}</td>
                        <td className="px-4 py-3 text-end">{number(adSet.clicks, code)}</td>
                        <td className="px-4 py-3 text-end">
                          {adSet.results === null
                            ? t("advertising.reporting.notAvailable")
                            : number(adSet.results, code)}
                        </td>
                        <td className="px-4 py-3 text-start">
                          {adSet.status ?? t("advertising.reporting.notAvailable")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ReportPagination
              page={adSetPage.page}
              totalPages={adSetPage.totalPages}
              total={adSetPage.total}
              from={adSetPage.from}
              to={adSetPage.to}
              testId="advertising-reporting-adsets-pagination"
              pageParam="adSetPage"
              basePath={basePath}
              accountId={selectedAccount.id}
              since={since}
              until={until}
              t={t}
            />
          </Card>
          <Card id="advertising-reporting-ads" data-testid="advertising-reporting-ads">
            <CardHeader>
              <CardTitle>{t("advertising.reporting.adsTitle")}</CardTitle>
              <CardDescription>{t("advertising.reporting.adsDescription")}</CardDescription>
            </CardHeader>
            {view.ads.length === 0 ? (
              <p className="text-label text-fg-secondary px-4 pb-4">
                {t("advertising.reporting.notAvailable")}
              </p>
            ) : (
              <div
                className="overflow-x-auto"
                role="region"
                tabIndex={0}
                aria-label={t("advertising.reporting.adsTableLabel")}
              >
                <table className="text-body w-full min-w-[760px] text-start">
                  <caption className="sr-only">{t("advertising.reporting.adsTableLabel")}</caption>
                  <thead className="bg-surface-subtle text-label text-fg-muted">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold" scope="col">
                        {t("advertising.reporting.ad")}
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
                      <th className="px-4 py-3 text-start font-semibold" scope="col">
                        {t("advertising.reporting.status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {adPage.items.map((ad) => (
                      <tr key={ad.adId}>
                        <th className="px-4 py-3 text-start font-semibold" scope="row">
                          <span className="block">{ad.name ?? ad.adId}</span>
                          <bdi className="text-label text-fg-muted" dir="ltr">
                            {ad.adId}
                          </bdi>
                        </th>
                        <td className="px-4 py-3 text-end">
                          {money(ad.spend, selectedAccount.currency, code)}
                        </td>
                        <td className="px-4 py-3 text-end">{number(ad.impressions, code)}</td>
                        <td className="px-4 py-3 text-end">{number(ad.clicks, code)}</td>
                        <td className="px-4 py-3 text-end">
                          {ad.results === null
                            ? t("advertising.reporting.notAvailable")
                            : number(ad.results, code)}
                        </td>
                        <td className="px-4 py-3 text-start">
                          {ad.status ?? t("advertising.reporting.notAvailable")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ReportPagination
              page={adPage.page}
              totalPages={adPage.totalPages}
              total={adPage.total}
              from={adPage.from}
              to={adPage.to}
              testId="advertising-reporting-ads-pagination"
              pageParam="adPage"
              basePath={basePath}
              accountId={selectedAccount.id}
              since={since}
              until={until}
              t={t}
            />
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
                <Badge variant="outline">{t("advertising.reporting.paidOrganicCombined")}</Badge>
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
                      <th className="px-4 py-3 text-end font-semibold" scope="col">
                        {t("advertising.reporting.organicViews")}
                      </th>
                      <th className="px-4 py-3 text-end font-semibold" scope="col">
                        {t("advertising.reporting.combinedViews")}
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
                        <td className="px-4 py-3 text-end">
                          {organicByPostId.get(post.postId)?.views === null ||
                          !organicByPostId.get(post.postId)
                            ? t("advertising.reporting.notAvailable")
                            : number(organicByPostId.get(post.postId)?.views ?? 0, code)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          {combinedMetric(
                            post.impressions,
                            organicByPostId.get(post.postId)?.views,
                          ) === null
                            ? t("advertising.reporting.notAvailable")
                            : number(
                                combinedMetric(
                                  post.impressions,
                                  organicByPostId.get(post.postId)?.views,
                                )!,
                                code,
                              )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          <Card id="advertising-reporting-audience" data-testid="advertising-reporting-audience">
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
                    {audiencePage.items.map((row) => (
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
            <ReportPagination
              page={audiencePage.page}
              totalPages={audiencePage.totalPages}
              total={audiencePage.total}
              from={audiencePage.from}
              to={audiencePage.to}
              testId="advertising-reporting-audience-pagination"
              pageParam="audiencePage"
              basePath={basePath}
              accountId={selectedAccount.id}
              since={since}
              until={until}
              t={t}
            />
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

function advertisingIntelligenceLabels(
  t: (key: string, values?: Record<string, string | number>) => string,
): AdvertisingIntelligenceLabels {
  return {
    title: t("advertising.reporting.decisionTitle"),
    description: t("advertising.reporting.decisionDescription"),
    campaignSignal: t("advertising.reporting.campaignSignal"),
    campaignSignalDescription: t("advertising.reporting.campaignSignalDescription"),
    effective: t("advertising.reporting.effective"),
    underperforming: t("advertising.reporting.underperforming"),
    monitor: t("advertising.reporting.monitor"),
    insufficient: t("advertising.reporting.insufficient"),
    budgetPacing: t("advertising.reporting.budgetPacing"),
    budgetPacingDescription: t("advertising.reporting.budgetPacingDescription"),
    over: t("advertising.reporting.over"),
    onTrack: t("advertising.reporting.onTrack"),
    under: t("advertising.reporting.under"),
    unavailable: t("advertising.reporting.notAvailable"),
    creativeHealth: t("advertising.reporting.creativeHealth"),
    creativeHealthDescription: t("advertising.reporting.creativeHealthDescription"),
    fatiguing: t("advertising.reporting.fatiguing"),
    stable: t("advertising.reporting.stable"),
    needsData: t("advertising.reporting.needsData"),
    noComparison: t("advertising.reporting.noComparison"),
    noBudgetData: t("advertising.reporting.noBudgetData"),
    noFatigueData: t("advertising.reporting.noFatigueData"),
    sample: t("advertising.reporting.sample"),
    actual: t("advertising.reporting.actual"),
    expected: t("advertising.reporting.expected"),
    change: t("advertising.reporting.change"),
    cpc: t("advertising.reporting.cpc"),
    audienceOpportunity: t("advertising.reporting.audienceOpportunity"),
    audienceOpportunityDescription: t("advertising.reporting.audienceOpportunityDescription"),
    audienceRows: t("advertising.reporting.audienceRows"),
    noAudienceData: t("advertising.reporting.noAudienceData"),
  };
}

function advertisingReportVisualLabels(
  t: (key: string, values?: Record<string, string | number>) => string,
): AdvertisingReportVisualLabels {
  return {
    spendTrendTitle: t("advertising.reporting.spendTrendTitle"),
    spendTrendDescription: t("advertising.reporting.spendTrendDescription"),
    spendTrendAccessible: t("advertising.reporting.spendTrendAccessible"),
    performanceByObjectiveTitle: t("advertising.reporting.performanceByObjectiveTitle"),
    performanceByObjectiveDescription: t("advertising.reporting.performanceByObjectiveDescription"),
    noSpendData: t("advertising.reporting.noSpendData"),
    noObjectiveData: t("advertising.reporting.noObjectiveData"),
    unknownObjective: t("advertising.reporting.unknownObjective"),
    totalSpend: t("advertising.reporting.totalSpend"),
    legendSpend: t("advertising.reporting.legendSpend"),
  };
}

function ReportViewTabs({
  t,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <nav
      aria-label={t("advertising.reporting.viewNavigation")}
      className="border-border bg-surface flex flex-wrap gap-1 rounded-[var(--radius-card)] border p-1"
    >
      <a
        href="#advertising-reporting-campaigns"
        className="bg-primary-subtle text-primary focus-visible:ring-focus-ring text-label inline-flex min-h-10 items-center rounded-[var(--radius-control)] px-4 font-semibold focus:outline-none focus-visible:ring-2"
      >
        {t("advertising.reporting.campaignsTitle")}
      </a>
      <a
        href="#advertising-reporting-adsets"
        className="text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring text-label inline-flex min-h-10 items-center rounded-[var(--radius-control)] px-4 font-semibold focus:outline-none focus-visible:ring-2"
      >
        {t("advertising.reporting.adSetsTitle")}
      </a>
      <a
        href="#advertising-reporting-ads"
        className="text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring text-label inline-flex min-h-10 items-center rounded-[var(--radius-control)] px-4 font-semibold focus:outline-none focus-visible:ring-2"
      >
        {t("advertising.reporting.adsTitle")}
      </a>
      <a
        href="#advertising-reporting-audience"
        className="text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring text-label inline-flex min-h-10 items-center rounded-[var(--radius-control)] px-4 font-semibold focus:outline-none focus-visible:ring-2"
      >
        {t("advertising.reporting.audienceTitle")}
      </a>
    </nav>
  );
}

function advertisingClientReportLabels(
  t: (key: string, values?: Record<string, string | number>) => string,
): AdvertisingClientReportLabels {
  return {
    backToAnalytics: t("advertising.reporting.backToAnalytics"),
    reportBadge: t("advertising.reporting.reportBadge"),
    title: t("advertising.reporting.clientReportTitle"),
    description: t("advertising.reporting.clientReportDescription"),
    period: t("advertising.reporting.period"),
    source: t("advertising.reporting.source"),
    dataStatus: t("advertising.reporting.dataStatus"),
    partial: t("advertising.reporting.partial"),
    complete: t("advertising.reporting.complete"),
    summary: t("advertising.reporting.summaryTitle"),
    spend: t("advertising.reporting.spend"),
    impressions: t("advertising.reporting.impressions"),
    clicks: t("advertising.reporting.clicks"),
    results: t("advertising.reporting.results"),
    ctr: t("advertising.reporting.ctr"),
    cpc: t("advertising.reporting.cpc"),
    campaignScorecard: t("advertising.reporting.campaignScorecard"),
    campaign: t("advertising.reporting.campaign"),
    status: t("advertising.reporting.status"),
    effective: t("advertising.reporting.effective"),
    underperforming: t("advertising.reporting.underperforming"),
    monitor: t("advertising.reporting.monitor"),
    insufficient: t("advertising.reporting.insufficient"),
    budgetPacing: t("advertising.reporting.budgetPacing"),
    actual: t("advertising.reporting.actual"),
    expected: t("advertising.reporting.expected"),
    over: t("advertising.reporting.over"),
    onTrack: t("advertising.reporting.onTrack"),
    under: t("advertising.reporting.under"),
    unavailable: t("advertising.reporting.notAvailable"),
    creativeHealth: t("advertising.reporting.creativeHealth"),
    fatiguing: t("advertising.reporting.fatiguing"),
    stable: t("advertising.reporting.stable"),
    needsData: t("advertising.reporting.needsData"),
    promotedContent: t("advertising.reporting.promotedContent"),
    promotedContentDescription: t("advertising.reporting.promotedContentDescription"),
    post: t("advertising.reporting.postId"),
    paidImpressions: t("advertising.reporting.impressions"),
    organicViews: t("advertising.reporting.organicViews"),
    combinedViews: t("advertising.reporting.combinedViews"),
    notAvailable: t("advertising.reporting.notAvailable"),
    aiRecommendations: {
      title: t("advertising.reporting.aiRecommendations"),
      description: t("advertising.reporting.aiRecommendationsDescription"),
      generate: t("advertising.reporting.generateRecommendations"),
      generating: t("advertising.reporting.generatingRecommendations"),
      confidence: t("advertising.reporting.confidence"),
      evidence: t("advertising.reporting.evidence"),
      limitations: t("advertising.reporting.limitations"),
      error: t("advertising.reporting.recommendationsError"),
      unavailable: t("advertising.reporting.recommendationsUnavailable"),
    },
  };
}

function MetricCard({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <Card padding="sm" data-testid={testId}>
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

type OrganicPromotedPost = {
  views: number | null;
};

const REPORT_PAGE_SIZE = 50;

function paginate<T>(items: readonly T[], requestedPage: string | undefined) {
  const parsed = requestedPage ? Number.parseInt(requestedPage, 10) : 1;
  const totalPages = Math.max(1, Math.ceil(items.length / REPORT_PAGE_SIZE));
  const page = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), totalPages) : 1;
  const start = (page - 1) * REPORT_PAGE_SIZE;
  return {
    items: items.slice(start, start + REPORT_PAGE_SIZE),
    page,
    totalPages,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + REPORT_PAGE_SIZE, items.length),
  };
}

function ReportPagination({
  page,
  totalPages,
  total,
  from,
  to,
  testId,
  pageParam,
  basePath,
  accountId,
  since,
  until,
  t,
}: {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  testId: string;
  pageParam: string;
  basePath: string;
  accountId: string;
  since: string;
  until: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  if (totalPages <= 1) return null;
  const hrefFor = (nextPage: number) => {
    const params = new URLSearchParams({ accountId, since, until, [pageParam]: String(nextPage) });
    return `${basePath}?${params.toString()}`;
  };
  return (
    <ListPagination
      page={page}
      totalPages={totalPages}
      total={total}
      from={from}
      to={to}
      prevHref={page > 1 ? hrefFor(page - 1) : null}
      nextHref={page < totalPages ? hrefFor(page + 1) : null}
      counterLabel={t("advertising.reporting.paginationAll", { from, to, total })}
      ariaLabel={t("advertising.reporting.paginationAria")}
      prevLabel={t("advertising.reporting.paginationPrev")}
      nextLabel={t("advertising.reporting.paginationNext")}
      pageIndicator={t("advertising.reporting.paginationPageOf", {
        page,
        total: totalPages,
      })}
      testId={testId}
    />
  );
}

async function loadOrganicPromotedPosts(args: {
  postIds: ReadonlySet<string>;
  workspaceId: string;
  timezone: string;
  since: string;
  until: string;
}): Promise<Map<string, OrganicPromotedPost>> {
  if (args.postIds.size === 0) return new Map();
  const rows = await querySocialPostObservations(
    db,
    args.workspaceId,
    args.timezone,
    new Date(`${args.until}T23:59:59.999Z`),
    90,
    {
      start: new Date(`${args.since}T00:00:00.000Z`),
      end: new Date(`${shiftDate(args.until, 1)}T00:00:00.000Z`),
    },
  );
  const result = new Map<string, OrganicPromotedPost>();
  for (const row of rows) {
    if (
      row.observation.externalProvider !== "meta" ||
      !args.postIds.has(row.observation.externalPostId) ||
      result.has(row.observation.externalPostId)
    )
      continue;
    result.set(row.observation.externalPostId, { views: row.observation.views });
  }
  return result;
}

function combinedMetric(paid: number, organic: number | null | undefined): number | null {
  return organic === null || organic === undefined ? null : paid + organic;
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
