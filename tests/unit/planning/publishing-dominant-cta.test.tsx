import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublishingCommandCenter } from "@/components/planning/publishing-command-center";
import { tFor } from "@/messages";

/**
 * D4 + the lifecycle gate.
 *
 * Two step-looking things sit on this screen: the workspace's six-stage
 * workflow rail and the publish panel's four-phase preparation strip.
 * Below the publishing-setup stage the rail owns the next action, so the
 * panel must not offer a lifecycle-advancing CTA of its own.
 */
function renderCenter(overrides: Partial<Parameters<typeof PublishingCommandCenter>[0]> = {}) {
  return render(
    <PublishingCommandCenter
      channelCount={1}
      readyChannelCount={1}
      blockerCount={0}
      publishingSetupReady={false}
      outcomesRecorded={0}
      workflowAtPublishingSetup={false}
      t={tFor("en")}
      {...overrides}
    />,
  );
}

describe("publishing dominant CTA lifecycle gate", () => {
  it("does not offer to advance the lifecycle before the workflow reaches publishing setup", () => {
    renderCenter();
    const action = screen.getByTestId("publishing-command-center-action");
    expect(action).toHaveTextContent("Review setup");
    // "Mark publishing setup ready" is the lifecycle advance the rail
    // still owns; offering both at once is the conflict.
    expect(action).not.toHaveTextContent("Mark publishing setup ready");
    expect(action).toHaveAttribute("href", "#publish-package");
  });

  it("offers the setup confirmation once the workflow has reached publishing setup", () => {
    renderCenter({ workflowAtPublishingSetup: true });
    expect(screen.getByTestId("publishing-command-center-action")).toHaveTextContent(
      "Review and confirm",
    );
  });

  it("keeps blockers above the lifecycle gate", () => {
    renderCenter({ blockerCount: 3, readyChannelCount: 0, workflowAtPublishingSetup: true });
    // A blocker is a package-level problem, so it outranks both the
    // lifecycle gate and the setup confirmation.
    expect(screen.getByTestId("publishing-command-center-action")).toHaveTextContent(
      "Review blockers",
    );
  });

  it("sends the user to outcomes once setup is confirmed", () => {
    renderCenter({ publishingSetupReady: true, outcomesRecorded: 0 });
    const action = screen.getByTestId("publishing-command-center-action");
    expect(action).toHaveTextContent("Record outcomes");
    expect(action).toHaveAttribute("href", "#publish-outcomes");
  });
});
