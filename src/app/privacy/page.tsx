import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  Link2,
  Building2,
  ScrollText,
  Clock,
  UserCheck,
  Globe2,
  Baby,
  RefreshCw,
  MailQuestion,
} from "lucide-react";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How laratik-planner (operated by Mohamad Nezam, trading as LaraTik) handles personal data collected through Facebook Login for Business and related integrations.",
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = "26 August 2026";
const DATA_CONTROLLER_LEGAL = "Mohamad Nezam";
const DATA_CONTROLLER_TRADE = "LaraTik";
const CONTACT_EMAIL = "info@laratik.com";
const CONTACT_PHONE = "+49 179 1594254";
const CONTACT_ADDRESS = "Eltingstraße 7, 45141 Essen, Germany";
const HOSTING_REGION = "Germany, European Union (Hetzner Online GmbH, FSN1)";

// Section ids used by the sticky TOC
const SECTIONS = [
  { id: "controller", title: "1. Who we are", icon: Building2 },
  { id: "scope", title: "2. Scope", icon: ScrollText },
  { id: "data", title: "3. Data we collect", icon: ShieldCheck },
  { id: "purposes", title: "4. Why we use your data", icon: UserCheck },
  { id: "lawful-basis", title: "5. Lawful basis (GDPR Art. 6)", icon: ScrollText },
  { id: "retention", title: "6. Retention", icon: Clock },
  { id: "subprocessors", title: "7. Sub-processors", icon: Globe2 },
  { id: "transfers", title: "8. International transfers", icon: Globe2 },
  { id: "rights", title: "9. Your GDPR rights", icon: UserCheck },
  { id: "children", title: "10. Children", icon: Baby },
  { id: "changes", title: "11. Changes", icon: RefreshCw },
  { id: "contact", title: "12. Contact", icon: MailQuestion },
] as const;

