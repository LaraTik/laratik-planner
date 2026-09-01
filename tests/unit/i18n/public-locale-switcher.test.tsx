import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";

vi.mock("@/app/(landing)/public-locale-actions", () => ({
  setPublicLocaleAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { PublicLocaleSwitcher } = await import("@/app/(landing)/public-locale-switcher");

describe("PublicLocaleSwitcher", () => {
  it("uses the server-resolved locale for its selected state", () => {
    render(
      <LocaleProvider locale="ar">
        <PublicLocaleSwitcher locale="ar" />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("public-locale-switcher-ar")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("public-locale-switcher-en")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
