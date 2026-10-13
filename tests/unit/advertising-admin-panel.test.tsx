import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdvertisingAdminPanel } from "@/app/(app)/app/agency-settings/advertising/advertising-admin-panel";
import { validateAdvertisingConnectionAction } from "@/app/(app)/app/agency-settings/advertising/actions";

vi.mock("@/app/(app)/app/agency-settings/advertising/actions", () => ({
  createAdvertisingConnectionAction: vi.fn(async () => ({})),
  grantAdvertisingFinancialAuthorityAction: vi.fn(async () => ({})),
  grantAdvertisingVisibilityAction: vi.fn(async () => ({})),
  revokeAdvertisingConnectionAction: vi.fn(async () => ({})),
  revokeAdvertisingFinancialAuthorityAction: vi.fn(async () => ({})),
  revokeAdvertisingVisibilityAction: vi.fn(async () => ({})),
  storeAdvertisingCredentialAction: vi.fn(async () => ({})),
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
  createdAt: "2026-10-13T00:00:00.000Z",
} as const;

describe("AdvertisingAdminPanel", () => {
  it("renders the platform-owned credential workflow without exposing a stored token", () => {
    render(
      <AdvertisingAdminPanel
        connections={[connection]}
        accounts={[]}
        workspaces={[]}
        syncStates={[]}
        connectionAccounts={[]}
        socialIdentities={[]}
        capabilities={[]}
      />,
    );

    expect(screen.getByTestId("advertising-create-form")).toBeInTheDocument();
    expect(screen.getByText("Agency Meta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save credential" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validate and discover" })).toBeDisabled();
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
  });

  it("renders the empty state when no connection exists", () => {
    render(
      <AdvertisingAdminPanel
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

  it("renders an explicit sync activation control for a discovered account", () => {
    render(
      <AdvertisingAdminPanel
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
});
