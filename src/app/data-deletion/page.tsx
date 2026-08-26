import type { Metadata } from "next";
import Link from "next/link";
import {
  Trash2,
  Clock,
  Mail,
  Phone,
  MapPin,
  UserCog,
  Webhook,
  TimerReset,
  AlertTriangle,
  MailQuestion,
} from "lucide-react";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Data Deletion",
  description:
    "How to request deletion of your personal data from laratik-planner, including the Meta user-data deletion callback flow.",
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = "26 August 2026";
const OPERATOR_LEGAL = "Mohamad Nezam";
const OPERATOR_TRADE = "LaraTik";
const CONTACT_EMAIL = "info@laratik.com";
const CONTACT_PHONE = "+49 179 1594254";
const CONTACT_ADDRESS = "Eltingstraße 7, 45141 Essen, Germany";

const SECTIONS = [
  { id: "what", title: "What this page is for", icon: Trash2 },
  { id: "paths", title: "Two ways to request deletion", icon: UserCog },
  { id: "what-we-delete", title: "What we delete", icon: Trash2 },
  { id: "meta-callback", title: "Meta User Data Deletion callback", icon: Webhook },
  { id: "timeframe", title: "Timeframe", icon: TimerReset },
  { id: "irreversibility", title: "Irreversibility", icon: AlertTriangle },
  { id: "questions", title: "Questions", icon: MailQuestion },
] as const;

