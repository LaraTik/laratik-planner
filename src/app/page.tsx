import Link from "next/link";
import { CalendarDays, CheckCircle2, MessagesSquare, Workflow } from "lucide-react";
import { Card } from "@/components/ui/card";

export const metadata = {
  title: "laratik-planner",
  description:
    "Social media planning, design, and approvals for one agency. Self-hosted Next.js + Drizzle + Postgres on the LaraTik VPS.",
};

/**
 * Public product entry point. Account creation remains intentionally disabled;
 * invited users sign in passwordlessly and the first admin uses /setup.
 */
export default function HomePage() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-10 px-6 py-16"
      data-testid="landing-page"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="border-primary/20 bg-primary-subtle text-label text-primary rounded-full border px-3 py-1">
          Social content operations, in one place
        </p>
        <h1 className="text-title-page text-fg-primary font-semibold tracking-tight">
          laratik-planner
        </h1>
        <p className="text-body text-fg-secondary max-w-prose">
          Plan every brand, coordinate design and review, and publish with a clear audit trail. One
          workspace keeps each brand focused and easy to manage.
        </p>
      </div>

      <div className="flex justify-center gap-3">
        <Link
          href="/signin"
          className="bg-primary hover:bg-primary-hover text-body rounded-[var(--radius-control)] px-5 py-3 font-semibold text-white"
        >
          Sign in
        </Link>
        <Link
          href="/setup"
          className="border-border bg-surface text-body text-fg-primary hover:bg-surface-subtle rounded-[var(--radius-control)] border px-5 py-3 font-semibold"
        >
          First admin setup
        </Link>
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
