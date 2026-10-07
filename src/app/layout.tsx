import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth/config";
import { resolveActiveLocale } from "@/lib/i18n/resolve-active-locale";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PublicLocaleSwitcher } from "@/app/(landing)/public-locale-switcher";
import { explicitThemeAttribute } from "@/lib/theme/preferences";
import { getThemePreference } from "@/lib/theme/server";
import "./globals.css";

// Both faces are VENDORED (see src/app/fonts/README.md). `next/font/google`
// fetched them from fonts.googleapis.com at BUILD time, which made the Docker
// build depend on outbound network access to Google — it failed there on
// 2026-10-07 with a `nextFontGoogleFontLoader` webpack error and blocked an
// unrelated deploy. These are the same faces and the same subsets, served
// locally: variable weight axis, latin for Inter, arabic for Noto.
const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [{ path: "./fonts/inter-latin.woff2", weight: "100 900", style: "normal" }],
  fallback: ["system-ui", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

// Noto Sans Arabic — the canonical Arabic face for the
// product. Covers the StudioFlow type scale. `display: "swap"` so the Latin
// face stays painted during the font load (no FOIT on the landing page). The
// body element switches to this face when the document is `dir="rtl"`
// (see `globals.css`).
const notoArabic = localFont({
  variable: "--font-noto-arabic",
  display: "swap",
  src: [{ path: "./fonts/noto-sans-arabic.woff2", weight: "100 900", style: "normal" }],
  fallback: ["system-ui", "Segoe UI", "Tahoma", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "laratik-planner",
    template: "%s · laratik-planner",
  },
  description:
    "Social media planning, design, and approvals for one agency. Self-hosted on the LaraTik VPS.",
  applicationName: "laratik-planner",
  robots: { index: false, follow: false }, // private app, never index
};

export const viewport: Viewport = {
  themeColor: "#4F46E5",
  width: "device-width",
  initialScale: 1,
};

// The document theme is resolved from the signed-in user on every request.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve the session server-side so the client `SessionProvider`
  // has the initial value without a client-side fetch on mount.
  // Without this, every client component that calls `useSession()`
  // (e.g. `set-password-form.tsx` calling `update({ mustChangePassword: false })`)
  // would throw "useSession must be used within a SessionProvider"
  // and Next.js would surface a generic "Something went wrong"
  // page from the global-error boundary.
  const session = await auth();
  // Resolve the active interface locale once per request so the
  // document `lang` / `dir` attributes reflect the user's
  // working locale. Precedence is locked in ADR 0009:
  // user profile → public cookie → English fallback. The
  // agency locale is intentionally NOT in this chain — it is
  // the *content* default, resolved by `resolveContentLocale`.
  // Unknown / missing values fall back to English / LTR — never
  // throws.
  const activeLocale = await resolveActiveLocale();
  const themePreference = session?.user?.id ? await getThemePreference(session.user.id) : "system";
  return (
    <html
      lang={activeLocale.code}
      dir={activeLocale.dir}
      {...(explicitThemeAttribute(themePreference)
        ? { "data-theme": explicitThemeAttribute(themePreference) }
        : {})}
      className={`${inter.variable} ${notoArabic.variable} h-full`}
    >
      <body className="bg-canvas text-fg-primary min-h-full">
        <LocaleProvider locale={activeLocale.code}>
          <SessionProvider session={session}>
            {children}
            {!session?.user ? <PublicLocaleSwitcher locale={activeLocale.code} /> : null}
          </SessionProvider>
          <Toaster richColors closeButton position="bottom-right" />
        </LocaleProvider>
      </body>
    </html>
  );
}
