import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth/config";
import { resolveActiveLocale } from "@/lib/i18n/resolve-active-locale";
import { PublicLocaleSwitcher } from "@/app/(landing)/public-locale-switcher";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Noto Sans Arabic — the canonical Arabic face for the
// product. Loaded with weights 400/500/600/700 to cover the
// StudioFlow type scale. `display: "swap"` so the Latin face
// stays painted during the font fetch (no FOIT for the
// landing page). The body element switches to this face
// when the document is `dir="rtl"` (see `globals.css`).
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
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
  return (
    <html
      lang={activeLocale.code}
      dir={activeLocale.dir}
      className={`${inter.variable} ${notoArabic.variable} h-full`}
    >
      <body className="bg-canvas text-fg-primary min-h-full">
        <SessionProvider session={session}>{children}</SessionProvider>
        {/*
          The public locale switcher is mounted at the root so
          it is reachable from any page that has not yet
          committed to a header / sidebar (the landing, the
          sign-in surfaces, the legal pages). Once a workspace
          chrome is in place the switcher moves into the
          account/profile surface and the root instance is
          suppressed (it is a no-op when the user is signed in
          and the workspace chrome renders).
        */}
        <PublicLocaleSwitcher />
        {/*
          Sonner toaster. Mounted once at the root so any client
          component (forms, archive buttons) can call `toast(...)`
          without owning its own host. `richColors` keeps
          success/error/warning visually distinct; `closeButton`
          makes the undo affordance reachable on touch.
        */}
        <Toaster richColors closeButton position="bottom-right" />
      </body>
    </html>
  );
}
