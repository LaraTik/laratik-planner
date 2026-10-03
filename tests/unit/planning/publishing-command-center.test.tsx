import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublishingCommandCenter } from "@/components/planning/publishing-command-center";
import { tFor } from "@/messages";

describe("PublishingCommandCenter", () => {
  it("summarizes blockers and links each step to the right surface", () => {
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
    expect(screen.getByRole("link", { name: /Open channel setup/ })).toHaveAttribute(
      "href",
      "#publish-package",
    );
    expect(screen.getByRole("link", { name: /Open outcomes/ })).toHaveAttribute(
      "href",
      "#publish-outcomes",
    );
  });

  it("renders the confirmed state in Arabic", () => {
    render(
      <PublishingCommandCenter
        channelCount={2}
        readyChannelCount={2}
        blockerCount={0}
        publishingSetupReady
        outcomesRecorded={1}
        t={tFor("ar")}
      />,
    );

    expect(screen.getByTestId("publishing-command-center")).toHaveTextContent("تم تأكيد الإعداد");
    expect(screen.getByTestId("publishing-command-center-status")).toHaveTextContent(
      "تم تأكيد إعداد النشر",
    );
  });
});
