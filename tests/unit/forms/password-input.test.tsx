import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PasswordInput } from "@/components/forms/password-input";
import { LocaleProvider } from "@/components/i18n/locale-provider";

describe("PasswordInput", () => {
  it("uses the translated accessible label for the hidden state", () => {
    render(
      <LocaleProvider locale="ar">
        <PasswordInput revealed={false} onToggleRevealed={vi.fn()} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("button", { name: "إظهار كلمة المرور" })).toBeVisible();
  });

  it("updates the translated accessible label when revealed", () => {
    const onToggleRevealed = vi.fn();
    const { rerender } = render(
      <LocaleProvider locale="ar">
        <PasswordInput revealed={false} onToggleRevealed={onToggleRevealed} />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "إظهار كلمة المرور" }));
    expect(onToggleRevealed).toHaveBeenCalledOnce();

    rerender(
      <LocaleProvider locale="ar">
        <PasswordInput revealed onToggleRevealed={onToggleRevealed} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("button", { name: "إخفاء كلمة المرور" })).toBeVisible();
  });
});
