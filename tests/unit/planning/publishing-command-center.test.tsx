import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublishingCommandCenter } from "@/components/planning/publishing-command-center";
import { tFor } from "@/messages";
import { LocaleProvider } from "@/components/i18n/locale-provider";

describe("PublishingCommandCenter", () => {
  it("shows only the next action when blockers remain", () => {
    render(
      <PublishingCommandCenter
        channelCount={2}
        readyChannelCount={1}
        blockerCount={2}
        publishingSetupReady={false}
        outcomesRecorded={0}
        t={tFor("en")}
      />,
    );

    expect(screen.getByTestId("publishing-command-center")).toHaveTextContent("2 blockers");
    expect(screen.getByTestId("publishing-command-center-status")).toHaveTextContent(
      "Resolve the blockers shown below",
    );
    expect(screen.getByRole("link", { name: /Review blockers/ })).toHaveAttribute(
      "href",
      "#publish-package",
    );
  });

  it("takes the user directly to outcomes after setup is confirmed", () => {
    render(
      <PublishingCommandCenter
        channelCount={2}
        readyChannelCount={2}
        blockerCount={0}
        publishingSetupReady
        outcomesRecorded={1}
        t={tFor("en")}
      />,
    );

    expect(screen.getByTestId("publishing-command-center")).toHaveTextContent("Ready to record");
    expect(screen.getByTestId("publishing-command-center-status")).toHaveTextContent(
      "Setup is confirmed",
    );
    expect(screen.getByTestId("publishing-command-center-action")).toHaveAttribute(
      "href",
      "#publish-outcomes",
    );
  });

  it("renders the completed state in Arabic", () => {
    render(
      <PublishingCommandCenter
        channelCount={2}
        readyChannelCount={2}
        blockerCount={0}
        publishingSetupReady
        outcomesRecorded={2}
        t={tFor("ar")}
      />,
    );

    expect(screen.getByTestId("publishing-command-center")).toHaveTextContent(
      "تم تسجيل كل النتائج",
    );
    expect(screen.getByTestId("publishing-command-center-status")).toHaveTextContent(
      "تم تسجيل نتيجة النشر لكل قناة مختارة.",
    );
  });

  it("hosts the blocker list as a collapsed body, and only expands on request", () => {
    render(
      <PublishingCommandCenter
        channelCount={1}
        readyChannelCount={0}
        blockerCount={1}
        publishingSetupReady={false}
        outcomesRecorded={0}
        issues={[
          {
            path: "channels[0].approvedDeliveryVersion",
            code: "no_approved_delivery",
            severity: "blocker",
            message: "Approve a delivery asset version before publishing.",
          },
        ]}
        t={tFor("en")}
      />,
    );

    // Collapsed by default: the count is on the badge, the list only
    // costs space when there is something to do.
    expect(screen.queryByTestId("publishing-blocker-list")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /View all blockers/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    const list = screen.getByTestId("publishing-blocker-list");
    // The catalog message wins over the service's own message.
    expect(list).toHaveTextContent("Approve a delivery version before publishing.");
    // Delivery blockers resolve in Assets, not on this page.
    expect(screen.getByTestId("publishing-blocker-fix-no_approved_delivery")).toHaveAttribute(
      "href",
      "#assets-versions",
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("renders a manual-dispatch state instead of a dead fix link", () => {
    render(
      <PublishingCommandCenter
        channelCount={1}
        readyChannelCount={0}
        blockerCount={1}
        publishingSetupReady={false}
        outcomesRecorded={0}
        issues={[
          {
            // facebook / linkedin / ig_reel / other resolve their
            // destination profile at channel-link time; there is no
            // control on the publish page.
            path: "channels[0].payload.destinationProfile",
            code: "missing_destination",
            severity: "blocker",
            message: "Select a destination profile.",
          },
        ]}
        t={tFor("en")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /View all blockers/ }));
    expect(screen.getByTestId("publishing-blocker-manual-missing_destination")).toHaveTextContent(
      "Dispatch manually",
    );
    // The old behaviour linked this to "#publishing", i.e. the page the
    // operator was already on, with nothing to edit.
    expect(
      screen.queryByTestId("publishing-blocker-fix-missing_destination"),
    ).not.toBeInTheDocument();
  });

  it("localizes the blocker body", () => {
    render(
      <LocaleProvider locale="ar">
        <PublishingCommandCenter
          channelCount={1}
          readyChannelCount={0}
          blockerCount={1}
          publishingSetupReady={false}
          outcomesRecorded={0}
          issues={[
            {
              path: "channels[0].payload.caption",
              code: "missing_caption",
              severity: "blocker",
              message: "Instagram posts require a caption.",
            },
          ]}
          t={tFor("ar")}
        />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /عرض كل العوائق/ }));
    expect(screen.getByTestId("publishing-blocker-list")).toHaveTextContent(
      "أضف تعليقًا قبل النشر.",
    );
    expect(screen.getByTestId("publishing-blocker-fix-missing_caption")).toHaveAttribute(
      "href",
      "#publish-caption",
    );
  });
});
