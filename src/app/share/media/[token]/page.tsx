import type { Metadata } from "next";
import Link from "next/link";
import { Download, Languages, ShieldAlert } from "lucide-react";
import { publicMediaAssetForToken } from "@/lib/media/service";
import { resolveLocale, type LocaleCode } from "@/lib/i18n/locales";
import { tFor } from "@/messages";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
};

function localeFromSearch(value: string | undefined): LocaleCode {
  return resolveLocale(value).code;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { lang } = await searchParams;
  const locale = localeFromSearch(lang);
  const t = tFor(locale);
  return {
    title: t("media.publicShareTitle"),
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function PublicMediaSharePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { lang } = await searchParams;
  const locale = localeFromSearch(lang);
  const descriptor = resolveLocale(locale);
  const t = tFor(locale);
  const row = await publicMediaAssetForToken(token);
  const alternate = locale === "en" ? "ar" : "en";
  const alternateHref = `/share/media/${encodeURIComponent(token)}?lang=${alternate}`;

  return (
    <main
      lang={locale}
      dir={descriptor.dir}
      className="bg-canvas text-fg-primary flex min-h-screen items-center justify-center px-4 py-16"
    >
      <div className="w-full max-w-4xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <p className="text-label text-fg-muted font-semibold tracking-wide uppercase">LaraTik</p>
          <Link
            href={alternateHref}
            lang={alternate}
            dir={alternate === "ar" ? "rtl" : "ltr"}
            className="border-border bg-surface text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 font-semibold focus:outline-none focus-visible:ring-2"
          >
            <Languages className="h-4 w-4" aria-hidden="true" />
            {alternate === "ar" ? "العربية" : "English"}
          </Link>
        </header>

        {row ? (
          <section className="border-border bg-surface overflow-hidden rounded-[var(--radius-card)] border shadow-sm">
            <div className="bg-surface-subtle flex min-h-[min(70vh,720px)] items-center justify-center p-3 sm:p-6">
              {/* The share route is same-origin and token-authorized. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/share/media/${encodeURIComponent(token)}`}
                alt={t("media.publicShareImageAlt")}
                className="max-h-[70vh] max-w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
              <div>
                <h1 className="text-title-card text-fg-primary font-semibold">
                  {t("media.publicShareTitle")}
                </h1>
                <p className="text-label text-fg-muted mt-1">{t("media.publicShareDescription")}</p>
              </div>
              <a
                href={`/api/share/media/${encodeURIComponent(token)}?download=1`}
                className="bg-primary hover:bg-primary-hover focus-visible:ring-focus-ring text-button inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 font-semibold text-white focus:outline-none focus-visible:ring-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {t("media.download")}
              </a>
            </div>
          </section>
        ) : (
          <section className="border-border bg-surface rounded-[var(--radius-card)] border p-8 text-center shadow-sm">
            <ShieldAlert className="text-fg-muted mx-auto h-10 w-10" aria-hidden="true" />
            <h1 className="text-title-card text-fg-primary mt-4 font-semibold">
              {t("media.publicShareUnavailableTitle")}
            </h1>
            <p className="text-body text-fg-secondary mx-auto mt-2 max-w-lg">
              {t("media.publicShareUnavailableDescription")}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
