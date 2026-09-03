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
});
