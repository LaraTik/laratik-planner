import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth/config";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { agencies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveLocale } from "@/lib/i18n/locales";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
  // Resolve the active agency locale once per request so the
  // document `lang` / `dir` attributes reflect the user's
  // working locale. Unknown / missing agency falls back to
  // English / LTR — never throws. The (app) workspace
  // layouts may also set per-page locale; the root value
  // is the safe default for the marketing / signin pages
  // that sit above the workspace context.
  const actor = session?.user?.id ? await currentActor() : null;
  const agencyId = actor ? ((await resolveActiveAgencyContext({ actor }))?.agencyId ?? null) : null;
  const [agencyRow] = agencyId
    ? await db
        .select({ locale: agencies.locale })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1)
    : [];
  const activeLocale = resolveLocale(agencyRow?.locale);
  return (
    <html lang={activeLocale.code} dir={activeLocale.dir} className={`${inter.variable} h-full`}>
      <body className="bg-canvas text-fg-primary min-h-full">
        <SessionProvider session={session}>{children}</SessionProvider>
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
