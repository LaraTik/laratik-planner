import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMock = vi.hoisted(() => ({ changeContentOwnerAction: vi.fn() }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions", () => actionMock);
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/i18n/locale-provider";

const { ChangeOwnerDialog } =
  await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/change-owner-dialog");

describe("ChangeOwnerDialog error localization", () => {
  beforeEach(() => {
    actionMock.changeContentOwnerAction.mockReset();
    toastMock.error.mockReset();
  });

  it.each([
    ["en", "This content item is no longer available. Refresh and try again."],
    ["ar", "لم يعد عنصر المحتوى هذا متاحًا. حدّث الصفحة وحاول مرة أخرى."],
  ] as const)("localizes safe owner failures in %s", async (locale, expected) => {
    actionMock.changeContentOwnerAction.mockResolvedValue({ error: "ownerError.not_found" });
    render(
      <LocaleProvider locale={locale}>
        <ChangeOwnerDialog
          workspaceSlug="studio"
          itemId="00000000-0000-4000-8000-000000000005"
          itemTitle="Launch"
          currentOwnerId="00000000-0000-4000-8000-000000000006"
          ownerOptions={[
            { id: "00000000-0000-4000-8000-000000000006", label: "Current owner" },
            { id: "00000000-0000-4000-8000-000000000007", label: "New owner" },
          ]}
          open
          onOpenChange={vi.fn()}
        />
      </LocaleProvider>,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "00000000-0000-4000-8000-000000000007" },
    });
    fireEvent.click(screen.getByTestId("change-owner-submit"));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        locale === "ar" ? "تعذّر تغيير المالك" : "Could not change the owner",
        { description: expected },
      ),
    );
  });
});
