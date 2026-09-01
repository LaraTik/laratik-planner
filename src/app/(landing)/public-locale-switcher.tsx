"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";

import { setPublicLocaleAction } from "@/app/(landing)/public-locale-actions";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { SUPPORTED_LOCALES, type LocaleCode } from "@/lib/i18n/locales";

/**
 * Compact, accessible interface-language switcher. Mounted
 * once at the root layout. Renders nothing for authenticated
 * sessions on workspace routes (the workspace chrome owns
 * the language picker through the Account page). Renders a
 * small two-button toggle on public surfaces so the
 * preference can be set before sign-in.
 *
 * The toggle is a real `<button>` (not a `<select>`) because:
 *   - the choice is binary in v1 (en / ar), so a `<select>`
 *     adds a click for no benefit;
 *   - `<button>` is keyboard-navigable by default and needs
 *     no custom ARIA wiring;
 *   - the active state is exposed through `aria-pressed` so
 *     screen readers announce "selected".
 *
 * The current locale is passed from the server-rendered root
 * layout. After a successful switch, the action
 * returns the new locale and the client calls
 * `router.refresh()` so the root layout repaints the
 * `lang` / `dir` / font / page copy without a full reload.
 */
export function PublicLocaleSwitcher({ locale = "en" }: { locale?: LocaleCode }) {
  const router = useRouter();
  const t = useLocaleT();
  const [active, setActive] = React.useState<LocaleCode>(locale);
  const [pending, startTransition] = React.useTransition();

  const switchTo = React.useCallback(
    (code: LocaleCode) => {
      if (code === active) return;
      startTransition(async () => {
        const result = await setPublicLocaleAction({
          locale: code,
          returnTo: window.location.pathname + window.location.search,
        });
        if (result.ok) {
          setActive(code);
          // `refresh` re-runs the root layout so the new
          // <html lang dir> lands on the next paint. We do
          // NOT `pushState` to the new locale because the
          // product is committed to URL stability (no
          // /en / /ar prefixes).
          router.refresh();
        }
      });
    },
    [active, router],
  );

  return (
    <div
      role="group"
      aria-label={t("languageSwitcher.label")}
      data-testid="public-locale-switcher"
      className="border-border bg-surface/95 supports-[backdrop-filter]:bg-surface/80 pointer-events-auto fixed end-3 top-3 z-40 flex items-center gap-1 rounded-full border p-1 shadow-sm backdrop-blur"
    >
      <span className="text-fg-muted px-1.5" aria-hidden="true">
        <Languages className="h-3.5 w-3.5" />
      </span>
      {SUPPORTED_LOCALES.map((l) => {
        const isActive = active === l.code;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => switchTo(l.code)}
            disabled={pending}
            aria-pressed={isActive}
            aria-current={isActive ? "true" : undefined}
            lang={l.code}
            dir={l.dir}
            data-testid={`public-locale-switcher-${l.code}`}
            data-active={isActive ? "true" : "false"}
            className={
              "text-label rounded-full px-2.5 py-1 font-medium transition-colors " +
              (isActive
                ? "bg-primary text-primary-foreground"
                : "text-fg-secondary hover:bg-surface-subtle")
            }
          >
            {l.nativeLabel}
          </button>
        );
      })}
    </div>
  );
}
