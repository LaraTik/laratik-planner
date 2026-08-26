import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionCard } from "@/components/workspace/section-card";
import { SectionEmptyState } from "@/components/workspace/section-empty-state";
import { ImageIcon } from "lucide-react";

describe("SectionCard", () => {
  it("renders the title and the count badge", () => {
    render(
      <SectionCard id="logo" title="Logos" count={3}>
        body
      </SectionCard>,
    );
    expect(screen.getByText("Logos")).toBeInTheDocument();
    expect(screen.getByTestId("brand-kit-section-logo-count")).toHaveTextContent("3");
  });

  it("hides the count badge when count is undefined", () => {
    render(
      <SectionCard id="recent" title="Activity">
        body
      </SectionCard>,
    );
    expect(screen.queryByTestId("brand-kit-section-recent-count")).toBeNull();
  });

  it("renders the count in muted style when countMuted is true", () => {
    render(
      <SectionCard id="logo" title="Logos" count={3} countMuted>
        body
      </SectionCard>,
    );
    const badge = screen.getByTestId("brand-kit-section-logo-count");
    expect(badge.className).toContain("opacity-60");
  });

  it("sets scroll-mt-20 so the sticky tab strip never covers the heading", () => {
    render(
      <SectionCard id="logo" title="Logos">
        body
      </SectionCard>,
    );
    const card = document.getElementById("logo");
    expect(card?.className).toContain("scroll-mt-20");
  });

  it("renders manager actions when not in preview mode", () => {
    render(
      <SectionCard id="logo" title="Logos" managerActions={<button>Add</button>}>
        body
      </SectionCard>,
    );
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("hides manager actions in preview mode", () => {
    render(
      <SectionCard id="logo" title="Logos" previewMode managerActions={<button>Add</button>}>
        body
      </SectionCard>,
    );
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
  });

  it("applies lg:col-span-12 when fullWidth is true", () => {
    render(
      <SectionCard id="overview" title="Overview" fullWidth>
        body
      </SectionCard>,
    );
    const card = document.getElementById("overview");
    expect(card?.className).toContain("lg:col-span-12");
  });
});

describe("SectionEmptyState", () => {
  it("renders the icon, title, and description", () => {
    render(
      <SectionEmptyState
        icon={ImageIcon}
        title="No logos yet"
        description="Upload a file to start."
      />,
    );
    expect(screen.getByText("No logos yet")).toBeInTheDocument();
    expect(screen.getByText(/upload a file to start/i)).toBeInTheDocument();
  });

  it("renders the optional CTA", () => {
    render(
      <SectionEmptyState
        icon={ImageIcon}
        title="No logos yet"
        description="Upload a file to start."
        action={<button>Add logo</button>}
      />,
    );
    expect(screen.getByRole("button", { name: /add logo/i })).toBeInTheDocument();
  });

  it("renders the compact variant without the dashed border", () => {
    const { container } = render(
      <SectionEmptyState
        icon={ImageIcon}
        title="No logos"
        description="desc"
        compact
        testId="empty"
      />,
    );
    const root = container.querySelector('[data-testid="empty"]');
    expect(root?.className).toContain("flex");
    expect(root?.className).not.toContain("rounded-[var(--radius-card)]");
  });

  it("renders the data-testid on the standard variant", () => {
    const { container } = render(
      <SectionEmptyState icon={ImageIcon} title="t" description="d" testId="empty" />,
    );
    expect(container.querySelector('[data-testid="empty"]')).not.toBeNull();
  });
});
