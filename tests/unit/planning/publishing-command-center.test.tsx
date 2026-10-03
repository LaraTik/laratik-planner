import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublishingCommandCenter } from "@/components/planning/publishing-command-center";
import { tFor } from "@/messages";

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
});
