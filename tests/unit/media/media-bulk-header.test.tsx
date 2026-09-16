import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaBulkHeader } from "@/components/media/media-bulk-header";
import { MediaSelectionProvider } from "@/lib/media/selection-store";

describe("MediaBulkHeader", () => {
  it("hides entirely when canWrite=false", () => {
    const { container } = render(
      <MediaSelectionProvider canWrite={false}>
        <MediaBulkHeader pageAssetIds={["a", "b"]} total={2} pageSize={48} canWrite={false} />
      </MediaSelectionProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders an unchecked page checkbox when nothing is selected", () => {
    render(
      <MediaSelectionProvider canWrite>
        <MediaBulkHeader pageAssetIds={["a", "b", "c"]} total={3} pageSize={48} canWrite />
      </MediaSelectionProvider>,
    );
    const checkbox = screen.getByTestId("media-bulk-header-page-checkbox");
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByText("0/3")).toBeInTheDocument();
  });

  it("toggles the page checkbox to checked after a click", async () => {
    const user = userEvent.setup();
    render(
      <MediaSelectionProvider canWrite>
        <MediaBulkHeader pageAssetIds={["a", "b"]} total={2} pageSize={48} canWrite />
      </MediaSelectionProvider>,
    );
    const checkbox = screen.getByTestId("media-bulk-header-page-checkbox");
    await act(async () => {
      await user.click(checkbox);
    });
    expect(screen.getByTestId("media-bulk-header-page-checkbox")).toHaveAttribute(
      "data-state",
      "checked",
    );
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("shows 'Select all matching' only when total > pageSize", () => {
    const { rerender } = render(
      <MediaSelectionProvider canWrite>
        <MediaBulkHeader pageAssetIds={["a"]} total={1} pageSize={48} canWrite />
      </MediaSelectionProvider>,
    );
    expect(screen.queryByTestId("media-bulk-header-select-all-matching")).toBeNull();

    rerender(
      <MediaSelectionProvider canWrite>
        <MediaBulkHeader
          pageAssetIds={Array.from({ length: 48 }, (_, i) => `id-${i}`)}
          total={120}
          pageSize={48}
          canWrite
        />
      </MediaSelectionProvider>,
    );
    expect(screen.getByTestId("media-bulk-header-select-all-matching")).toBeInTheDocument();
  });

  it("disables 'Select all matching' when total > MAX_BULK_SELECTION", () => {
    render(
      <MediaSelectionProvider canWrite>
        <MediaBulkHeader
          pageAssetIds={Array.from({ length: 48 }, (_, i) => `id-${i}`)}
          total={501}
          pageSize={48}
          canWrite
        />
      </MediaSelectionProvider>,
    );
    expect(screen.getByTestId("media-bulk-header-select-all-matching")).toBeDisabled();
  });
});
