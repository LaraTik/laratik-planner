import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider, useLocaleT } from "@/components/i18n/locale-provider";

function TranslationProbe() {
  const t = useLocaleT();
  return <span>{t("common.save")}</span>;
}

describe("LocaleProvider", () => {
  it("creates the client translator from a serializable locale prop", () => {
    render(
      <LocaleProvider locale="ar">
        <TranslationProbe />
      </LocaleProvider>,
    );

    expect(screen.getByText("حفظ")).toBeInTheDocument();
  });

  it("does not require a translator function to cross the Server/Client boundary", () => {
    render(
      <LocaleProvider locale="en">
        <TranslationProbe />
      </LocaleProvider>,
    );

    expect(screen.getByText("Save")).toBeInTheDocument();
  });
});
