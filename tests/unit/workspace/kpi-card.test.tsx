import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCard } from "@/components/workspace/kpi-card";
import { AlertTriangle, FileText } from "lucide-react";

describe("KpiCard", () => {
  it("renders the label, value, and a link wrapping the whole card", () => {
    render(
      <KpiCard
        label="Total ideas"
        value={24}
        icon={<FileText data-testid="icon" className="h-4 w-4" aria-hidden="true" />}
        href="/app/w/acme/planning"
      />,
    );
    expect(screen.getByText("Total ideas")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/app/w/acme/planning");
  });

  it("renders the icon (so the user can scan the tile by shape)", () => {
    render(
      <KpiCard
        label="At risk"
        value={3}
        icon={<AlertTriangle data-testid="icon" aria-hidden="true" />}
        href="/app/w/acme/planning?risk=at_risk"
        danger
      />,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("uses the primary text color by default and the danger text color when the danger flag is set", () => {
    const { rerender } = render(
      <KpiCard label="Total" value={10} icon={<FileText aria-hidden="true" />} href="/x" />,
    );
    const iconWrap = screen.getByRole("link").firstElementChild as HTMLElement;
    expect(iconWrap.className).toContain("text-primary");
    expect(iconWrap.className).not.toContain("text-danger");

    rerender(
      <KpiCard label="At risk" value={3} icon={<FileText aria-hidden="true" />} href="/x" danger />,
    );
    const iconWrapDanger = screen.getByRole("link").firstElementChild as HTMLElement;
    expect(iconWrapDanger.className).toContain("text-danger");
    expect(iconWrapDanger.className).not.toContain("text-primary");
  });

  it("exposes a focus-visible ring so keyboard users see where focus is", () => {
    render(<KpiCard label="x" value={1} icon={<FileText aria-hidden="true" />} href="/x" />);
    const link = screen.getByRole("link");
    expect(link.className).toContain("focus-visible:ring-focus-ring");
  });
});
