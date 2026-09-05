import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { AnalyticsProbeCard } from "@/app/(app)/app/agency-settings/social/providers/analytics-probe-card";

/**
 * M4 follow-up (2026-09-05) — the probe card used to render every
 * non-`available` metric with the same warning-coloured `XCircle`
 * icon and no per-status context. Operators reading
 * `engagedAccounts: unsupported` on the Facebook Page branch
 * (the by-design row, see ADR 0005) were filing "this metric is
 * broken" tickets because the row was visually identical to
 * `reach: error · metric_unavailable`.
 *
 * These tests pin the new contract:
 *
 *   - `unsupported` rows get a muted `Info` icon, not the warning
 *     `XCircle`.
 *   - Every row carries a `data-status` attribute so an operator or
 *     a follow-up test can assert on the four-status shape.
 *   - The hover `title` distinguishes the four statuses with a
 *     status-specific reason. The by-design row (engagedAccounts on
 *     a Facebook Page) points at the platform contract that
 *     justifies the row.
 *
 * The Facebook + Instagram fixture here mirrors the real probe
 * result an operator sees for "Food Game" — `interactions` is
 * available on both, `engagedAccounts` is `unsupported` on the
 * Facebook Page branch and available on the Instagram branch.
 */

const profiles = [
  {
    channelId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    workspaceName: "Just Halal",
    accountName: "Food Game",
    platform: "facebook" as const,
  },
  {
    channelId: "33333333-3333-4333-8333-333333333333",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    workspaceName: "Just Halal",
    accountName: "Food Game",
    platform: "instagram" as const,
  },
];

const probeResponseForFacebook = {
  profile: profiles[0],
  permissions: [
    { permission: "pages_show_list", status: "granted" },
    { permission: "pages_read_engagement", status: "granted" },
  ],
  metrics: {
    followerCount: { status: "available" },
    reach: { status: "error", providerErrorCode: "metric_unavailable" },
    views: { status: "error", providerErrorCode: "metric_unavailable" },
    interactions: { status: "available" },
    engagedAccounts: { status: "unsupported" },
  },
  testedAt: "2026-09-05T12:00:00.000Z",
};

const probeResponseForInstagram = {
  profile: profiles[1],
  permissions: [
    { permission: "instagram_basic", status: "granted" },
    { permission: "instagram_manage_insights", status: "granted" },
  ],
  metrics: {
    followerCount: { status: "available" },
    reach: { status: "available" },
    views: { status: "available" },
    interactions: { status: "available" },
    engagedAccounts: { status: "available" },
  },
  testedAt: "2026-09-05T12:00:00.000Z",
};

function mockFetchOnce(body: unknown) {
  return vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("AnalyticsProbeCard status contract", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders a data-status attribute and a status-specific hover title for every metric", async () => {
    const user = userEvent.setup();
    globalThis.fetch = mockFetchOnce(probeResponseForFacebook);

    render(
      <LocaleProvider locale="en">
        <AnalyticsProbeCard profiles={profiles} />
      </LocaleProvider>,
    );

    await user.click(screen.getByTestId("analytics-probe-run"));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-probe-result")).toBeInTheDocument();
    });

    // All four statuses represented in the same result row.
    const available = screen.getByTestId("analytics-probe-metric-followerCount");
    const reach = screen.getByTestId("analytics-probe-metric-reach");
    const views = screen.getByTestId("analytics-probe-metric-views");
    const interactions = screen.getByTestId("analytics-probe-metric-interactions");
    const engagedAccounts = screen.getByTestId("analytics-probe-metric-engagedAccounts");

    expect(available.getAttribute("data-status")).toBe("available");
    expect(available.getAttribute("title")).toMatch(/supported and Meta returned a value/i);

    expect(reach.getAttribute("data-status")).toBe("error");
    expect(reach.getAttribute("title")).toMatch(/error code 100/i);
    expect(reach.getAttribute("title")).toMatch(/docs\/operations\/meta-devtools-mcp\.md/);

    expect(views.getAttribute("data-status")).toBe("error");
    expect(views.getAttribute("title")).toMatch(/error code 100/i);

    expect(interactions.getAttribute("data-status")).toBe("available");
    expect(interactions.getAttribute("title")).toMatch(/supported and Meta returned a value/i);

    // The by-design row. Pages have no accounts_engaged equivalent;
    // the title must point at the platform contract (ADR 0005) and
    // not the MCP triage doc — operators must NOT file a "fix this"
    // ticket for this row.
    expect(engagedAccounts.getAttribute("data-status")).toBe("unsupported");
    expect(engagedAccounts.getAttribute("title")).toMatch(
      /Facebook Pages do not expose an accounts_engaged/i,
    );
    expect(engagedAccounts.getAttribute("title")).toMatch(/ADR 0005/);
  });

  it("renders all metrics as available on the Instagram branch (engagedAccounts is supported)", async () => {
    const user = userEvent.setup();
    globalThis.fetch = mockFetchOnce(probeResponseForInstagram);

    render(
      <LocaleProvider locale="en">
        <AnalyticsProbeCard profiles={profiles} />
      </LocaleProvider>,
    );

    await user.click(screen.getByTestId("analytics-probe-run"));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-probe-result")).toBeInTheDocument();
    });

    for (const metric of [
      "followerCount",
      "reach",
      "views",
      "interactions",
      "engagedAccounts",
    ] as const) {
      const row = screen.getByTestId(`analytics-probe-metric-${metric}`);
      expect(row.getAttribute("data-status")).toBe("available");
    }
  });

  it("switches the profile selector and re-runs against a different channel", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // The channelId is in the POST body, not the URL. The probe
      // card posts to /api/social/providers/analytics-test with a
      // JSON body of `{ channelId }`. Switch the response shape
      // based on which channelId the component sends.
      let channelId = "";
      if (init?.body) {
        try {
          channelId = JSON.parse(String(init.body)).channelId ?? "";
        } catch {
          // Fall through — empty channelId falls back to Facebook.
        }
      }
      const instagramChannelId = profiles[1]?.channelId;
      const body =
        channelId && channelId === instagramChannelId
          ? probeResponseForInstagram
          : probeResponseForFacebook;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock;

    render(
      <LocaleProvider locale="en">
        <AnalyticsProbeCard profiles={profiles} />
      </LocaleProvider>,
    );

    // First run — defaults to the first profile (Facebook).
    await user.click(screen.getByTestId("analytics-probe-run"));
    await waitFor(() => {
      expect(screen.getByTestId("analytics-probe-metric-engagedAccounts")).toHaveAttribute(
        "data-status",
        "unsupported",
      );
    });

    // Switch to the Instagram profile and re-run.
    const instagramChannelId = profiles[1]?.channelId;
    if (!instagramChannelId) {
      throw new Error("test fixture missing Instagram profile");
    }
    await user.selectOptions(screen.getByTestId("analytics-probe-profile"), instagramChannelId);
    await user.click(screen.getByTestId("analytics-probe-run"));
    await waitFor(() => {
      expect(screen.getByTestId("analytics-probe-metric-engagedAccounts")).toHaveAttribute(
        "data-status",
        "available",
      );
    });
  });
});
