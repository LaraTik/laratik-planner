import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "@/components/workspace/page-header";

describe("PageHeader", () => {
  it("keeps dense actions below the title until the requested breakpoint", () => {
    render(
      <PageHeader
        title="Planning"
        actionBreakpoint="lg"
        action={<button type="button">Quick create</button>}
      />,
    );

    const header = screen.getByRole("banner");
    const action = screen.getByRole("button", { name: "Quick create" }).parentElement;

    expect(header).toHaveClass("flex-col", "lg:flex-row");
    expect(header).not.toHaveClass("sm:flex-row");
    expect(action).toHaveClass("w-full", "lg:w-auto");
  });

  it("lets titles and descriptions follow the content direction", () => {
    render(<PageHeader title="عنوان عربي" description="وصف عربي" />);

    expect(screen.getByRole("heading", { name: "عنوان عربي" })).toHaveAttribute("dir", "auto");
    expect(screen.getByText("وصف عربي")).toHaveAttribute("dir", "auto");
  });

  it("allows semantic block content such as a breadcrumb in the description", () => {
    const { container } = render(
      <PageHeader
        title="Media"
        description={<nav aria-label="Folder path">Workspace / Folder</nav>}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Folder path" })).toBeInTheDocument();
    expect(container.querySelector("p nav")).toBeNull();
  });
});
