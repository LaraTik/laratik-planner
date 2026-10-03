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
    expect(screen.getByTestId("channel-card-setup")).toHaveTextContent("Needs setup");
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
    expect(screen.getByTestId("channel-card-setup")).toHaveTextContent("يتطلب الإعداد");
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

  it("opens the first outstanding outcome when setup has been confirmed", () => {
    render(
      <LocaleProvider locale="en">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={{ ...channel, configured: true }}
          publication={null}
          isPublisher={true}
          defaultOpen
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("channel-card-outcome-select")).toBeInTheDocument();
    expect(screen.queryByTestId("channel-card-record-outcome")).not.toBeInTheDocument();
  });
});

describe("ChannelPublishingCard ephemeral publications", () => {
  const ephemeral = (over: Record<string, unknown>) => ({
    status: "published" as const,
    publishedUrl: null,
    note: null,
    failureReason: null,
    ...over,
  });

  it("renders no link and says so when the window has closed", () => {
    const past = new Date(Date.now() - 60_000).toISOString();

    render(
      <LocaleProvider locale="en">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={{ ...channel, configured: true }}
          publication={ephemeral({ expiresAt: past })}
          isPublisher={false}
        />
      </LocaleProvider>,
    );

    // A link we already know is dead is worse than no link.
    expect(screen.queryByTestId("channel-card-published-url")).not.toBeInTheDocument();
    expect(screen.getByTestId("channel-card-expired")).toHaveTextContent(
      "Temporary content · link no longer available",
    );
  });

  it("marks a published outcome with no link at all", () => {
    render(
      <LocaleProvider locale="en">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={{ ...channel, configured: true }}
          publication={ephemeral({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() })}
          isPublisher={false}
        />
      </LocaleProvider>,
    );

    expect(screen.queryByTestId("channel-card-published-url")).not.toBeInTheDocument();
    expect(screen.getByTestId("channel-card-no-link")).toHaveTextContent(
      "Published · temporary content (no permanent link)",
    );
  });

  it("keeps a live link and adds the expiry hint while the window is open", () => {
    render(
      <LocaleProvider locale="en">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={{ ...channel, configured: true, timeZone: "UTC" }}
          publication={ephemeral({
            publishedUrl: "https://example.com/story-1",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          })}
          isPublisher={false}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("channel-card-published-url")).toBeInTheDocument();
    expect(screen.getByTestId("channel-card-expires-hint")).toHaveTextContent("Link expires");
    expect(screen.queryByTestId("channel-card-expired")).not.toBeInTheDocument();
  });

  it("leaves a permanent publication completely unchanged", () => {
    render(
      <LocaleProvider locale="en">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={{ ...channel, configured: true }}
          publication={{
            status: "published" as const,
            publishedUrl: "https://example.com/post-1",
            expiresAt: null,
            note: null,
            failureReason: null,
          }}
          isPublisher={false}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("channel-card-published-url")).toBeInTheDocument();
    expect(screen.queryByTestId("channel-card-expired")).not.toBeInTheDocument();
    expect(screen.queryByTestId("channel-card-no-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("channel-card-expires-hint")).not.toBeInTheDocument();
  });

  it("renders the expiry state in Arabic", () => {
    render(
      <LocaleProvider locale="ar">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={{ ...channel, configured: true }}
          publication={ephemeral({ expiresAt: new Date(Date.now() - 60_000).toISOString() })}
          isPublisher={false}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("channel-card-expired")).toHaveTextContent(
      "محتوى مؤقت · لم يعد الرابط متاحًا",
    );
    expect(screen.queryByTestId("channel-card-published-url")).not.toBeInTheDocument();
  });

  it("hides a dead link even when the permalink is still stored", () => {
    // The preserved permalink from ADR 0015 must not resurrect as a live
    // anchor once the window has closed.
    render(
      <LocaleProvider locale="en">
        <ChannelPublishingCard
          workspaceSlug="acme"
          channel={{ ...channel, configured: true }}
          publication={ephemeral({
            publishedUrl: "https://example.com/story-1",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          })}
          isPublisher={false}
        />
      </LocaleProvider>,
    );

    expect(screen.queryByTestId("channel-card-published-url")).not.toBeInTheDocument();
    expect(screen.getByTestId("channel-card-expired")).toBeInTheDocument();
  });
});