export default function DataDeletionPage() {
  return (
    <main className="bg-canvas min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:py-16">
        <Hero />

        <div className="mt-10 grid gap-8 lg:grid-cols-[16rem_1fr]">
          <Toc sections={SECTIONS} />

          <article className="text-body text-fg-secondary min-w-0 space-y-6 leading-relaxed">
            <ControllerCallout />

            <Section id="what" icon={<Trash2 className="h-4 w-4" aria-hidden />}>
              <h2 id="what" className="text-title-section text-fg-primary font-semibold">
                What this page is for
              </h2>
              <p>
                This page explains how to have your personal data deleted from{" "}
                <strong className="text-fg-primary">laratik-planner</strong>. It also serves as the{" "}
                <em>User Data Deletion Instructions</em> page referenced in our Meta (Facebook /
                Instagram) app configuration.
              </p>
            </Section>

            <Section id="paths" icon={<UserCog className="h-4 w-4" aria-hidden />}>
              <h2 id="paths" className="text-title-section text-fg-primary font-semibold">
                Two ways to request deletion
              </h2>
              <p>You can request deletion of your data in either of two ways:</p>

              <h3 className="text-title-card text-fg-primary mt-5 font-semibold">
                Option 1 — Self-service in the app
              </h3>
              <ol className="list-decimal space-y-2 pl-6">
                <li>
                  Sign in to{" "}
                  <Link
                    href="/signin"
                    className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                  >
                    planner.laratik.com
                  </Link>
                  .
                </li>
                <li>
                  Go to <em>Settings → My Account → Connected Channels</em>.
                </li>
                <li>
                  For each connected social account (Facebook Page, Instagram business account,
                  TikTok), click <em>Disconnect</em>. The connection and its access tokens are
                  deleted immediately and the page is removed from your analytics dashboard.
                </li>
                <li>
                  To delete your entire account, go to{" "}
                  <em>Settings → My Account → Delete account</em> and confirm. All your data is
                  queued for deletion.
                </li>
              </ol>

              <h3 className="text-title-card text-fg-primary mt-5 font-semibold">
                Option 2 — Email request
              </h3>
              <p>
                Send an email to{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                from the email address registered to your workspace, with the subject line{" "}
                <em>&ldquo;Data deletion request&rdquo;</em>. Include the workspace name and
                (optionally) the connected social account names. We will reply within 7 days to
                confirm the scope and start the deletion.
              </p>
            </Section>

            <Section id="what-we-delete" icon={<Trash2 className="h-4 w-4" aria-hidden />}>
              <h2 id="what-we-delete" className="text-title-section text-fg-primary font-semibold">
                What we delete
              </h2>
              <p>On a complete account deletion, we permanently remove:</p>
              <ul className="list-disc space-y-1 pl-6">
                <li>Your user account, profile, and sign-in credentials.</li>
                <li>All social connections, encrypted access tokens, and OAuth state rows.</li>
                <li>
                  All social profile daily metrics (follower, reach, views, engaged, interactions)
                  collected for your workspace.
                </li>
                <li>
                  All content items, comments, approval history, and design assets created or
                  uploaded by you or your teammates in the workspace.
                </li>
                <li>All AI feature usage events tied to your user id.</li>
              </ul>

              <Callout tone="warning">
                <strong>We retain, for the minimum period required by law:</strong> anonymized
                security audit events (without your email or name) for 7 years for compliance with
                applicable commercial and tax record-keeping law, and anonymized operational logs
                (without your email or name) for 90 days.
              </Callout>
            </Section>

            <Section id="meta-callback" icon={<Webhook className="h-4 w-4" aria-hidden />}>
              <h2 id="meta-callback" className="text-title-section text-fg-primary font-semibold">
                Meta User Data Deletion callback
              </h2>
              <p>
                Meta may send us a signed deletion request on your behalf via the callback
                configured in our Meta app. When this happens, we automatically:
              </p>
              <ol className="list-decimal space-y-2 pl-6">
                <li>Verify the request signature against Meta&apos;s public key.</li>
                <li>
                  Look up the user / Page that the signed request refers to and mark it for
                  deletion.
                </li>
                <li>
                  Delete the connection, encrypted access tokens, and any cached metrics for the
                  marked user / Page within 30 days.
                </li>
                <li>
                  Confirm the deletion by POSTing the{" "}
                  <code className="bg-surface-subtle text-fg-primary text-label rounded px-1.5 py-0.5 font-mono">
                    url
                  </code>{" "}
                  and{" "}
                  <code className="bg-surface-subtle text-fg-primary text-label rounded px-1.5 py-0.5 font-mono">
                    confirmation_code
                  </code>{" "}
                  back to Meta at the URL Meta provided in the original request.
                </li>
              </ol>
              <p>
                If you want to trigger this path manually, follow the{" "}
                <em>Removing an App or Website You&apos;ve Authorized</em> instructions in your
                Facebook account settings; Meta will then send the callback.
              </p>
            </Section>

            <Section id="timeframe" icon={<TimerReset className="h-4 w-4" aria-hidden />}>
              <h2 id="timeframe" className="text-title-section text-fg-primary font-semibold">
                Timeframe
              </h2>
              <p>
                Complete account deletions are processed within 30 days of confirmation.
                Self-service <em>Disconnect</em> actions are immediate. The Meta User Data Deletion
                callback is confirmed back to Meta within 30 days of receipt.
              </p>
            </Section>

            <Section id="irreversibility" icon={<AlertTriangle className="h-4 w-4" aria-hidden />}>
              <h2 id="irreversibility" className="text-title-section text-fg-primary font-semibold">
                Irreversibility
              </h2>
              <Callout tone="warning">
                Deletion is irreversible. Once your data is deleted, we cannot recover it. We
                strongly recommend exporting any content you wish to keep before requesting
                deletion. The Service provides a per-content CSV / JSON export from the content
                detail page.
              </Callout>
            </Section>

            <Section id="questions" icon={<MailQuestion className="h-4 w-4" aria-hidden />}>
              <h2 id="questions" className="text-title-section text-fg-primary font-semibold">
                Questions
              </h2>
              <p>
                If you have a question about deletion or want to check the status of a pending
                request, email{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
                . See also our{" "}
                <Link
                  href="/privacy"
                  className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </Link>{" "}
                for the full legal basis and your GDPR rights.
              </p>
            </Section>
          </article>
        </div>

        <LegalFooter />
      </div>
    </main>
  );
}

// ─── Building blocks ──────────────────────────────────────────────────────

function Hero() {
  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div
          className="bg-primary-subtle text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
          aria-hidden
        >
          <Trash2 className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label text-fg-muted tracking-wide uppercase">laratik · legal</p>
          <h1 className="text-title-page text-fg-primary mt-1 font-semibold tracking-tight">
            Data Deletion
          </h1>
          <p className="text-body text-fg-secondary mt-2 max-w-prose">
            How to request deletion of your data from{" "}
            <strong className="text-fg-primary">laratik-planner</strong>, including Meta&apos;s
            signed-request callback flow. Effective immediately for self-service <em>Disconnect</em>
            , within 30 days for full account deletion.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="border-border bg-surface-subtle text-label text-fg-secondary inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <Clock className="h-3 w-3" aria-hidden />
              Effective {EFFECTIVE_DATE}
            </span>
            <span className="border-border bg-warning-subtle text-label text-warning inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Deletion is irreversible
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Toc({ sections }: { sections: readonly (typeof SECTIONS)[number][] }) {
  return (
    <nav aria-label="Table of contents" className="hidden lg:block">
      <div className="sticky top-8">
        <p className="text-label text-fg-muted mb-3 tracking-wide uppercase">On this page</p>
        <ul className="border-border space-y-1 border-l">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-body text-fg-secondary hover:text-primary hover:border-primary -ml-px block border-l py-1.5 pl-4 transition-colors"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function ControllerCallout() {
  return (
    <Card className="bg-info-subtle border-info/30">
      <div className="flex items-start gap-4">
        <div
          className="bg-info flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-white"
          aria-hidden
        >
          <Mail className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label text-info tracking-wide uppercase">Deletion requests</p>
          <p className="text-body text-fg-primary mt-1 font-semibold">
            {OPERATOR_TRADE} · {OPERATOR_LEGAL}
          </p>
          <dl className="text-body text-fg-secondary mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="text-fg-muted flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" aria-hidden /> Email
            </dt>
            <dd>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </dd>
            <dt className="text-fg-muted flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" aria-hidden /> Phone
            </dt>
            <dd>
              <a
                href={`tel:${CONTACT_PHONE.replace(/\s/g, "")}`}
                className="text-fg-primary hover:text-primary underline-offset-2 hover:underline"
              >
                {CONTACT_PHONE}
              </a>
            </dd>
            <dt className="text-fg-muted flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> Post
            </dt>
            <dd>{CONTACT_ADDRESS}</dd>
          </dl>
        </div>
      </div>
    </Card>
  );
}

function Section({
  id,
  icon,
  children,
}: {
  id: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-8">
      <div className="flex items-start gap-3">
        {icon ? (
          <div
            className="bg-primary-subtle text-primary mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px]"
            aria-hidden
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Card>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "info" | "warning" | "success";
  children: React.ReactNode;
}) {
  const toneClass = {
    info: "bg-info-subtle border-info/30 text-info",
    warning: "bg-warning-subtle border-warning/30 text-warning",
    success: "bg-success-subtle border-success/30 text-success",
  }[tone];
  return (
    <div
      className={`text-body mt-3 rounded-[var(--radius-control)] border-l-4 px-4 py-3 leading-relaxed ${toneClass}`}
    >
      {children}
    </div>
  );
}

function LegalFooter() {
  return (
    <footer className="border-border mt-16 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-label text-fg-muted">
          © {new Date().getFullYear()} {OPERATOR_TRADE}. All rights reserved.
        </p>
        <p className="text-label text-fg-muted mt-1">
          Operated by {OPERATOR_LEGAL} · {CONTACT_ADDRESS}
        </p>
      </div>
      <nav
        aria-label="Legal"
        className="text-label text-fg-secondary flex flex-wrap gap-x-5 gap-y-2"
      >
        <Link href="/privacy" className="hover:text-primary underline-offset-2 hover:underline">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:text-primary underline-offset-2 hover:underline">
          Terms of Service
        </Link>
        <Link href="/" className="hover:text-primary underline-offset-2 hover:underline">
          Home
        </Link>
      </nav>
    </footer>
  );
}
