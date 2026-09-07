import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgencyOwnedStorageForm } from "@/app/(app)/app/agency-settings/storage/agency-owned-storage-form";

vi.mock("@/app/(app)/app/agency-settings/storage/actions", () => ({
  saveAgencyOwnedR2Action: vi.fn(),
  testAgencyOwnedR2Action: vi.fn(),
  switchAgencyToManagedStorageAction: vi.fn(),
}));

const copy = {
  accountId: "Cloudflare account ID",
  endpoint: "S3 endpoint",
  bucket: "Bucket",
  accessKeyId: "Access key ID",
  secretAccessKey: "Secret access key",
  ownedTitle: "Use your own Cloudflare R2",
  ownedDescription: "Connect a separate R2 account and bucket for this agency.",
  ownedInstructions: "Use a token limited to this bucket.",
  ownedEndpointHint: "Use the official HTTPS endpoint.",
  ownedCredentialHint: "Credentials stay encrypted.",
  ownedTestHint: "A temporary write/read/delete probe will run.",
  ownedSave: "Connect agency R2",
  ownedTest: "Test agency R2",
  ownedTesting: "Testing agency R2…",
  ownedSaving: "Connecting agency R2…",
  ownedMode: "Agency-owned R2",
  managedMode: "Managed by LaraTik",
  currentMode: "Current mode",
  configured: "Configured credential",
  switchToManaged: "Switch back to LaraTik-managed storage",
  switching: "Switching…",
  backendChangeLocked: "Existing media requires a reviewed migration.",
  feedback: {
    invalidConfiguration: "Check the configuration.",
    testFailed: "The test failed.",
    saveFailed: "The save failed.",
    ownedTestSuccess: "The test succeeded.",
    ownedSavedVerified: "The connection is verified.",
    managedSwitched: "Managed storage is active.",
    backendMigrationRequired: "Migration required.",
    authRequired: "Sign in is required.",
    permissionDenied: "Permission denied.",
  },
};

const initial = {
  mode: "agency_owned" as const,
  accountId: "agency-account",
  endpoint: "https://agency-account.r2.cloudflarestorage.com",
  bucket: "agency-media",
  accessKeyLastFour: "cess",
  secretAccessKeyLastFour: "cret",
};

describe("AgencyOwnedStorageForm", () => {
  it("makes the active backend, credential suffix, and setup actions clear", () => {
    render(<AgencyOwnedStorageForm initial={initial} copy={copy} backendChangeLocked={false} />);

    expect(screen.getByTestId("agency-owned-storage-card")).toHaveTextContent("Agency-owned R2");
    expect(screen.getByText(/••••cess/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect agency R2" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch back to LaraTik-managed storage" }),
    ).toBeEnabled();
  });

  it("disables backend-changing actions when existing media requires migration", () => {
    render(
      <AgencyOwnedStorageForm
        initial={{ ...initial, mode: "managed" }}
        copy={copy}
        backendChangeLocked
      />,
    );

    expect(screen.getByText("Existing media requires a reviewed migration.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect agency R2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Test agency R2" })).toBeDisabled();
  });
});
