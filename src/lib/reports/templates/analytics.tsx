import * as React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  type AgencyReachAggregate,
  type ReportTemplateContext,
  type ReportTemplateSpec,
} from "@/lib/reports/templates/types";
import { aggregateAgencyReach, resolvePeriodPreset } from "@/lib/reports/aggregate";

/**
 * Analytics — the FIRST report template.
 *
 * Covers reach / views / engaged-accounts / interactions / follower-growth
 * across the chosen workspaces × channels for the chosen period.
 *
 * Layout is a 1-page cover + a per-channel table. New templates
 * (Post engagement, Ads campaigns) only need to land their own
 * `load()` + `render()`; this canvas is the shared scaffolding.
 */

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#0F172A" },
  header: { borderBottom: "1pt solid #E2E8F0", paddingBottom: 12, marginBottom: 24 },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 12, color: "#4F46E5", letterSpacing: 1 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 22, marginTop: 4 },
  meta: { fontSize: 10, color: "#475569", marginTop: 8 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#4F46E5",
  },
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  kpi: {
    flex: 1,
    border: "1pt solid #E2E8F0",
    borderRadius: 6,
    padding: 12,
  },
  kpiLabel: { fontSize: 9, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 18, marginTop: 4, color: "#0F172A" },
  kpiSublabel: { fontSize: 9, color: "#94A3B8", marginTop: 4 },
  table: { borderTop: "1pt solid #E2E8F0" },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#475569",
    borderBottom: "1pt solid #E2E8F0",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottom: "1pt solid #F1F5F9",
    fontSize: 10,
  },
  cellWide: { width: "38%" },
  cellMid: { width: "16%" },
  cellNarrow: { width: "10%" },
  cellRight: { textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#94A3B8",
    borderTop: "1pt solid #E2E8F0",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  empty: { fontSize: 11, color: "#94A3B8", padding: 24, textAlign: "center" },
});

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatSigned(n: number): string {
  if (n > 0) return `+${formatNumber(n)}`;
  if (n < 0) return `−${formatNumber(Math.abs(n))}`;
  return "0";
}

function DocumentFooter({ generatedAt }: { generatedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Generated {generatedAt}</Text>
      <Text render={({ pageNumber, totalPages: tp }) => `Page ${pageNumber} of ${tp}`} />
      <Text>Laratik Planner · internal report</Text>
    </View>
  );
}

const AnalyticsPdf = ({
  ctx,
  data,
}: {
  ctx: ReportTemplateContext;
  data: AgencyReachAggregate;
}): React.ReactElement => {
  const generatedAt = new Date().toISOString();
  return (
    <Document
      title={`Analytics · ${formatRange(ctx.period)}`}
      author="Laratik Planner"
      subject="Agency analytics report"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.brand}>LARATIK PLANNER · ANALYTICS</Text>
          <Text style={styles.title}>Reach & engagement report</Text>
          <Text style={styles.meta}>
            {ctx.preparedFor ? `Prepared for ${ctx.preparedFor}` : "Prepared"}
            {" · "}
            {formatRange(ctx.period)}
            {" · "}
            {data.cells} {data.cells === 1 ? "channel" : "channels"} · {data.days} days
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Totals across the period</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Reach</Text>
            <Text style={styles.kpiValue}>{formatNumber(data.totals.reach)}</Text>
            <Text style={styles.kpiSublabel}>Distinct people</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Views</Text>
            <Text style={styles.kpiValue}>{formatNumber(data.totals.views)}</Text>
            <Text style={styles.kpiSublabel}>Across all content</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Engaged accounts</Text>
            <Text style={styles.kpiValue}>{formatNumber(data.totals.engagedAccounts)}</Text>
            <Text style={styles.kpiSublabel}>Unique likers / commenters</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Interactions</Text>
            <Text style={styles.kpiValue}>{formatNumber(data.totals.interactions)}</Text>
            <Text style={styles.kpiSublabel}>
              Follower growth {formatSigned(data.totals.followerGrowth)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Per-channel breakdown</Text>
        {data.perChannel.length === 0 ? (
          <Text style={styles.empty}>
            No channels were included, or no observations were recorded in this window. Try widening
            the period or selecting more channels.
          </Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cellWide]}>Channel / Workspace</Text>
              <Text style={[styles.cellMid, styles.cellRight]}>Reach</Text>
              <Text style={[styles.cellMid, styles.cellRight]}>Views</Text>
              <Text style={[styles.cellNarrow, styles.cellRight]}>Engaged</Text>
              <Text style={[styles.cellNarrow, styles.cellRight]}>Interactions</Text>
              <Text style={[styles.cellNarrow, styles.cellRight]}>Follower Δ</Text>
            </View>
            {data.perChannel.map((row) => (
              <View key={row.channelId} style={styles.tableRow} wrap={false}>
                <Text style={styles.cellWide}>
                  {row.channelName}
                  {"\n"}
                  <Text style={{ fontSize: 8, color: "#64748B" }}>
                    {row.workspaceName} · {row.channelType}
                  </Text>
                </Text>
                <Text style={[styles.cellMid, styles.cellRight]}>{formatNumber(row.reach)}</Text>
                <Text style={[styles.cellMid, styles.cellRight]}>{formatNumber(row.views)}</Text>
                <Text style={[styles.cellNarrow, styles.cellRight]}>
                  {formatNumber(row.engagedAccounts)}
                </Text>
                <Text style={[styles.cellNarrow, styles.cellRight]}>
                  {formatNumber(row.interactions)}
                </Text>
                <Text style={[styles.cellNarrow, styles.cellRight]}>
                  {formatSigned(row.followerGrowth)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <DocumentFooter generatedAt={generatedAt} />
      </Page>
    </Document>
  );
};

function formatRange(period: ReportTemplateContext["period"]): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(period.from)} – ${fmt(period.to)}`;
}

export const analyticsTemplate: ReportTemplateSpec<AgencyReachAggregate> = {
  id: "analytics",
  requires: "agency-reach",
  label: "Reach & engagement",
  blurb: "Reach, views, engagement and follower growth across the chosen workspaces × channels.",
  load: async (ctx) => {
    return aggregateAgencyReach({
      workspaceIds: ctx.workspaceIds,
      channelIds: ctx.channelIds,
      from: ctx.period.from,
      to: ctx.period.to,
    });
  },
  render: AnalyticsPdf,
};

// Build a default-context helper. The Reports page passes its own
// preparedFor / workspaceIds; this is the orchestrator's "cold start".
export function defaultAnalyticsContext(agencyId: string): ReportTemplateContext {
  return {
    agencyId,
    workspaceIds: [],
    channelIds: [],
    period: resolvePeriodPreset("30d"),
    preparedFor: "",
  };
}
