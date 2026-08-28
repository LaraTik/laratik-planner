import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsSetupChecklist } from "@/app/(app)/app/w/[slug]/settings/_components/settings-setup-checklist";

/**
 * SettingsSetupChecklist — the "what still needs configuring"
 * card on the settings overview. The component renders nothing
 * when every item is configured (no onboarding noise for a
 * fully-configured workspace); otherwise it shows a per-item
 * row with a configured/unconfigured indicator, a progress
 * count, and per-row jumps to the matching per-section page.
 */
const sampleItems = [
  {
    id: "lifecycle",
    label: "Pick a workspace timezone",
    blurb: "Timezone set to Europe/Vienna.",
    href: "/app/w/acme/settings/lifecycle",
    configured: true,
  },
  {
    id: "monthly-target",
    label: "Set a monthly content target",
    blurb: "Planning target: 24 posts / month.",
    href: "/app/w/acme/settings/lifecycle",
    configured: true,
  },
  {
    id: "lead-times",
    label: "Tune the lead-time buffers",
    blurb: "Current cycle: 18 business days.",
    href: "/app/w/acme/settings/lead-times",
    configured: false,
  },
  {
    id: "defaults",
    label: "Set default assignees",
    blurb: "0 of 4 roles have a default assignee.",
    href: "/app/w/acme/settings/defaults",
    configured: false,
  },
  {
    id: "approvals",
    label: "Pick an approval mode",
    blurb: "Current: Internal approval only.",
    href: "/app/w/acme/settings/approvals",
    configured: true,
  },
];

describe("SettingsSetupChecklist", () => {
  it("renders nothing when every item is configured (no onboarding noise)", () => {
    const { container } = render(
      <SettingsSetupChecklist items={sampleItems.map((i) => ({ ...i, configured: true }))} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the progress count and every unconfigured item", () => {
    render(<SettingsSetupChecklist items={sampleItems} />);
    expect(screen.getByTestId("settings-setup-checklist")).toBeInTheDocument();
    expect(screen.getByTestId("settings-setup-checklist-progress")).toHaveTextContent(
      "3 of 5 sections configured",
    );
  });

  it("renders one row per item with the matching label + a link to the per-section page", () => {
    render(<SettingsSetupChecklist items={sampleItems} />);
    for (const item of sampleItems) {
      const row = screen.getByTestId(`settings-setup-checklist-item-${item.id}`);
      expect(row).toBeInTheDocument();
      expect(row).toHaveTextContent(item.label);
      expect(row.getAttribute("href")).toBe(item.href);
    }
  });
});
