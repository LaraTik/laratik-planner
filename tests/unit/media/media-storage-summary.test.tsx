import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { MediaStorageSummary } from "@/components/media/media-storage-summary";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

describe("MediaStorageSummary", () => {
  it("renders a single muted one-liner summarising the storage destination", () => {
    render(
      <LocaleProvider locale="en">
        <MediaStorageSummary
          mode="agency_owned"
          bucket="laratik-planner"
          keyPrefix="agencies/5694a565-c198-4a1d-add7-fe9c8bc056fc"
        />
      </LocaleProvider>,
    );
    const summary = screen.getByTestId("media-storage-summary");
    expect(summary).toHaveTextContent("Storage");
    expect(summary).toHaveTextContent("Agency-owned R2");
    expect(summary).toHaveTextContent("laratik-planner");
    expect(summary).toHaveTextContent("agencies/5694a565-c198-4a1d-add7-fe9c8bc056fc");
  });

  it("opens a popover with the full breakdown when the info trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <MediaStorageSummary
          mode="agency_owned"
          bucket="laratik-planner"
          keyPrefix="agencies/5694a565-c198-4a1d-add7-fe9c8bc056fc"
        />
      </LocaleProvider>,
    );
    await act(async () => {
      await user.click(screen.getByTestId("media-storage-summary-info"));
    });
    // The popover body should contain all three labelled rows that
    // used to live in the heavy card, plus the file-naming rule.
    expect(screen.getByText("Where this media is stored")).toBeInTheDocument();
    expect(screen.getByText("Storage mode")).toBeInTheDocument();
    expect(screen.getByText("Destination bucket")).toBeInTheDocument();
    expect(screen.getByText("Agency prefix")).toBeInTheDocument();
    expect(
      screen.getByText(/File naming: the server generates an immutable ID-based object key/),
    ).toBeInTheDocument();
  });

  it("falls back to 'Setup required' when the bucket is null", () => {
    render(
      <LocaleProvider locale="en">
        <MediaStorageSummary
          mode="managed"
          bucket={null}
          keyPrefix="agencies/5694a565-c198-4a1d-add7-fe9c8bc056fc"
        />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("media-storage-summary")).toHaveTextContent("Setup required");
  });
});
