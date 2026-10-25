import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdvertisingAdminPanel } from "@/app/(app)/app/agency-settings/advertising/advertising-admin-panel";
import { validateAdvertisingConnectionAction } from "@/app/(app)/app/agency-settings/advertising/actions";

vi.mock("@/app/(app)/app/agency-settings/advertising/actions", () => ({
  createAdvertisingConnectionAction: vi.fn(async () => ({})),
  grantAdvertisingFinancialAuthorityAction: vi.fn(async () => ({})),
  grantAdvertisingVisibilityAction: vi.fn(async () => ({})),
  revokeAdvertisingConnectionAction: vi.fn(async () => ({})),
  revokeAdvertisingAccountAccessAction: vi.fn(async () => ({})),
  revokeAdvertisingFinancialAuthorityAction: vi.fn(async () => ({})),
  revokeAdvertisingVisibilityAction: vi.fn(async () => ({})),
  storeAdvertisingCredentialAction: vi.fn(async () => ({})),
  updateAdvertisingGraphApiVersionAction: vi.fn(async () => ({})),
  validateAdvertisingConnectionAction: vi.fn(async () => ({})),
  setAdvertisingSyncStateAction: vi.fn(async () => ({})),
}));

const connection = {
  id: "00000000-0000-4000-8000-000000000101",
  displayName: "Agency Meta",
  provider: "meta",
  status: "invalid",
  currentCredentialVersion: 0,
  lastValidatedAt: null,
  lastValidationStatus: null,
  lastValidationCode: null,
  graphApiVersion: "v25.0",
  accessTokenLast4: null,
  createdAt: "2026-10-13T00:00:00.000Z",
} as const;
const testAsOf = new Date().toISOString();

const readinessAccountId = "00000000-0000-4000-8000-000000000202";
const readinessConnection = {
  ...connection,
  status: "active" as string,
  currentCredentialVersion: 1,
  lastValidatedAt: "2026-10-24T00:00:00.000Z",
  lastValidationStatus: "passed" as string | null,
};
const readinessAccount = {
  id: readinessAccountId,
  name: "LaraTik Ads",
  externalAccountId: "act_202",
  currency: "EUR",
  timezone: "Europe/Berlin",
  status: "active",
};
const activeReadReportsGrant = {
  id: "00000000-0000-4000-8000-000000000404",
  accountId: readinessAccountId,
  accountName: "LaraTik Ads",
  workspaceId: null as string | null,
  workspaceName: null as string | null,
  capability: "read_reports" as string,
  campaignIds: null as string[] | null,
  adSetIds: null as string[] | null,
  adIds: null as string[] | null,
  startsAt: new Date(Date.now() - 60_000).toISOString(),
  endsAt: null as string | null,
  revokedAt: null as string | null,
};
const completeReconciliation = {
  id: "00000000-0000-4000-8000-000000000809",
  accountId: readinessAccountId,
  accountName: "LaraTik Ads",
  reportDate: "2026-10-24",
  currency: "EUR",
  providerAccountSpend: "2.22",
  canonicalAdSpend: "2.22",
  workspaceAttributedSpend: "2.22",
  unallocatedSpend: "0.00",
  discrepancy: "0.00",
  completeness: "complete",
  checkedAt: new Date(Date.now() - 30_000).toISOString(),
};
type ValidationResultFixture = {
  id: string;
  connectionId: string;
  accountId: string | null;
  operation: string;
  status: string;
  sanitizedCode: string | null;
  retryable: boolean;
  checkedAt: string;
};
type SyncRunFixture = {
  id: string;
  connectionId: string;
  accountId: string;
  accountName: string;
  status: string;
  rowsRead: number;
  rowsWritten: number;
  errorCode: string | null;
  partial: boolean;
  startedAt: string;
  completedAt: string | null;
};
type CapabilityFixture = {
  id: string;
  connectionId: string;
  accountId: string;
  capability: string;
  status: string;
  checkedAt: Date;
};
type SyncStateFixture = {
  id: string;
  connectionId: string;
  accountId: string;
  accountName: string;
  externalAccountId: string;
  status: string;
  lastCompletedAt: string | null;
  nextRunAt: string | null;
  lastErrorCode: string | null;
};
const readinessProps = {
  asOf: testAsOf,
  connections: [readinessConnection],
  accounts: [readinessAccount],
  workspaces: [],
  syncStates: [] as SyncStateFixture[],
  connectionAccounts: [],
  socialIdentities: [],
  capabilities: [
    {
      id: "00000000-0000-4000-8000-000000000405",
      connectionId: readinessConnection.id,
      accountId: readinessAccountId,
      capability: "read_reports",
      status: "available",
      checkedAt: new Date(testAsOf),
    },
  ] as CapabilityFixture[],
  visibilityGrants: [activeReadReportsGrant],
  validationResults: [] as ValidationResultFixture[],
  syncRuns: [] as SyncRunFixture[],
  reconciliations: [completeReconciliation],
  latestReconciliations: [completeReconciliation],
};

