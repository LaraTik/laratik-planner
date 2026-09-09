import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText, Languages, ShieldAlert, Video } from "lucide-react";
import { publicMediaCollectionForToken } from "@/lib/media/collection-service";
import { MEDIA_ZIP_MAX_BYTES } from "@/lib/media/contract";
import { resolveLocale, type LocaleCode } from "@/lib/i18n/locales";
import { tFor } from "@/messages";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> };

function localeFromSearch(value: string | undefined): LocaleCode {
  return resolveLocale(value).code;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { lang } = await searchParams;
  return {
    title: tFor(localeFromSearch(lang))("media.publicCollectionTitle"),
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function PublicMediaCollectionPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { lang } = await searchParams;
  const locale = localeFromSearch(lang);
  const descriptor = resolveLocale(locale);
  const t = tFor(locale);
  const collection = await publicMediaCollectionForToken(token);
  const collectionBytes =
    collection?.items.reduce((total, item) => total + item.object.byteSize, 0) ?? 0;
  const zipAvailable = collectionBytes <= MEDIA_ZIP_MAX_BYTES;
  const alternate = locale === "en" ? "ar" : "en";
  const alternateHref = `/share/media-collection/${encodeURIComponent(token)}?lang=${alternate}`;
  return (
    <main
      lang={locale}
      dir={descriptor.dir}
      className="bg-canvas text-fg-primary min-h-screen px-4 py-12 sm:px-6"
    >
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex items-center justify-between gap-3">
          <p className="text-label text-fg-muted font-semibold tracking-wide uppercase">LaraTik</p>
          <Link
            href={alternateHref}
            lang={alternate}
            dir={alternate === "ar" ? "rtl" : "ltr"}
            className="border-border bg-surface text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 font-semibold focus:outline-none focus-visible:ring-2"
          >
            <Languages className="h-4 w-4" aria-hidden="true" />
            {alternate === "ar" ? t("media.languageArabic") : t("media.languageEnglish")}
          </Link>
        </header>
        {collection ? (
          <section className="border-border bg-surface rounded-[var(--radius-card)] border p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-title-page font-semibold" dir="auto">
                  {collection.title}
                </h1>
                <p className="text-body text-fg-secondary mt-1">
                  {t("media.publicCollectionDescription")}
                </p>
              </div>
              {zipAvailable ? (
                <a
                  href={`/api/share/media-collection/${encodeURIComponent(token)}/zip`}
                  className="bg-primary hover:bg-primary-hover focus-visible:ring-focus-ring text-button inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 font-semibold text-white focus:outline-none focus-visible:ring-2"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t("media.downloadZip")}
                </a>
              ) : (
                <p className="text-label text-fg-muted max-w-xs text-end">
                  {t("media.publicCollectionZipTooLarge")}
                </p>
              )}
            </div>
            {collection.items.length > 0 ? (
              <ul
                className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                aria-label={t("media.publicCollectionAssets")}
              >
                {collection.items.map((item) => {
                  const src = `/api/share/media-collection/${encodeURIComponent(token)}/assets/${encodeURIComponent(item.asset.id)}`;
                  const label = item.asset.altText ?? item.asset.title;
                  return (
                    <li
                      key={item.itemId}
                      className="border-border bg-surface-subtle overflow-hidden rounded-[var(--radius-control)] border"
                    >
                      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden">
                        {item.object.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={label} className="h-full w-full object-contain" />
                        ) : item.object.kind === "video" ? (
                          <video
                            controls
                            playsInline
                            preload="metadata"
                            aria-label={label}
                            className="h-full w-full object-contain"
                          >
                            <source src={src} type={item.object.mimeType} />
                          </video>
                        ) : (
                          <FileText className="text-primary h-12 w-12" aria-hidden="true" />
                        )}
                        {item.object.kind === "video" ? (
                          <Video className="sr-only" aria-hidden="true" />
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-2 p-3">
                        <span className="text-body min-w-0 truncate font-semibold" dir="auto">
                          {item.asset.title}
                        </span>
                        <a
                          href={`${src}?download=1`}
                          aria-label={`${t("media.download")}: ${item.asset.title}`}
                          className="text-primary focus-visible:ring-focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2"
                        >
                          <Download className="h-4 w-4" aria-hidden="true" />
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-body text-fg-secondary mt-6">{t("media.publicCollectionEmpty")}</p>
            )}
          </section>
        ) : (
          <section className="border-border bg-surface rounded-[var(--radius-card)] border p-8 text-center shadow-sm">
            <ShieldAlert className="text-fg-muted mx-auto h-10 w-10" aria-hidden="true" />
            <h1 className="text-title-card mt-4 font-semibold">
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
