import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/locale-provider", () => ({
  useLocaleT: () => (key: string) => key,
}));

const { ReportBuilder } =
  await import("@/app/(app)/app/agency-settings/reports/_components/report-builder");

const props = {
  templates: [
    {
      id: "analytics",
      labelKey: "reports.analytics",
      labelFallback: "Analytics",
      blurbKey: "reports.analyticsBlurb",
      blurbFallback: "Reach and engagement",
      available: true,
    },
  ],
  workspaces: [{ id: "workspace-1", name: "Workspace One" }],
  channels: [
    { id: "channel-1", name: "Channel One", channelType: "instagram", workspaceId: "workspace-1" },
    { id: "channel-2", name: "Channel Two", channelType: "facebook", workspaceId: "workspace-1" },
  ],
  generate: vi.fn().mockResolvedValue({}),
};

describe("ReportBuilder channel selection", () => {
  it("keeps an unchecked channel available and submits only checked channel IDs", () => {
    render(<ReportBuilder {...props} />);

    const channelOne = screen.getByTestId("report-channel-channel-1");
    const checkbox = channelOne.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox?.checked).toBe(true);
    expect(channelOne.querySelector('input[name="channelIds"]')).not.toBeNull();

    fireEvent.click(checkbox!);
    expect(screen.getByTestId("report-channel-channel-1")).toBeInTheDocument();
    expect(checkbox?.checked).toBe(false);
    expect(channelOne.querySelector('input[name="channelIds"]')).toBeNull();

    fireEvent.click(checkbox!);
    expect(checkbox?.checked).toBe(true);
    expect(channelOne.querySelector('input[name="channelIds"]')).not.toBeNull();

    fireEvent.click(checkbox!);
    const secondChannel = screen
      .getByTestId("report-channel-channel-2")
      .querySelector<HTMLInputElement>('input[type="checkbox"]');
    fireEvent.click(secondChannel!);
    expect(screen.getByRole("button", { name: "reports.generateCta" })).toBeDisabled();
  });

  it("removes channels from submission when their workspace is deselected", () => {
    render(<ReportBuilder {...props} />);
    const workspace = screen.getByTestId("report-workspace-workspace-1");
    const checkbox = workspace.querySelector<HTMLInputElement>('input[type="checkbox"]');

    fireEvent.click(checkbox!);

    expect(screen.queryByTestId("report-channel-channel-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-channel-channel-2")).not.toBeInTheDocument();
    expect(document.querySelectorAll('input[name="channelIds"]')).toHaveLength(0);
  });
});
