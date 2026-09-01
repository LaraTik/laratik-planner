import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";

vi.mock("@/app/(app)/app/account/actions", () => ({
  updateProfileAction: vi.fn(),
}));

const { ProfileForm } = await import("@/app/(app)/app/account/profile-form");

const values = {
  displayName: "Mina",
  name: "Mina Nezam",
  image: "",
  locale: "ar",
};

describe("ProfileForm localization", () => {
  it("renders profile labels from the active client locale", () => {
    render(
      <LocaleProvider locale="ar">
        <ProfileForm values={values} />
      </LocaleProvider>,
    );

    expect(screen.getByText("حفظ الملف الشخصي")).toBeInTheDocument();
    expect(screen.getByLabelText("اللغة")).toBeInTheDocument();
  });
});
