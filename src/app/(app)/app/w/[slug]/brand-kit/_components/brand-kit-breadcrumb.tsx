"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { DirAwareChevronRight } from "@/components/ui/dir-aware-icon";
import { isActivePath } from "@/lib/utils";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * BrandKitBreadcrumb — a compact breadcrumb that sits above every
 * brand-kit page so the user always knows which workspace + which
 * section they are in.
 *
 * The chain is `Workspace name  ›  Brand Kit  ›  Section` for
 * non-overview routes, and `Workspace name  ›  Brand Kit` for the
 * overview. The Brand Kit link is the parent section link; the
 * trailing section label is a non-link `<span>` (you can't click
 * the page you're already on).
 */
const BRAND_KIT_SECTION_KEYS: Record<string, string> = {
  voice: "brandKit.section.voice",
  pillars: "brandKit.section.pillars",
  logos: "brandKit.section.logos",
  colors: "brandKit.section.colors",
  typography: "brandKit.section.typography",
  templates: "brandKit.section.templates",
  publishing: "brandKit.section.publishing",
  linked: "brandKit.section.linked",
  activity: "brandKit.section.activity",
};

export function BrandKitBreadcrumb({
  workspaceName,
  t: tProp,
}: {
  workspaceName: string;
  t?: (key: string) => string;
}) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  const pathname = usePathname();
  // The current section is the segment after `/brand-kit/`. Empty
  // string means we're on the overview (`/brand-kit` itself).
  const segments = pathname.split("/").filter(Boolean);
  const brandKitIndex = segments.lastIndexOf("brand-kit");
  const currentSection = brandKitIndex >= 0 ? (segments[brandKitIndex + 1] ?? "") : "";
  const wsBase = pathname.split("/brand-kit")[0] ?? "";

  const sectionLabel = currentSection
    ? t(BRAND_KIT_SECTION_KEYS[currentSection] ?? currentSection)
    : null;

  return (
    <nav
      aria-label={t("brandKit.breadcrumbAria")}
      data-testid="brand-kit-breadcrumb"
      className="text-label text-fg-muted flex items-center gap-1"
    >
      <Link
        href={wsBase}
        className="hover:text-fg-primary inline-flex items-center gap-1 font-semibold transition-colors"
      >
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        {workspaceName}
      </Link>
      <DirAwareChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      <Link
        href={`${wsBase}/brand-kit`}
        aria-current={
          isActivePath(`${wsBase}/brand-kit`, pathname, { exact: true }) ? "page" : undefined
        }
        className="hover:text-fg-primary font-semibold transition-colors"
      >
        {t("brandKit.title")}
      </Link>
      {sectionLabel ? (
        <>
          <DirAwareChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span
            aria-current="page"
            className="text-fg-primary font-semibold"
            data-testid="brand-kit-breadcrumb-section"
          >
            {sectionLabel}
          </span>
        </>
      ) : null}
    </nav>
  );
}
