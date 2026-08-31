import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, KeyRound, MessagesSquare, Workflow } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth/config";
import { firstAgencyForBootstrap } from "@/lib/auth/policy";

export const metadata = {
  title: "laratik-planner",
  description:
    "Social media planning, design, and approvals for one agency. Self-hosted Next.js + Drizzle + Postgres on the LaraTik VPS.",
};

/**
 * Public product entry point. Returning users skip this surface and go directly
 * to the app. Public account creation remains disabled; the one-time setup CTA
 * is shown only while no agency exists and routes through identity verification.
 */
export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/app");
  }

  const isConfigured = !!(await firstAgencyForBootstrap());
  const entryHref = isConfigured ? "/signin" : "/signin?callbackUrl=%2Fsetup&method=magic";
  const entryLabel = isConfigured ? "Sign in to StudioFlow" : "Set up StudioFlow";

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
          <div className="flex items-center gap-2.5" aria-label="StudioFlow">
            <span className="bg-primary flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] text-base font-bold text-white">
              S
            </span>
            <span className="text-title-card text-fg-primary font-semibold">StudioFlow</span>
          </div>
          <p className="border-primary/20 bg-primary-subtle text-label text-primary rounded-full border px-3 py-1 font-medium">
            Social content operations, in one place
          </p>
          <div className="max-w-2xl space-y-3">
            <h1 className="text-fg-primary text-4xl font-semibold tracking-tight sm:text-5xl">
              Plan, review, and publish with clarity.
            </h1>
            <p className="text-body text-fg-secondary mx-auto max-w-prose sm:text-base">
              Keep every brand, creative handoff, approval, and publishing record in one focused
              workspace.
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
              {isConfigured
                ? "Invitation-only access"
                : "Administrator identity verification is required"}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            icon={<CalendarDays className="h-5 w-5" />}
            title="Monthly planning"
            text="Lists, boards, and calendars stay aligned."
          />
          <Feature
            icon={<Workflow className="h-5 w-5" />}
            title="Clear workflow"
            text="Every idea always has a next action."
          />
          <Feature
            icon={<MessagesSquare className="h-5 w-5" />}
            title="Review together"
            text="Internal and client feedback stays separated."
          />
          <Feature
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Publish confidently"
            text="Track every selected channel to completion."
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
