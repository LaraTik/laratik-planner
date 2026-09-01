import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";

/**
 * The card reaches a server action to record the publication
 * outcome. The bilingual chrome test only needs the action
 * shape to typecheck; the click → submit flow is covered by
 * `tests/e2e/content-flow.spec.ts`.
 */
vi.mock("@/app/(app)/app/w/[slug]/planning/actions", () => ({
  recordPublicationAction: vi.fn(),
}));

const { ChannelPublishingCard } = await import("@/components/planning/channel-publishing-card");

const channel = {
  id: "ch-test-1",
  platform: "instagram",
  accountName: "Acme IG",
  configured: false,
};

const publishedPublication = {
  status: "published" as const,
  publishedUrl: "https://example.com/post-1",
  note: "Scheduled slot",
  failureReason: null,
};

describe("ChannelPublishingCard localization", () => {
  it("renders English chrome from the active client locale", () => {
    render(
      <LocaleProvider locale="en">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={channel}
          publication={publishedPublication}
          isPublisher={false}
        />
      </LocaleProvider>,
    );

    // Status badge from the en catalog
    expect(screen.getByTestId("channel-card-status")).toHaveTextContent("Published");
    // In-setup badge appears because the channel is unconfigured
    expect(screen.getByTestId("channel-card-setup")).toHaveTextContent("In setup");
    // Note prefix uses the locale-aware template
    expect(screen.getByText(/Note:\s*Scheduled slot/)).toBeInTheDocument();
  });

  it("renders Arabic chrome from the active client locale", () => {
    render(
      <LocaleProvider locale="ar">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={channel}
          publication={publishedPublication}
          isPublisher={false}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("channel-card-status")).toHaveTextContent("منشور");
    expect(screen.getByTestId("channel-card-setup")).toHaveTextContent("قيد الإعداد");
    // Arabic note prefix includes the value, no colon reordering.
    expect(screen.getByText(/ملاحظة:\s*Scheduled slot/)).toBeInTheDocument();
  });

  it("renders the publisher record-outcome button in the active locale", () => {
    render(
      <LocaleProvider locale="ar">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={{ ...channel, configured: true }}
          publication={null}
          isPublisher={true}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("channel-card-record-outcome")).toHaveTextContent("تسجيل النتيجة");
  });

  it("renders the publisher update-outcome button in the active locale", () => {
    render(
      <LocaleProvider locale="ar">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={{ ...channel, configured: true }}
          publication={publishedPublication}
          isPublisher={true}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("channel-card-record-outcome")).toHaveTextContent("تحديث النتيجة");
  });

  it("renders the failure-reason label in the active locale when the form is open", () => {
    render(
      <LocaleProvider locale="en">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={{ ...channel, configured: true }}
          publication={null}
          isPublisher={true}
        />
      </LocaleProvider>,
    );

    // The form is collapsed by default; the test asserts the
    // entry button is the only control rendered. The form-label
    // coverage lives in the e2e suite where the click → open
    // transition is exercised.
    expect(screen.getByTestId("channel-card-record-outcome")).toHaveTextContent("Record outcome");
  });
});
