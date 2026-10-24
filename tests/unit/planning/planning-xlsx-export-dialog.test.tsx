import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/components/i18n/locale-provider";

import { PlanningXlsxExportDialog } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/planning-xlsx-export-dialog";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function makeResponse(status: number, body = "workbook"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({
      "content-type": XLSX_TYPE,
      "content-disposition": 'attachment; filename="planning-studio-2026-09-01-2026-09-30.xlsx"',
    }),
    blob: async () => new Blob([body], { type: XLSX_TYPE }),
  } as Response;
}

function renderDialog(locale: "en" | "ar" = "en") {
  return render(
    <LocaleProvider locale={locale}>
      <PlanningXlsxExportDialog
        agencySlug="lara"
        workspaceSlug="studio"
        month="2026-09"
        timezone="Europe/Berlin"
        activeFilters={[]}
        currentFilters={[]}
      />
    </LocaleProvider>,
  );
}

describe("PlanningXlsxExportDialog download", () => {
  const fetchMock = vi.fn();
  const createObjectUrl = vi.fn(() => "blob:planning-export");
  const revokeObjectUrl = vi.fn();
  let downloadedFilename: string | null = null;
  const clickLink = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedFilename = this.download;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
    downloadedFilename = null;
    clickLink.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
  });

  it("requests the XLSX and starts a named download before closing the dialog", async () => {
    fetchMock.mockResolvedValue(makeResponse(200));
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("planning-export-xlsx-trigger"));
    await user.click(screen.getByTestId("planning-export-xlsx-submit"));

    await waitFor(() => expect(clickLink).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/export/planning-xlsx?agency=lara&slug=studio&month=2026-09&range=view_month&scope=current_filters",
      ),
      expect.objectContaining({ method: "GET" }),
    );
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(downloadedFilename).toBe("planning-studio-2026-09-01-2026-09-30.xlsx");
    await waitFor(() => expect(screen.queryByTestId("planning-export-xlsx-dialog")).toBeNull());
  });

  it.each([
    ["en", "This range includes more than 25,000 items."],
    ["ar", "يتضمن هذا النطاق أكثر من 25,000 عنصر."],
  ] as const)(
    "shows a localized limit error in %s without closing the dialog",
    async (locale, message) => {
      fetchMock.mockResolvedValue(makeResponse(413));
      const user = userEvent.setup();
      renderDialog(locale);
      await user.click(screen.getByTestId("planning-export-xlsx-trigger"));
      await user.click(screen.getByTestId("planning-export-xlsx-submit"));

      expect(await screen.findByTestId("planning-export-xlsx-error")).toHaveTextContent(message);
      expect(screen.getByTestId("planning-export-xlsx-dialog")).toBeInTheDocument();
      expect(clickLink).not.toHaveBeenCalled();
    },
  );
});
