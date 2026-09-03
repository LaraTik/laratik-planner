import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { ArchiveWithUndo } from "@/app/(app)/app/w/[slug]/brand-kit/archive-with-undo";

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

describe("ArchiveWithUndo localization", () => {
  it("uses Arabic labels and toast copy from the active locale", async () => {
    const archiveAction = vi.fn(async () => undefined);
    const restoreAction = vi.fn(async () => undefined);

    render(
      <LocaleProvider locale="ar">
        <ArchiveWithUndo
          slug="studio"
          id="color-1"
          label="color"
          name="Ocean blue"
          archiveAction={archiveAction}
          restoreAction={restoreAction}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole("button")).toHaveAccessibleName("أرشفة اللون Ocean blue");
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(archiveAction).toHaveBeenCalledWith("studio", "color-1"));
    expect(toastMock.success).toHaveBeenCalledWith(
      "تمت أرشفة اللون: Ocean blue",
      expect.objectContaining({
        description: "تم إخفاؤه من القسم. اضغط على «تراجع» لإعادته.",
        action: expect.objectContaining({ label: "تراجع" }),
      }),
    );
  });
});
