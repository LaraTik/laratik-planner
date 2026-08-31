import type { Metadata } from "next";
import Link from "next/link";
import {
  ScrollText,
  Clock,
  UserCheck,
  Ban,
  Copyright,
  Plug,
  CreditCard,
  LogOut,
  Scale,
  ShieldAlert,
  RefreshCw,
  Gavel,
  Scissors,
  MailQuestion,
} from "lucide-react";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms governing the use of laratik-planner, operated by Mohamad Nezam, trading as LaraTik.",
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = "26 August 2026";
const OPERATOR_LEGAL = "Mohamad Nezam";
const OPERATOR_TRADE = "LaraTik";
const CONTACT_EMAIL = "info@laratik.com";
const CONTACT_PHONE = "+49 179 1594254";
const CONTACT_ADDRESS = "Eltingstraße 7, 45141 Essen, Germany";

const SECTIONS = [
  { id: "operator", title: "1. Who we are", icon: ScrollText },
  { id: "service", title: "2. The Service", icon: Plug },
  { id: "eligibility", title: "3. Eligibility", icon: UserCheck },
  { id: "use", title: "4. Acceptable use", icon: Ban },
  { id: "content", title: "5. Your content", icon: Copyright },
  { id: "third-party", title: "6. Connected third-party accounts", icon: Plug },
  { id: "fees", title: "7. Fees and payment", icon: CreditCard },
  { id: "termination", title: "8. Termination", icon: LogOut },
  { id: "ip", title: "9. Intellectual property", icon: Copyright },
  { id: "liability", title: "10. Disclaimers and liability", icon: ShieldAlert },
  { id: "indemnity", title: "11. Indemnification", icon: Scale },
  { id: "changes", title: "12. Changes", icon: RefreshCw },
  { id: "law", title: "13. Governing law", icon: Gavel },
  { id: "severability", title: "14. Severability", icon: Scissors },
  { id: "contact", title: "15. Contact", icon: MailQuestion },
] as const;

