import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, KeyRound, MessagesSquare, Workflow } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth/config";
import { firstAgencyForBootstrap } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";

export const metadata = {
  title: "laratik-planner",
  description:
    "Social media planning, design, and approvals for one agency. Self-hosted Next.js + Drizzle + Postgres on the LaraTik VPS.",
};

/**
 * Public product entry point. Returning users skip this surface and go directly
 * to the app. Public account creation remains disabled; the one-time setup CTA
 * is shown only while no agency exists and routes through identity verification.
 *
 * All user-visible copy is sourced from the message catalog
 * (`src/messages/{en,ar}/common.json` → `auth.landing`) so the
 * same JSX renders in English or Arabic. The active locale is
 * resolved once via `tForActive()` — see ADR 0009 for the
 * precedence chain.
 */
export default async function HomePage() {
  const { t } = await tForActive();
  const session = await auth();
  if (session?.user?.id) {
    redirect("/app");
  }

  const isConfigured = !!(await firstAgencyForBootstrap());
  const entryHref = isConfigured ? "/signin" : "/signin?callbackUrl=%2Fsetup&method=magic";
  const entryLabel = isConfigured ? t("auth.landing.entrySignIn") : t("auth.landing.entrySetup");
  const note = isConfigured ? t("auth.landing.invitationNote") : t("auth.landing.setupNote");

  return (
    <main
      className="bg-canvas relative isolate flex min-h-screen overflow-hidden px-5 py-10 sm:px-8 sm:py-16"
      data-testid="landing-page"
    >
      <div
        aria-hidden="true"
        className="bg-primary-subtle absolute start-1/2 top-[-12rem] -z-10 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full blur-3xl"
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col justify-center gap-10">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex items-center gap-2.5" aria-label={t("auth.productName")}>
            <span className="bg-primary flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] text-base font-bold text-white">
              S
            </span>
            <span className="text-title-card text-fg-primary font-semibold">
              {t("auth.productName")}
            </span>
          </div>
          <p className="border-primary/20 bg-primary-subtle text-label text-primary rounded-full border px-3 py-1 font-medium">
            {t("auth.landing.tagline")}
          </p>
          <div className="max-w-2xl space-y-3">
            <h1 className="text-fg-primary text-4xl font-semibold tracking-tight sm:text-5xl">
              {t("auth.landing.headline")}
            </h1>
            <p className="text-body text-fg-secondary mx-auto max-w-prose sm:text-base">
              {t("auth.landing.subhead")}
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <Button asChild size="lg" className="min-w-52">
              <Link href={entryHref}>
                {entryLabel}
                <DirAwareArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <p className="text-label text-fg-muted inline-flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              {note}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            icon={<CalendarDays className="h-5 w-5" />}
            title={t("auth.landing.featureMonthlyTitle")}
            text={t("auth.landing.featureMonthlyText")}
          />
          <Feature
            icon={<Workflow className="h-5 w-5" />}
            title={t("auth.landing.featureWorkflowTitle")}
            text={t("auth.landing.featureWorkflowText")}
          />
          <Feature
            icon={<MessagesSquare className="h-5 w-5" />}
            title={t("auth.landing.featureReviewTitle")}
            text={t("auth.landing.featureReviewText")}
          />
          <Feature
            icon={<CheckCircle2 className="h-5 w-5" />}
            title={t("auth.landing.featurePublishTitle")}
            text={t("auth.landing.featurePublishText")}
          />
        </div>
      </div>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card>
      <div className="text-primary">{icon}</div>
      <h2 className="text-title-card text-fg-primary mt-3 font-semibold">{title}</h2>
      <p className="text-body text-fg-secondary mt-1">{text}</p>
    </Card>
  );
}