function renderReadiness(overrides: Partial<typeof readinessProps> = {}) {
  render(
    <AdvertisingAdminPanel
      {...readinessProps}
      {...overrides}
      latestReconciliations={
        overrides.latestReconciliations ??
        overrides.reconciliations ??
        readinessProps.latestReconciliations
      }
    />,
  );
}

describe("AdvertisingAdminPanel", () => {
  it("renders the platform-owned credential workflow without exposing a stored token", () => {
    render(
      <AdvertisingAdminPanel
        asOf={testAsOf}
        connections={[connection]}
        accounts={[]}
        workspaces={[]}
        syncStates={[]}
        connectionAccounts={[]}
        socialIdentities={[]}
        capabilities={[]}
      />,
    );

    expect(screen.getByTestId("advertising-setup-steps")).toBeInTheDocument();
    expect(screen.getByText("Connect credential")).toBeInTheDocument();
    expect(screen.getByTestId("advertising-create-form")).toBeInTheDocument();
    expect(screen.getByText("Agency Meta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save credential" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update version" })).toBeInTheDocument();
    expect(
      screen.getAllByLabelText("Graph API version").map((input) => input.getAttribute("value")),
    ).toContain("v25.0");
    expect(screen.getByRole("button", { name: "Validate and discover" })).toBeDisabled();
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
  });

  it("renders the empty state when no connection exists", () => {
    render(
      <AdvertisingAdminPanel
        asOf={testAsOf}
        connections={[]}
        accounts={[]}
        workspaces={[]}
        syncStates={[]}
        connectionAccounts={[]}
        socialIdentities={[]}
        capabilities={[]}
      />,
    );

    expect(screen.getByTestId("advertising-empty")).toHaveTextContent(
      "No Meta advertising connections have been configured.",
    );
  });

  it("shows an explanation and recommended action for each failed diagnostic", async () => {
    vi.mocked(validateAdvertisingConnectionAction).mockResolvedValueOnce({
      code: "workflow_partial",
      diagnostics: [
        {
          operation: "campaign_read",
          state: "missing_permission",
          retryable: false,
        },
      ],
    });
    render(
      <AdvertisingAdminPanel
        asOf={testAsOf}
        connections={[{ ...connection, status: "active", currentCredentialVersion: 1 }]}
        accounts={[]}
        workspaces={[]}
        syncStates={[]}
        connectionAccounts={[]}
        socialIdentities={[]}
        capabilities={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Validate and discover" }));

    await waitFor(() => {
      expect(screen.getByTestId("advertising-diagnostic-campaign_read")).toHaveTextContent(
        "Confirm the Meta app has the required read permissions",
      );
    });
    expect(screen.getByTestId("advertising-diagnostic-campaign_read")).toHaveTextContent(
      "Campaign read",
    );
  });

  it("shows a safe configured indicator without filling the write-only token field", () => {
    render(
      <AdvertisingAdminPanel
        asOf={testAsOf}
        connections={[{ ...connection, currentCredentialVersion: 1, accessTokenLast4: "9abc" }]}
        accounts={[]}
        workspaces={[]}
        syncStates={[]}
        connectionAccounts={[]}
        socialIdentities={[]}
        capabilities={[]}
      />,
    );

    expect(screen.getByTestId(`advertising-credential-status-${connection.id}`)).toHaveTextContent(
      "Credential configured",
    );
    expect(screen.getByTestId(`advertising-credential-status-${connection.id}`)).toHaveTextContent(
      "••••9abc",
    );
    expect(screen.getByLabelText("Access token")).toHaveValue("");
    expect(
      screen.getByPlaceholderText("Enter a new token to replace the stored credential"),
    ).toBeInTheDocument();
  });

  it("renders an explicit sync activation control for a discovered account", () => {
    render(
      <AdvertisingAdminPanel
        asOf={testAsOf}
        connections={[{ ...connection, status: "active", currentCredentialVersion: 1 }]}
        accounts={[
          {
            id: "00000000-0000-4000-8000-000000000202",
            name: "LaraTik Ads",
            externalAccountId: "act_202",
            currency: "EUR",
            timezone: "Europe/Berlin",
            status: "active",
          },
        ]}
        workspaces={[]}
        syncStates={[]}
        connectionAccounts={[
          {
            connectionId: connection.id,
            accountId: "00000000-0000-4000-8000-000000000202",
            accountName: "LaraTik Ads",
            externalAccountId: "act_202",
            status: "active",
          },
        ]}
        socialIdentities={[
          {
            id: "00000000-0000-4000-8000-000000000303",
            connectionId: connection.id,
            accountId: null,
            identityType: "facebook_page",
            externalIdentityId: "page_303",
            displayName: "Food Game Page",
            username: null,
            status: "active",
          },
        ]}
        capabilities={[
          {
            id: "00000000-0000-4000-8000-000000000404",
            connectionId: connection.id,
            accountId: "00000000-0000-4000-8000-000000000202",
            capability: "read_reports",
            status: "available",
            checkedAt: new Date("2026-10-13T00:00:00.000Z"),
          },
        ]}
        visibilityGrants={[activeReadReportsGrant]}
      />,
    );

    expect(screen.getByTestId(`advertising-sync-${connection.id}`)).toHaveTextContent(
      "Advertising sync",
    );
    expect(screen.getByRole("button", { name: "Activate sync" })).toBeEnabled();
    expect(screen.getByTestId(`advertising-identities-${connection.id}`)).toHaveTextContent(
      "Food Game Page",
    );
    expect(screen.getByTestId(`advertising-capabilities-${connection.id}`)).toHaveTextContent(
      "Read reports",
    );
  });

  it("organizes discovered accounts into the dashboard inventory with a searchable table", () => {
    render(
      <AdvertisingAdminPanel
        asOf={testAsOf}
        connections={[{ ...connection, status: "active", currentCredentialVersion: 1 }]}
        accounts={[
          {
            id: "00000000-0000-4000-8000-000000000202",
            name: "LaraTik Ads",
            externalAccountId: "act_202",
            currency: "EUR",
            timezone: "Europe/Berlin",
            status: "active",
          },
        ]}
        workspaces={[]}
        syncStates={[]}
        connectionAccounts={[]}
        socialIdentities={[]}
        capabilities={[
          {
            id: "00000000-0000-4000-8000-000000000404",
            connectionId: connection.id,
            accountId: "00000000-0000-4000-8000-000000000202",
            capability: "read_reports",
            status: "available",
            checkedAt: new Date("2026-10-13T00:00:00.000Z"),
          },
        ]}
        visibilityGrants={[activeReadReportsGrant]}
      />,
    );

    expect(screen.getByTestId("advertising-overview")).toBeInTheDocument();
    expect(screen.getByTestId("advertising-accounts-table-card")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Account name / ID" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Search accounts by name or ID" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows a clear not-configured status with a link to create the connection", () => {
    render(
      <AdvertisingAdminPanel
        asOf={testAsOf}
        connections={[]}
        accounts={[]}
        workspaces={[]}
        syncStates={[]}
        connectionAccounts={[]}
        socialIdentities={[]}
        capabilities={[]}
      />,
    );

    expect(screen.getByTestId("advertising-operator-summary")).toHaveTextContent("Not configured");
    expect(
      screen.getByRole("link", { name: "Create a Meta advertising connection" }),
    ).toHaveAttribute("href", "#advertising-create-card");
  });

  it("points operators to the connection with a missing credential", () => {
    render(
      <AdvertisingAdminPanel
        asOf={testAsOf}
        connections={[connection]}
        accounts={[]}
        workspaces={[]}
        syncStates={[]}
        connectionAccounts={[]}
        socialIdentities={[]}
        capabilities={[]}
      />,
    );

    expect(screen.getByTestId("advertising-operator-summary")).toHaveTextContent("Needs attention");
    expect(
      screen.getByRole("link", { name: "Add or replace the encrypted Meta credential" }),
    ).toHaveAttribute("href", `#advertising-connection-${connection.id}`);
  });

  it("shows the latest account reconciliation status in the inventory", () => {
    const accountId = "00000000-0000-4000-8000-000000000202";
    render(
      <AdvertisingAdminPanel
        asOf={testAsOf}
        connections={[{ ...connection, status: "active", currentCredentialVersion: 1 }]}
        accounts={[
          {
            id: accountId,
            name: "LaraTik Ads",
            externalAccountId: "act_202",
            currency: "EUR",
            timezone: "Europe/Berlin",
            status: "active",
          },
        ]}
        workspaces={[]}
        syncStates={[]}
        connectionAccounts={[]}
        socialIdentities={[]}
        capabilities={[]}
        reconciliations={[
          {
            id: "00000000-0000-4000-8000-000000000809",
            accountId,
            accountName: "LaraTik Ads",
            reportDate: "2026-10-14",
            currency: "EUR",
            providerAccountSpend: "2.22",
            canonicalAdSpend: "2.22",
            workspaceAttributedSpend: "2.22",
            unallocatedSpend: "0.00",
            discrepancy: "0.00",
            completeness: "partial",
            checkedAt: "2026-10-14T10:42:40.000Z",
          },
          {
            id: "00000000-0000-4000-8000-000000000810",
            accountId,
            accountName: "LaraTik Ads",
            reportDate: "2026-10-15",
            currency: "EUR",
            providerAccountSpend: "3.22",
            canonicalAdSpend: "3.22",
            workspaceAttributedSpend: "3.22",
            unallocatedSpend: "0.00",
            discrepancy: "0.00",
            completeness: "complete",
            checkedAt: "2026-10-15T10:42:40.000Z",
          },
        ]}
      />,
    );

    const inventory = screen.getByTestId("advertising-accounts-table-card");
    const accountRow = within(inventory).getByRole("row", { name: /LaraTik Ads/ });
    expect(accountRow).toHaveTextContent("Complete");
    expect(accountRow).not.toHaveTextContent("Partial");
  });

  it("requires fresh validation after credentials change even if history shows a previous pass", () => {
    renderReadiness({
      connections: [{ ...readinessConnection, status: "invalid", lastValidationStatus: null }],
      validationResults: [
        {
          id: "00000000-0000-4000-8000-000000000901",
          connectionId: readinessConnection.id,
          accountId: readinessAccountId,
          operation: "report_read",
          status: "passed",
          sanitizedCode: null,
          retryable: false,
          checkedAt: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    });

    expect(screen.getByTestId("advertising-operator-summary")).toHaveTextContent("Needs attention");
    expect(
      screen.getByRole("link", { name: "Review the latest validation diagnostics" }),
    ).toBeInTheDocument();
  });

  it("offers a replacement connection for a revoked connection", () => {
    renderReadiness({
      connections: [{ ...readinessConnection, status: "revoked", currentCredentialVersion: 0 }],
    });

    expect(
      screen.getByRole("link", { name: "Create a Meta advertising connection" }),
    ).toHaveAttribute("href", "#advertising-create-card");
    expect(
      screen.queryByRole("link", { name: "Add or replace the encrypted Meta credential" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Review the latest validation diagnostics" }),
    ).not.toBeInTheDocument();
  });

  it("asks operators to discover accounts when a validated connection has none", () => {
    renderReadiness({
      accounts: [],
      connections: [{ ...readinessConnection, lastValidationStatus: "partial" }],
    });

    expect(screen.getByTestId("advertising-operator-summary")).toHaveTextContent("Needs attention");
    expect(screen.getByRole("link", { name: "Run account discovery" })).toHaveAttribute(
      "href",
      `#advertising-connection-${readinessConnection.id}`,
    );
  });

  it("keeps inactive accounts out of reporting readiness and points operators to review them", () => {
    renderReadiness({
      accounts: [{ ...readinessAccount, status: "unavailable" }],
      capabilities: [
        {
          id: "00000000-0000-4000-8000-000000000405",
          connectionId: readinessConnection.id,
          accountId: readinessAccountId,
          capability: "read_reports",
          status: "available",
          checkedAt: new Date(testAsOf),
        },
      ],
    });

    const summary = screen.getByTestId("advertising-operator-summary");
    const inventory = screen.getByTestId("advertising-accounts-table-card");
    const accountRow = within(inventory).getByRole("row", { name: /LaraTik Ads/ });
    expect(summary).toHaveTextContent("Needs attention");
    expect(
      screen.getByRole("link", { name: "Review inactive advertising accounts" }),
    ).toHaveAttribute("href", "#advertising-accounts-table-card");
    expect(accountRow).toHaveTextContent("Not ready");
  });

  it("requires an available report capability in operator and account readiness", () => {
    renderReadiness({ capabilities: [] });

    expect(screen.getByTestId("advertising-operator-summary")).toHaveTextContent("Needs attention");
    expect(
      screen.getByRole("link", { name: "Review the latest validation diagnostics" }),
    ).toBeInTheDocument();
    const inventory = screen.getByTestId("advertising-accounts-table-card");
    const accountRow = within(inventory).getByRole("row", { name: /LaraTik Ads/ });
    expect(accountRow).toHaveTextContent("Not ready");
  });

  it("shows when each account last completed a sync in the inventory", () => {
    const fixedAsOf = "2026-10-25T12:00:00.000Z";
    renderReadiness({
      asOf: fixedAsOf,
      syncStates: [
        {
          id: "00000000-0000-4000-8000-000000000707",
          connectionId: readinessConnection.id,
          accountId: readinessAccountId,
          accountName: "LaraTik Ads",
          externalAccountId: "act_202",
          status: "idle",
          lastCompletedAt: "2026-10-25T10:00:00.000Z",
          nextRunAt: null,
          lastErrorCode: null,
        },
      ],
    });

    const inventory = screen.getByTestId("advertising-accounts-table-card");
    expect(
      within(inventory).getByRole("columnheader", { name: "Last completed sync" }),
    ).toBeInTheDocument();
    const accountRow = within(inventory).getByRole("row", { name: /LaraTik Ads/ });
    expect(accountRow).toHaveTextContent("2 hr. ago");
  });

  it("marks an account that never completed a sync as not scheduled", () => {
    renderReadiness({
      syncStates: [
        {
          id: "00000000-0000-4000-8000-000000000708",
          connectionId: readinessConnection.id,
          accountId: readinessAccountId,
          accountName: "LaraTik Ads",
          externalAccountId: "act_202",
          status: "paused",
          lastCompletedAt: null,
          nextRunAt: null,
          lastErrorCode: null,
        },
      ],
    });

    const inventory = screen.getByTestId("advertising-accounts-table-card");
    const accountRow = within(inventory).getByRole("row", { name: /LaraTik Ads/ });
    expect(accountRow).toHaveTextContent("Not scheduled");
  });

  it("uses the per-account latest reconciliation when history is capped", () => {
    renderReadiness({
      capabilities: [
        {
          id: "00000000-0000-4000-8000-000000000405",
          connectionId: readinessConnection.id,
          accountId: readinessAccountId,
          capability: "read_reports",
          status: "available",
          checkedAt: new Date(testAsOf),
        },
      ],
      reconciliations: [],
      latestReconciliations: [completeReconciliation],
    });

    expect(screen.getByTestId("advertising-operator-summary")).toHaveTextContent("Ready");
    const inventory = screen.getByTestId("advertising-accounts-table-card");
    const accountRow = within(inventory).getByRole("row", { name: /LaraTik Ads/ });
    expect(accountRow).toHaveTextContent("Complete");
  });

  it("marks the inventory not ready when its report visibility grant has expired", () => {
    renderReadiness({
      capabilities: [
        {
          id: "00000000-0000-4000-8000-000000000406",
          connectionId: readinessConnection.id,
          accountId: readinessAccountId,
          capability: "read_reports",
          status: "available",
          checkedAt: new Date(testAsOf),
        },
      ],
      visibilityGrants: [
        {
          ...activeReadReportsGrant,
          startsAt: new Date(Date.now() - 120_000).toISOString(),
          endsAt: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    });

    const inventory = screen.getByTestId("advertising-accounts-table-card");
    const accountRow = within(inventory).getByRole("row", { name: /LaraTik Ads/ });
    expect(accountRow).toHaveTextContent("Not ready");
  });

  it.each([
    ["a different capability", { ...activeReadReportsGrant, capability: "read_campaigns" }],
    ["a revoked grant", { ...activeReadReportsGrant, revokedAt: new Date().toISOString() }],
    [
      "an expired grant",
      {
        ...activeReadReportsGrant,
        startsAt: new Date(Date.now() - 120_000).toISOString(),
        endsAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ],
    [
      "a future grant",
      {
        ...activeReadReportsGrant,
        startsAt: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
  ])(
    "requires an effective read-report grant when visibility is covered by %s",
    (_reason, grant) => {
      renderReadiness({ visibilityGrants: [grant] });

      expect(
        screen.getByRole("link", { name: "Grant report visibility to the required account" }),
      ).toHaveAttribute("href", "#advertising-grants-card");
    },
  );

  it("clears older failed and partial runs after the account's newest run succeeds", () => {
    renderReadiness({
      syncRuns: [
        {
          id: "00000000-0000-4000-8000-000000000902",
          connectionId: readinessConnection.id,
          accountId: readinessAccountId,
          accountName: "LaraTik Ads",
          status: "failed",
          rowsRead: 0,
          rowsWritten: 0,
          errorCode: "provider_unavailable",
          partial: false,
          startedAt: "2026-10-24T10:00:00.000Z",
          completedAt: "2026-10-24T10:01:00.000Z",
        },
        {
          id: "00000000-0000-4000-8000-000000000904",
          connectionId: readinessConnection.id,
          accountId: readinessAccountId,
          accountName: "LaraTik Ads",
          status: "partial",
          rowsRead: 3,
          rowsWritten: 2,
          errorCode: "provider_unavailable",
          partial: true,
          startedAt: "2026-10-24T10:30:00.000Z",
          completedAt: "2026-10-24T10:31:00.000Z",
        },
        {
          id: "00000000-0000-4000-8000-000000000903",
          connectionId: readinessConnection.id,
          accountId: readinessAccountId,
          accountName: "LaraTik Ads",
          status: "completed",
          rowsRead: 4,
          rowsWritten: 4,
          errorCode: null,
          partial: false,
          startedAt: "2026-10-24T11:00:00.000Z",
          completedAt: "2026-10-24T11:01:00.000Z",
        },
      ],
    });

    expect(screen.getByTestId("advertising-operator-summary")).toHaveTextContent("Ready");
    expect(
      screen.queryByRole("link", { name: "Review the synchronization result or error" }),
    ).not.toBeInTheDocument();
  });

  it("labels an unavailable reconciliation separately from one that has not run", () => {
    renderReadiness({
      reconciliations: [
        {
          ...completeReconciliation,
          completeness: "unavailable",
          checkedAt: new Date().toISOString(),
        },
      ],
    });

    const inventory = screen.getByTestId("advertising-accounts-table-card");
    const accountRow = within(inventory).getByRole("row", { name: /LaraTik Ads/ });
    expect(accountRow).toHaveTextContent("Unavailable");
    expect(accountRow).not.toHaveTextContent("Not reconciled yet");
  });
});