export default function PrivacyPage() {
  return (
    <main className="bg-canvas min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:py-16">
        <Hero
          icon={<ShieldCheck className="text-primary h-7 w-7" aria-hidden />}
          eyebrow="laratik · legal"
          title="Privacy Policy"
          subtitle="How we handle personal data collected through Facebook Login for Business, TikTok Login Kit, and the laratik-planner service."
          meta={`Effective ${EFFECTIVE_DATE}`}
        />

        <div className="mt-10 grid gap-8 lg:grid-cols-[16rem_1fr]">
          <Toc sections={SECTIONS} />

          <article className="text-body text-fg-secondary min-w-0 space-y-6 leading-relaxed">
            <ControllerCallout />

            <Section id="controller" icon={<Building2 className="h-4 w-4" aria-hidden />}>
              <h2 id="controller" className="text-title-section text-fg-primary font-semibold">
                1. Who we are
              </h2>
              <p>
                The data controller for the personal data described in this policy is{" "}
                <strong className="text-fg-primary">{DATA_CONTROLLER_LEGAL}</strong>, trading as{" "}
                <strong className="text-fg-primary">{DATA_CONTROLLER_TRADE}</strong> (
                <em>&ldquo;{DATA_CONTROLLER_TRADE}&rdquo;</em>, <em>&ldquo;we&rdquo;</em>,{" "}
                <em>&ldquo;us&rdquo;</em>, <em>&ldquo;our&rdquo;</em>). You can reach us through any
                of the channels on the controller callout above.
              </p>
            </Section>

            <Section id="scope" icon={<ScrollText className="h-4 w-4" aria-hidden />}>
              <h2 id="scope" className="text-title-section text-fg-primary font-semibold">
                2. What this policy covers
              </h2>
              <p>
                This policy describes how we process personal data when you use{" "}
                <strong className="text-fg-primary">laratik-planner</strong> (the{" "}
                <em>&ldquo;Service&rdquo;</em>) and, in particular, when you connect a Meta
                (Facebook / Instagram) or TikTok account to the Service via our social analytics
                integration. The Service is a self-hosted social media planning, design, and
                approvals workspace operated from the {HOSTING_REGION}.
              </p>
            </Section>

            <Section id="data" icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>
              <h2 id="data" className="text-title-section text-fg-primary font-semibold">
                3. Personal data we collect
              </h2>

              <SubSection title="3.1 Data you provide directly" accent="primary">
                <ul className="list-disc space-y-1 ps-6">
                  <li>
                    <strong className="text-fg-primary">Account data:</strong> name, email address,
                    profile photo, and any optional fields you fill in inside the Service.
                  </li>
                  <li>
                    <strong className="text-fg-primary">Content data:</strong> social media posts,
                    captions, design files, comments, and approval decisions you create or upload
                    inside the Service.
                  </li>
                </ul>
              </SubSection>

              <SubSection
                title="3.2 Data we receive from Meta (Facebook Login for Business)"
                accent="info"
              >
                <p>
                  When you click <em>&ldquo;Connect Facebook&rdquo;</em> and grant permission in the
                  Meta authorization dialog, we receive the data described in our published
                  permission set, specifically:
                </p>
                <ul className="list-disc space-y-1 ps-6">
                  <li>
                    <code className="bg-surface-subtle text-fg-primary text-label rounded px-1.5 py-0.5 font-mono">
                      pages_show_list
                    </code>{" "}
                    — the list of Facebook Pages you manage.
                  </li>
                  <li>
                    <code className="bg-surface-subtle text-fg-primary text-label rounded px-1.5 py-0.5 font-mono">
                      pages_read_engagement
                    </code>{" "}
                    — engagement metrics for content on those Pages (impressions, reach, views, post
                    engagements).
                  </li>
                  <li>
                    <code className="bg-surface-subtle text-fg-primary text-label rounded px-1.5 py-0.5 font-mono">
                      instagram_basic
                    </code>{" "}
                    — your Instagram business account profile (id, username, profile photo).
                  </li>
                  <li>
                    <code className="bg-surface-subtle text-fg-primary text-label rounded px-1.5 py-0.5 font-mono">
                      instagram_manage_insights
                    </code>{" "}
                    — daily account-level insights for the connected Instagram business account
                    (reach, views, engaged accounts, interactions).
                  </li>
                </ul>
                <Callout tone="info">
                  The OAuth <em>code</em> returned by Meta is exchanged once for a long-lived user
                  access token and a per-Page access token. Tokens are encrypted at rest with
                  AES-256-GCM using a per-workspace data-encryption key (DEK) sealed by a platform
                  key-encryption key (KEK). Tokens are never logged, returned in API responses, or
                  displayed in the UI.
                </Callout>
              </SubSection>

              <SubSection title="3.3 Data we receive from TikTok (Login Kit)" accent="primary">
                <p>
                  If you connect a TikTok account we receive your public profile (open id, display
                  name, username, avatar), and account-level counters (follower count, following
                  count, likes count, video count). We never request or store TikTok private
                  messages, drafts, or video contents.
                </p>
              </SubSection>

              <SubSection title="3.4 Operational data" accent="primary">
                <p>
                  Server logs (IP address, user agent, request path, response status) and security
                  audit events (actor id, action verb, target type, outcome, timestamp). Logs are
                  retained for up to 90 days; security audit events for the lifetime of the
                  workspace plus 7 years for compliance.
                </p>
              </SubSection>
            </Section>

            <Section id="purposes" icon={<UserCheck className="h-4 w-4" aria-hidden />}>
              <h2 id="purposes" className="text-title-section text-fg-primary font-semibold">
                4. Why we use your data (purposes)
              </h2>
              <ul className="list-disc space-y-1 ps-6">
                <li>
                  <strong className="text-fg-primary">Service provision.</strong> To operate the
                  planning, design, approval, and analytics features you request.
                </li>
                <li>
                  <strong className="text-fg-primary">Social analytics.</strong> To fetch and
                  display the daily snapshot of followers, reach, views, engaged accounts, and
                  interactions for the connected social accounts.
                </li>
                <li>
                  <strong className="text-fg-primary">Security and abuse prevention.</strong> To
                  detect unauthorized access, enforce rate limits, and investigate incidents.
                </li>
                <li>
                  <strong className="text-fg-primary">Legal compliance.</strong> To respond to
                  lawful requests from competent authorities and to fulfil our record-keeping
                  obligations.
                </li>
              </ul>
            </Section>

            <Section id="lawful-basis" icon={<ScrollText className="h-4 w-4" aria-hidden />}>
              <h2 id="lawful-basis" className="text-title-section text-fg-primary font-semibold">
                5. Lawful basis (GDPR Art. 6)
              </h2>
              <p>
                We process your personal data on the following legal bases under the EU General Data
                Protection Regulation:
              </p>
              <ul className="list-disc space-y-1 ps-6">
                <li>
                  <strong className="text-fg-primary">
                    Art. 6(1)(b) — Performance of a contract.
                  </strong>{" "}
                  Processing your account data, content data, and connected social account data to
                  deliver the Service you signed up for.
                </li>
                <li>
                  <strong className="text-fg-primary">Art. 6(1)(a) — Consent.</strong> The OAuth
                  authorization you grant in the Meta or TikTok dialog is explicit consent. You can
                  withdraw consent at any time by clicking <em>Disconnect</em> on the channel page
                  or by emailing us.
                </li>
                <li>
                  <strong className="text-fg-primary">Art. 6(1)(f) — Legitimate interest.</strong>{" "}
                  Server logs, security audit events, and aggregated operational telemetry to keep
                  the Service secure and reliable. We balance this against your rights and freedoms;
                  you can object per Art. 21 by emailing us.
                </li>
                <li>
                  <strong className="text-fg-primary">Art. 6(1)(c) — Legal obligation.</strong>{" "}
                  Record-keeping and disclosure to competent authorities where required by law.
                </li>
              </ul>
            </Section>

            <Section id="retention" icon={<Clock className="h-4 w-4" aria-hidden />}>
              <h2 id="retention" className="text-title-section text-fg-primary font-semibold">
                6. How long we keep your data
              </h2>
              <ul className="list-disc space-y-1 ps-6">
                <li>
                  <strong className="text-fg-primary">Access tokens:</strong> until you disconnect
                  the channel or until the token expires and cannot be refreshed (whichever is
                  first).
                </li>
                <li>
                  <strong className="text-fg-primary">Daily social metrics:</strong> 25 months from
                  the observation date, after which the row is deleted by the nightly retention job.
                </li>
                <li>
                  <strong className="text-fg-primary">OAuth state bag:</strong> 24 hours (used only
                  to prevent CSRF during the OAuth callback).
                </li>
                <li>
                  <strong className="text-fg-primary">
                    Workspace content (posts, comments, approval history):
                  </strong>{" "}
                  lifetime of the workspace; deleted within 30 days of workspace deletion.
                </li>
                <li>
                  <strong className="text-fg-primary">Security audit events:</strong> 7 years for
                  compliance with applicable commercial and tax law.
                </li>
              </ul>
            </Section>

            <Section id="subprocessors" icon={<Globe2 className="h-4 w-4" aria-hidden />}>
              <h2 id="subprocessors" className="text-title-section text-fg-primary font-semibold">
                7. Who else receives your data (sub-processors)
              </h2>
              <p>We share your personal data only with the following categories of recipients:</p>
              <ul className="list-disc space-y-1 ps-6">
                <li>
                  <strong className="text-fg-primary">Meta Platforms Ireland Limited</strong> (and
                  its affiliates) — when you connect a Facebook Page or Instagram business account.
                  Meta is itself a controller for the data it receives via its APIs; see{" "}
                  <a
                    href="https://www.facebook.com/privacy/policy/"
                    className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Meta&apos;s privacy policy
                  </a>
                  .
                </li>
                <li>
                  <strong className="text-fg-primary">TikTok Pte. Ltd.</strong> — when you connect a
                  TikTok account. See{" "}
                  <a
                    href="https://www.tiktok.com/legal/privacy-policy"
                    className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    TikTok&apos;s privacy policy
                  </a>
                  .
                </li>
                <li>
                  <strong className="text-fg-primary">Hetzner Online GmbH</strong> — infrastructure
                  provider hosting our application and Postgres database in Falkenstein, Germany.
                </li>
                <li>
                  <strong className="text-fg-primary">
                    Email delivery (Mailcow / self-hosted SMTP)
                  </strong>{" "}
                  — to send transactional emails (sign-in links, password resets, notifications). No
                  marketing email is sent.
                </li>
                <li>
                  <strong className="text-fg-primary">Sentry (self-hosted, Germany region)</strong>{" "}
                  — to receive error and crash reports. Reports are scrubbed of personal data before
                  transmission and we have disabled user-feedback collection.
                </li>
              </ul>
              <p>
                We do not sell your personal data. We do not share it with advertising networks,
                data brokers, or analytics providers beyond what is listed above.
              </p>
            </Section>

            <Section id="transfers" icon={<Globe2 className="h-4 w-4" aria-hidden />}>
              <h2 id="transfers" className="text-title-section text-fg-primary font-semibold">
                8. International data transfers
              </h2>
              <p>
                Our infrastructure is hosted in Germany. Meta and TikTok are US-headquartered
                companies; the data they receive is governed by their own privacy policies and the
                standard contractual clauses / EU-US Data Privacy Framework they have in place. If
                you require a more restricted transfer posture, you can avoid connecting non-EU
                accounts.
              </p>
            </Section>

            <Section id="rights" icon={<UserCheck className="h-4 w-4" aria-hidden />}>
              <h2 id="rights" className="text-title-section text-fg-primary font-semibold">
                9. Your rights under GDPR
              </h2>
              <p>
                You have the right to: (a) access the personal data we hold about you (Art. 15); (b)
                correct inaccurate data (Art. 16); (c) request deletion (Art. 17) — see also our{" "}
                <Link
                  href="/data-deletion"
                  className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                >
                  Data Deletion
                </Link>{" "}
                page; (d) restrict processing (Art. 18); (e) data portability (Art. 20); (f) object
                to processing based on legitimate interest (Art. 21); and (g) withdraw consent at
                any time (Art. 7(3)) without affecting the lawfulness of processing carried out
                before withdrawal.
              </p>
              <p>
                To exercise any of these rights, email{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                from the address you registered with. We will respond within 30 days.
              </p>
              <p>
                You also have the right to lodge a complaint with the data protection supervisory
                authority competent for your place of residence, or with the lead authority for our
                establishment in Germany (
                <em>
                  Landesbeauftragte für den Datenschutz und die Informationsfreiheit
                  Nordrhein-Westfalen
                </em>
                , since our establishment is in Essen).
              </p>
            </Section>

            <Section id="children" icon={<Baby className="h-4 w-4" aria-hidden />}>
              <h2 id="children" className="text-title-section text-fg-primary font-semibold">
                10. Children
              </h2>
              <p>
                The Service is not directed at children under 16. We do not knowingly collect
                personal data from children. If you believe we have collected such data, contact us
                and we will delete it within 7 days.
              </p>
            </Section>

            <Section id="changes" icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              <h2 id="changes" className="text-title-section text-fg-primary font-semibold">
                11. Changes to this policy
              </h2>
              <p>
                We may update this policy. Material changes will be announced in-app at least 14
                days before they take effect, and the effective date above will change. Non-material
                changes (typos, clarifications, contact updates) take effect immediately on the new
                effective date.
              </p>
            </Section>

            <Section id="contact" icon={<MailQuestion className="h-4 w-4" aria-hidden />}>
              <h2 id="contact" className="text-title-section text-fg-primary font-semibold">
                12. Contact
              </h2>
              <p>
                For any privacy question or to exercise your rights, use any of the channels on the
                controller callout above. We respond to email within 7 working days, and to written
                requests under GDPR within 30 days.
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

function Hero({
  icon,
  eyebrow,
  title,
  subtitle,
  meta,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  meta: string;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div
          className="bg-primary-subtle text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
          aria-hidden
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label text-fg-muted tracking-wide uppercase">{eyebrow}</p>
          <h1 className="text-title-page text-fg-primary mt-1 font-semibold tracking-tight">
            {title}
          </h1>
          <p className="text-body text-fg-secondary mt-2 max-w-prose">{subtitle}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="border-border bg-surface-subtle text-label text-fg-secondary inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <Clock className="h-3 w-3" aria-hidden />
              {meta}
            </span>
            <span className="border-border bg-surface-subtle text-label text-fg-secondary inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              GDPR Art. 13 compliant
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

function ControllerCallout() {
  return (
    <Card className="bg-info-subtle border-info/30">
      <div className="flex items-start gap-4">
        <div
          className="bg-info flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-white"
          aria-hidden
        >
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label text-info tracking-wide uppercase">Data controller</p>
          <p className="text-body text-fg-primary mt-1 font-semibold">
            {DATA_CONTROLLER_LEGAL}, trading as {DATA_CONTROLLER_TRADE}
          </p>
          <dl className="text-body text-fg-secondary mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="text-fg-muted flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> Address
            </dt>
            <dd>
              <span>{CONTACT_ADDRESS}</span>
            </dd>

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
        <div className="group/anchor relative min-w-0 flex-1">
          <a
            href={`#${id}`}
            aria-label={`Permalink to this section`}
            className="text-fg-muted hover:text-primary absolute -start-7 top-1 hidden transition-colors lg:group-hover/anchor:flex"
          >
            <Link2 className="h-3.5 w-3.5" />
          </a>
          {children}
        </div>
      </div>
    </Card>
  );
}

function SubSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: "primary" | "info";
  children: React.ReactNode;
}) {
  const dotClass = accent === "primary" ? "bg-primary" : "bg-info";
  return (
    <div className="mt-5">
      <h3 className="text-title-card text-fg-primary flex items-center gap-2 font-semibold">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        {title}
      </h3>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
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
      className={`text-body mt-3 rounded-[var(--radius-control)] border-s-4 px-4 py-3 leading-relaxed ${toneClass}`}
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
          © {new Date().getFullYear()} {DATA_CONTROLLER_TRADE}. All rights reserved.
        </p>
        <p className="text-label text-fg-muted mt-1">
          Operated by {DATA_CONTROLLER_LEGAL} · {CONTACT_ADDRESS}
        </p>
      </div>
      <nav
        aria-label="Legal"
        className="text-label text-fg-secondary flex flex-wrap gap-x-5 gap-y-2"
      >
        <Link href="/terms" className="hover:text-primary underline-offset-2 hover:underline">
          Terms of Service
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