export default function TermsPage() {
  return (
    <main className="bg-canvas min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:py-16">
        <Hero />

        <div className="mt-10 grid gap-8 lg:grid-cols-[16rem_1fr]">
          <Toc sections={SECTIONS} />

          <article className="text-body text-fg-secondary min-w-0 space-y-6 leading-relaxed">
            <Section id="operator" icon={<ScrollText className="h-4 w-4" aria-hidden />}>
              <h2 id="operator" className="text-title-section text-fg-primary font-semibold">
                1. Who we are
              </h2>
              <p>
                The Service is operated by{" "}
                <strong className="text-fg-primary">{OPERATOR_LEGAL}</strong>, trading as{" "}
                <strong className="text-fg-primary">{OPERATOR_TRADE}</strong> (
                <em>&ldquo;{OPERATOR_TRADE}&rdquo;</em>, <em>&ldquo;we&rdquo;</em>,{" "}
                <em>&ldquo;us&rdquo;</em>, <em>&ldquo;our&rdquo;</em>). You can reach us at{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
                , {CONTACT_PHONE}, or by post at {CONTACT_ADDRESS}.
              </p>
            </Section>

            <Section id="service" icon={<Plug className="h-4 w-4" aria-hidden />}>
              <h2 id="service" className="text-title-section text-fg-primary font-semibold">
                2. The Service
              </h2>
              <p>
                <strong className="text-fg-primary">laratik-planner</strong> (the{" "}
                <em>&ldquo;Service&rdquo;</em>) is a self-hosted social media planning, design,
                approval, and analytics workspace. The Service connects to third-party platforms
                (Meta / Facebook / Instagram, TikTok) via official APIs to fetch analytics and
                (where applicable) publish posts on your behalf, subject to the permissions you
                grant.
              </p>
              <p>
                The Service is provided on an <em>as-is, as-available</em> basis during its current
                pilot phase. We may add, change, or remove features at any time. We will give
                reasonable notice for changes that materially affect your workflows.
              </p>
            </Section>

            <Section id="eligibility" icon={<UserCheck className="h-4 w-4" aria-hidden />}>
              <h2 id="eligibility" className="text-title-section text-fg-primary font-semibold">
                3. Eligibility and account
              </h2>
              <p>
                You must be at least 18 years old and authorized to act on behalf of the workspace
                owner (typically your employer or your own business) to use the Service. You are
                responsible for keeping your sign-in credentials and connected third-party accounts
                secure.
              </p>
              <p>
                You must provide accurate registration information and keep it up to date. You must
                notify us promptly if you suspect unauthorized access to your account.
              </p>
            </Section>

            <Section id="use" icon={<Ban className="h-4 w-4" aria-hidden />}>
              <h2 id="use" className="text-title-section text-fg-primary font-semibold">
                4. Acceptable use
              </h2>
              <p>You agree not to:</p>
              <ul className="list-disc space-y-1 ps-6">
                <li>
                  Use the Service to violate any applicable law or the terms of any third-party
                  platform you connect (Meta, TikTok, etc.).
                </li>
                <li>
                  Upload content that is unlawful, infringing, defamatory, harassing, or deceptive.
                </li>
                <li>
                  Attempt to reverse-engineer, scrape, or extract source code or non-public data
                  from the Service.
                </li>
                <li>
                  Interfere with the Service&apos;s security, rate-limiting, or audit mechanisms.
                </li>
                <li>
                  Use the Service to send unsolicited communications or to spam Meta / TikTok APIs.
                </li>
                <li>
                  Resell, sublicense, or white-label the Service without our prior written consent.
                </li>
              </ul>
            </Section>

            <Section id="content" icon={<Copyright className="h-4 w-4" aria-hidden />}>
              <h2 id="content" className="text-title-section text-fg-primary font-semibold">
                5. Your content
              </h2>
              <p>
                You retain all rights to the content you create, upload, or publish through the
                Service (<em>&ldquo;Your Content&rdquo;</em>). You grant us a limited, worldwide,
                non-exclusive license to host, store, transmit, and display Your Content solely to
                operate the Service for you.
              </p>
              <p>
                We do not claim ownership of Your Content. We do not use Your Content to train
                machine learning models. We do not sell Your Content or share it with third parties
                except as needed to operate the Service (e.g. sending a scheduled post to Meta).
              </p>
            </Section>

            <Section id="third-party" icon={<Plug className="h-4 w-4" aria-hidden />}>
              <h2 id="third-party" className="text-title-section text-fg-primary font-semibold">
                6. Connected third-party accounts
              </h2>
              <p>
                When you connect a Facebook Page, Instagram business account, or TikTok account, you
                authorize us to act on your behalf within the scope of the permissions you grant.
                You can revoke this authorization at any time via the in-app <em>Disconnect</em>{" "}
                action on the channel page, or directly in your Meta / TikTok account settings.
              </p>
              <p>
                Meta and TikTok are not parties to these Terms. Their own terms of service and
                platform policies apply to your use of their platforms.
              </p>
            </Section>

            <Section id="fees" icon={<CreditCard className="h-4 w-4" aria-hidden />}>
              <h2 id="fees" className="text-title-section text-fg-primary font-semibold">
                7. Fees and payment
              </h2>
              <p>
                During the current pilot phase the Service is provided free of charge. If we
                introduce paid tiers in the future, we will give you at least 30 days&apos; notice
                before any charge applies to your workspace, and you will have the option to export
                your data and stop using the Service before the change takes effect.
              </p>
            </Section>

            <Section id="termination" icon={<LogOut className="h-4 w-4" aria-hidden />}>
              <h2 id="termination" className="text-title-section text-fg-primary font-semibold">
                8. Termination
              </h2>
              <p>
                You may stop using the Service at any time. We may suspend or terminate access if
                (a) you breach these Terms, (b) we are required to do so by law, or (c) we
                discontinue the Service with at least 90 days&apos; notice.
              </p>
              <p>
                On termination, we will delete or anonymize Your Content within 30 days unless we
                are required to retain it for legal reasons. See our{" "}
                <Link
                  href="/data-deletion"
                  className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                >
                  Data Deletion
                </Link>{" "}
                page for the full deletion process.
              </p>
            </Section>

            <Section id="ip" icon={<Copyright className="h-4 w-4" aria-hidden />}>
              <h2 id="ip" className="text-title-section text-fg-primary font-semibold">
                9. Intellectual property
              </h2>
              <p>
                The Service, including its source code, design, trademarks, and documentation, is
                owned by {OPERATOR_TRADE} and protected by intellectual property law. Nothing in
                these Terms transfers ownership of the Service to you.
              </p>
              <p>
                <em>&ldquo;{OPERATOR_TRADE}&rdquo;</em> and the LaraTik logo are trademarks of{" "}
                {OPERATOR_LEGAL}. You may not use them without our prior written consent except to
                identify the Service in your own materials.
              </p>
            </Section>

            <Section id="liability" icon={<ShieldAlert className="h-4 w-4" aria-hidden />}>
              <h2 id="liability" className="text-title-section text-fg-primary font-semibold">
                10. Disclaimers and liability
              </h2>
              <p>
                To the maximum extent permitted by law, the Service is provided{" "}
                <em>&ldquo;as is&rdquo;</em> and <em>&ldquo;as available&rdquo;</em>, without
                warranties of any kind, express or implied, including but not limited to warranties
                of merchantability, fitness for a particular purpose, and non-infringement. We do
                not warrant that the Service will be uninterrupted, error-free, or that the
                analytics data fetched from third-party APIs will be accurate or complete.
              </p>
              <p>
                To the maximum extent permitted by law, our aggregate liability arising out of or
                related to these Terms will not exceed the greater of (a) the amount you paid us in
                the 12 months preceding the claim, or (b) EUR 100. We will not be liable for
                indirect, incidental, special, consequential, or punitive damages.
              </p>
              <p>
                Nothing in these Terms excludes or limits liability that cannot be excluded or
                limited under applicable law (including death or personal injury caused by
                negligence, fraud, or statutory rights you have as a consumer).
              </p>
            </Section>

            <Section id="indemnity" icon={<Scale className="h-4 w-4" aria-hidden />}>
              <h2 id="indemnity" className="text-title-section text-fg-primary font-semibold">
                11. Indemnification
              </h2>
              <p>
                You agree to indemnify and hold {OPERATOR_TRADE} harmless from any third-party claim
                arising out of (a) Your Content, (b) your breach of these Terms, or (c) your
                violation of any third-party platform&apos;s terms.
              </p>
            </Section>

            <Section id="changes" icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              <h2 id="changes" className="text-title-section text-fg-primary font-semibold">
                12. Changes to these Terms
              </h2>
              <p>
                We may update these Terms. Material changes will be announced in-app at least 14
                days before they take effect. The effective date above will change. Continued use of
                the Service after the effective date constitutes acceptance of the new Terms. If you
                do not agree, you may stop using the Service and request deletion of your data.
              </p>
            </Section>

            <Section id="law" icon={<Gavel className="h-4 w-4" aria-hidden />}>
              <h2 id="law" className="text-title-section text-fg-primary font-semibold">
                13. Governing law and disputes
              </h2>
              <p>
                These Terms are governed by the laws of the Federal Republic of Germany, excluding
                its conflict-of-laws rules and the UN Convention on Contracts for the International
                Sale of Goods.
              </p>
              <p>
                The exclusive place of jurisdiction for any dispute arising out of or related to
                these Terms is the court competent for the place of establishment of{" "}
                {OPERATOR_TRADE} in Germany (currently Essen), unless mandatory consumer protection
                law gives you the right to bring proceedings in your place of residence.
              </p>
              <p>
                The European Commission provides an online platform for the resolution of consumer
                disputes:{" "}
                <a
                  href="https://ec.europa.eu/consumers/odr"
                  className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  ec.europa.eu/consumers/odr
                </a>
                . We are not obliged and do not commit to participate in dispute resolution
                proceedings before a consumer arbitration board.
              </p>
            </Section>

            <Section id="severability" icon={<Scissors className="h-4 w-4" aria-hidden />}>
              <h2 id="severability" className="text-title-section text-fg-primary font-semibold">
                14. Severability
              </h2>
              <p>
                If any provision of these Terms is held to be invalid or unenforceable, the
                remaining provisions will continue in full force and effect.
              </p>
            </Section>

            <Section id="contact" icon={<MailQuestion className="h-4 w-4" aria-hidden />}>
              <h2 id="contact" className="text-title-section text-fg-primary font-semibold">
                15. Contact
              </h2>
              <p>
                Questions about these Terms? Email{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
                , call {CONTACT_PHONE}, or write to {CONTACT_ADDRESS}.
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
          <ScrollText className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label text-fg-muted tracking-wide uppercase">laratik · legal</p>
          <h1 className="text-title-page text-fg-primary mt-1 font-semibold tracking-tight">
            Terms of Service
          </h1>
          <p className="text-body text-fg-secondary mt-2 max-w-prose">
            The agreement between you and {OPERATOR_TRADE} for using{" "}
            <strong className="text-fg-primary">laratik-planner</strong>. Plain English, German
            governing law.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="border-border bg-surface-subtle text-label text-fg-secondary inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <Clock className="h-3 w-3" aria-hidden />
              Effective {EFFECTIVE_DATE}
            </span>
            <span className="border-border bg-surface-subtle text-label text-fg-secondary inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <Gavel className="h-3 w-3" aria-hidden />
              German law
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
        <ul className="border-border space-y-1 border-s">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-body text-fg-secondary hover:text-primary hover:border-primary -ms-px block border-s py-1.5 ps-4 transition-colors"
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
        <Link
          href="/data-deletion"
          className="hover:text-primary underline-offset-2 hover:underline"
        >
          Data Deletion
        </Link>
        <Link href="/" className="hover:text-primary underline-offset-2 hover:underline">
          Home
        </Link>
      </nav>
    </footer>
  );
}
