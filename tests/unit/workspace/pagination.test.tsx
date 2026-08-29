import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Pagination } from "@/components/workspace/pagination";

function buildHref(page: number) {
  return `?page=${page}`;
}

describe("Pagination", () => {
  it("renders the showing X–Y of Z summary when totalCount + pageSize are provided", () => {
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        buildHref={buildHref}
        totalCount={87}
        pageSize={20}
      />,
    );
    const summary = screen.getByTestId("pagination-summary");
    // Page 2 of 20-per-page: items 21-40 of 87.
    expect(summary.textContent).toBe("Showing 21–40 of 87");
  });

  it("clamps the current page to totalPages when currentPage is too large", () => {
    render(
      <Pagination
        currentPage={12}
        totalPages={3}
        buildHref={buildHref}
        totalCount={45}
        pageSize={20}
      />,
    );
    // Clamped to 3, so the showing range is 41-45 of 45.
    const summary = screen.getByTestId("pagination-summary");
    expect(summary.textContent).toBe("Showing 41–45 of 45");
  });

  it("renders a disabled Previous / First when on the first page", () => {
    render(<Pagination currentPage={1} totalPages={5} buildHref={buildHref} />);
    const first = screen.getByTestId("pagination-first-page");
    const previous = screen.getByTestId("pagination-previous-page");
    expect(first.tagName).not.toBe("A");
    expect(previous.tagName).not.toBe("A");
  });

  it("renders a disabled Next / Last when on the last page", () => {
    render(<Pagination currentPage={5} totalPages={5} buildHref={buildHref} />);
    const next = screen.getByTestId("pagination-next-page");
    const last = screen.getByTestId("pagination-last-page");
    expect(next.tagName).not.toBe("A");
    expect(last.tagName).not.toBe("A");
  });

  it("renders an aria-current='page' on the active page number", () => {
    render(<Pagination currentPage={3} totalPages={10} buildHref={buildHref} />);
    const active = screen.getByLabelText("Page 3");
    expect(active).toHaveAttribute("aria-current", "page");
    const other = screen.getByLabelText("Page 2");
    expect(other).not.toHaveAttribute("aria-current");
  });

  it("builds a href for every non-active page number", () => {
    render(<Pagination currentPage={3} totalPages={3} buildHref={buildHref} />);
    // On the last page, all other page links should be navigable.
    for (const p of [1, 2]) {
      const link = screen.getByLabelText(`Page ${p}`);
      expect(link).toHaveAttribute("href", `?page=${p}`);
    }
  });

  it("uses an ellipsis for the truncated range on a 12-page dataset", () => {
    render(<Pagination currentPage={6} totalPages={12} buildHref={buildHref} />);
    // The nav element wraps the page links; the ellipses are the
    // two `…` characters that flank the sliding window.
    const nav = screen.getByTestId("pagination");
    expect(within(nav).getAllByText("…")).toHaveLength(2);
    // First and last page are still rendered.
    expect(screen.getByLabelText("Page 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Page 12")).toBeInTheDocument();
    // Window is ±1 around current — so 5, 6, 7.
    expect(screen.getByLabelText("Page 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Page 6")).toBeInTheDocument();
    expect(screen.getByLabelText("Page 7")).toBeInTheDocument();
    // Pages outside the window are not in the DOM.
    expect(screen.queryByLabelText("Page 4")).toBeNull();
    expect(screen.queryByLabelText("Page 8")).toBeNull();
  });

  it("renders an empty nav when totalPages is 1 and no total count is given", () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} buildHref={buildHref} />,
    );
    // Component returns null in this case — the parent will fall
    // back to its own empty state.
    expect(container.firstChild).toBeNull();
  });

  it("renders a single-page summary when total is 0 but totalPages is 1", () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} buildHref={buildHref} totalCount={0} />,
    );
    // Even with 0 items, totalPages is at least 1 by the math
    // floor in the component, so the nav is rendered.
    expect(container.firstChild).not.toBeNull();
    const summary = screen.getByTestId("pagination-summary");
    expect(summary.textContent).toBe("No results");
  });
});
