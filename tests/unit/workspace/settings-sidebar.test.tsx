import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  SettingsSidebar,
  type SettingsSectionNavItem,
} from "@/components/workspace/settings-sidebar";

// jsdom does not implement scrollIntoView / IntersectionObserver.
// The sidebar is a presentational component — we assert the markup,
// the active-state affordances, the count badge, and the
// description copy without exercising the scroll-spy effect.

const items: SettingsSectionNavItem[] = [
  {
    id: "lifecycle",
    label: "Lifecycle",
    description: "Posts per month",
  },
  {
    id: "lead-times",
    label: "Lead times",
    description: "4 business days",
    count: 4,
  },
  {
    id: "defaults",
    label: "Defaults",
  },
  {
    id: "approvals",
    label: "Approval mode",
    description: "Single step",
  },
];

beforeEach(() => {
  window.location.hash = "";
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("SettingsSidebar", () => {
  it("renders one anchor per section with the correct href", () => {
    render(<SettingsSidebar items={items} ariaLabel="Settings sections" />);
    for (const item of items) {
      const link = screen.getByTestId(`settings-sidebar-link-${item.id}`);
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", `#${item.id}`);
    }
  });

  it("exposes the supplied aria-label on the <nav>", () => {
    render(<SettingsSidebar items={items} ariaLabel="Settings sections" />);
    expect(screen.getByRole("navigation", { name: /settings sections/i })).toBeInTheDocument();
  });

  it("marks the first item as the initial active section when no hash is set", () => {
    render(<SettingsSidebar items={items} ariaLabel="Settings sections" />);
    const first = screen.getByTestId("settings-sidebar-link-lifecycle");
    expect(first).toHaveAttribute("aria-current", "true");
  });

  it("marks the section whose id matches window.location.hash as initially active", () => {
    window.location.hash = "#defaults";
    render(<SettingsSidebar items={items} ariaLabel="Settings sections" />);
    expect(screen.getByTestId("settings-sidebar-link-defaults")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByTestId("settings-sidebar-link-lifecycle")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders the description copy when supplied", () => {
    render(<SettingsSidebar items={items} ariaLabel="Settings sections" />);
    expect(screen.getByText("Posts per month")).toBeInTheDocument();
    expect(screen.getByText("4 business days")).toBeInTheDocument();
    expect(screen.queryByText("Single step")).toBeInTheDocument();
  });

  it("renders the count badge when supplied and skips it otherwise", () => {
    render(<SettingsSidebar items={items} ariaLabel="Settings sections" />);
    // lead-times has count: 4 → badge renders the digit
    const leadTimesLink = screen.getByTestId("settings-sidebar-link-lead-times");
    expect(leadTimesLink).toHaveTextContent("4");
    // lifecycle has no count → no badge
    const lifecycleLink = screen.getByTestId("settings-sidebar-link-lifecycle");
    // The only text inside lifecycle's link is "Lifecycle" + the description.
    expect(lifecycleLink).not.toHaveTextContent(/^[0-9]+$/);
  });

  it("honours the variant prop by tagging the root <nav>", () => {
    render(<SettingsSidebar items={items} ariaLabel="Settings sections" variant="stack" />);
    expect(screen.getByTestId("settings-sidebar")).toHaveAttribute("data-variant", "stack");
  });
});
