import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";

const mocks = vi.hoisted(() => ({
  setProviderConfigAction: vi.fn(),
  removeProviderConfigAction: vi.fn(),
  testProviderConfigAction: vi.fn(),
  translate: vi.fn((key: string, params?: Record<string, string | number>) => {
    if (key === "agencyProviders.verifiedAt") return `Verified ${params?.date ?? ""}.`;
    return key;
  }),
}));

vi.mock("@/components/i18n/locale-provider", () => ({
  useLocaleT: () => mocks.translate,
  useLocaleCode: () => "ar",
}));
vi.mock("@/app/(app)/app/agency-settings/social/providers/actions", () => ({
  setProviderConfigAction: mocks.setProviderConfigAction,
  removeProviderConfigAction: mocks.removeProviderConfigAction,
  testProviderConfigAction: mocks.testProviderConfigAction,
}));

const { ProviderConfigCard } =
  await import("@/app/(app)/app/agency-settings/social/providers/provider-config-card");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.translate.mockImplementation((key: string, params?: Record<string, string | number>) => {
    const ar: Record<string, string> = {
      "agencyProviders.tiktokLabel": "TikTok Arabic",
      "agencyProviders.tiktokDescription": "TikTok description Arabic",
      "agencyProviders.tiktokAppIdLabel": "TikTok client key Arabic",
      "agencyProviders.appSecretLabel": "App secret Arabic",
      "agencyProviders.errorAgencyAdminRequired": "Agency admin error Arabic",
      "agencyProviders.testMetaLoginConfigRequired": "Meta config required Arabic",
      "agencyProviders.save": "Save Arabic",
      "agencyProviders.test": "Test Arabic",
    };
    if (key === "agencyProviders.verifiedAt") return `Verified ${params?.date ?? ""}.`;
    return ar[key] ?? key;
  });
  mocks.setProviderConfigAction.mockResolvedValue({ errorCode: "agency_admin_required" });
  mocks.removeProviderConfigAction.mockResolvedValue({ saved: true });
  mocks.testProviderConfigAction.mockResolvedValue({
    testResult: { ok: false, messageCodes: ["meta_login_config_required"] },
  });
});

function renderCard(
  existing: Parameters<typeof ProviderConfigCard>[0]["existing"] = null,
  now = new Date("2026-10-22T12:00:00.000Z"),
) {
  return render(
    <ProviderConfigCard
      provider="tiktok"
      agencyId="agency-1"
      agencySlug="laratik"
      actorId="user-1"
      existing={existing}
      now={now}
    />,
  );
}

describe("social provider config localization", () => {
  it("localizes provider labels and action errors from stable action codes", async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.getByRole("heading", { name: "TikTok Arabic" })).toBeInTheDocument();
    expect(screen.getByText("TikTok description Arabic")).toBeInTheDocument();
    await user.type(screen.getByLabelText("TikTok client key Arabic"), "client-key");
    await user.type(screen.getByLabelText("App secret Arabic"), "secret");
    await user.click(screen.getByTestId("provider-config-save-tiktok"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Agency admin error Arabic");
    });
  });

  it("localizes provider test-result message codes", async () => {
    const user = userEvent.setup();
    renderCard({
      appId: "client-key",
      loginConfigId: null,
      graphApiVersion: null,
      enabled: true,
      publishingEnabled: false,
      appReviewStatus: "not_requested",
      businessVerificationStatus: "not_required",
      lastTestedAt: null,
      lastTestedOk: null,
      lastTestErrorCode: null,
      configuredBy: "user-1",
      updatedAt: new Date("2026-10-22T00:00:00Z"),
    });
    await user.click(screen.getByTestId("provider-config-test-tiktok"));

    await waitFor(() => {
      expect(screen.getByTestId("provider-config-test-result-tiktok")).toHaveTextContent(
        "Meta config required Arabic",
      );
    });
    expect(screen.queryByTestId("provider-config-success-tiktok")).toBeNull();
  });

  it("uses the server-captured clock for relative test timestamps during hydration", () => {
    const renderedAt = new Date("2026-10-22T12:00:00.000Z");
    const lastTestedAt = new Date("2026-10-21T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));

    try {
      renderCard(
        {
          appId: "client-key",
          loginConfigId: null,
          graphApiVersion: null,
          enabled: true,
          publishingEnabled: false,
          appReviewStatus: "not_requested",
          businessVerificationStatus: "not_required",
          lastTestedAt,
          lastTestedOk: true,
          lastTestErrorCode: null,
          configuredBy: "user-1",
          updatedAt: lastTestedAt,
        },
        renderedAt,
      );

      const expectedRelativeDate = formatRelativeDate(lastTestedAt, renderedAt, "ar");
      const laterClientDate = formatRelativeDate(
        lastTestedAt,
        new Date("2030-01-01T00:00:00.000Z"),
        "ar",
      );
      expect(expectedRelativeDate).not.toBe(laterClientDate);
      expect(screen.getByTestId("provider-config-test-provenance-tiktok")).toHaveTextContent(
        expectedRelativeDate,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
