import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { FileText, AlertTriangle, CheckCircle, X } from "lucide-react";

describe("KpiTile", () => {
  it("renders the label, value, and the icon", () => {
    render(
      <KpiTile
        icon={<FileText data-testid="icon" aria-hidden="true" />}
        label="Total ideas"
        value={42}
      />,
    );
    expect(screen.getByText("Total ideas")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders the label in uppercase tracking style", () => {
    render(<KpiTile icon={<FileText aria-hidden="true" />} label="Active users" value={3} />);
    const label = screen.getByText("Active users");
    expect(label.className).toContain("uppercase");
    expect(label.className).toContain("tracking-wider");
  });

  it("uses neutral border + muted icon when tone is default", () => {
    render(<KpiTile icon={<FileText aria-hidden="true" />} label="x" value={1} tone="default" />);
    const tile = screen.getByText("x").parentElement?.parentElement;
    expect(tile?.className).not.toContain("border-l-success");
    expect(tile?.className).not.toContain("border-l-warning");
    expect(tile?.className).not.toContain("border-l-danger");
  });

  it("applies border-l-success + green icon when tone is success", () => {
    render(
      <KpiTile
        icon={<CheckCircle data-testid="icon" aria-hidden="true" />}
        label="Active"
        value={10}
        tone="success"
      />,
    );
    const tile = screen.getByText("Active").parentElement?.parentElement;
    expect(tile?.className).toContain("border-l-success");
    const iconWrap = screen.getByTestId("icon").parentElement;
    expect(iconWrap?.className).toContain("text-success");
  });

  it("applies border-l-warning + warning icon when tone is warning", () => {
    render(
      <KpiTile
        icon={<AlertTriangle data-testid="icon" aria-hidden="true" />}
        label="Pending"
        value={2}
        tone="warning"
      />,
    );
    const tile = screen.getByText("Pending").parentElement?.parentElement;
    expect(tile?.className).toContain("border-l-warning");
    const iconWrap = screen.getByTestId("icon").parentElement;
    expect(iconWrap?.className).toContain("text-warning");
  });

  it("applies border-l-danger + danger icon when tone is danger", () => {
    render(
      <KpiTile
        icon={<X data-testid="icon" aria-hidden="true" />}
        label="Failed"
        value={0}
        tone="danger"
      />,
    );
    const tile = screen.getByText("Failed").parentElement?.parentElement;
    expect(tile?.className).toContain("border-l-danger");
    const iconWrap = screen.getByTestId("icon").parentElement;
    expect(iconWrap?.className).toContain("text-danger");
  });

  it("forwards data-testid for E2E hooks", () => {
    render(
      <KpiTile
        icon={<FileText aria-hidden="true" />}
        label="x"
        value={1}
        data-testid="custom-tile"
      />,
    );
    expect(screen.getByTestId("custom-tile")).toBeInTheDocument();
  });
});
