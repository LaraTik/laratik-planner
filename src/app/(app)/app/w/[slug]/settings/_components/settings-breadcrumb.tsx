"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { DirAwareChevronRight } from "@/components/ui/dir-aware-icon";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { isActivePath } from "@/lib/utils";

/**
 * SettingsBreadcrumb — compact breadcrumb that sits above every
 * per-section settings page so the user always knows which
 * workspace + which settings section they are in. Mirrors the
 * brand-kit breadcrumb (settings refactor Phase A).
 */
export function SettingsBreadcrumb({ workspaceName }: { workspaceName: string }) {
  const pathname = usePathname();
  const t = useLocaleT();
  const segments = pathname.split("/").filter(Boolean);
  const settingsIndex = segments.lastIndexOf("settings");
  const currentSection = settingsIndex >= 0 ? (segments[settingsIndex + 1] ?? "") : "";
  const wsBase = pathname.split("/settings")[0] ?? "";

  const sectionLabelKey: Record<string, string> = {
    lifecycle: "settings.kpi.lifecycle",
    "lead-times": "settings.kpi.leadTimes",
    defaults: "settings.kpi.defaults",
    approvals: "settings.kpi.approvals",
    templates: "settings.templates.title",
  };
  const sectionLabel = currentSection
    ? t(sectionLabelKey[currentSection] ?? "settings.breadcrumb")
    : null;

  return (
    <nav
      aria-label={t("settings.breadcrumb")}
      data-testid="settings-breadcrumb"
      className="text-label text-fg-muted flex items-center gap-1"
    >
      <Link
        href={wsBase}
        className="hover:text-fg-primary inline-flex min-h-11 items-center gap-1 font-semibold transition-colors"
      >
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <bdi dir="auto">{workspaceName}</bdi>
      </Link>
      <DirAwareChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      <Link
        href={`${wsBase}/settings`}
        aria-current={
          isActivePath(`${wsBase}/settings`, pathname, { exact: true }) ? "page" : undefined
        }
        className="hover:text-fg-primary inline-flex min-h-11 items-center font-semibold transition-colors"
      >
        {t("settings.breadcrumb")}
      </Link>
      {sectionLabel ? (
        <>
          <DirAwareChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span
            aria-current="page"
            className="text-fg-primary font-semibold"
            data-testid="settings-breadcrumb-section"
          >
            {sectionLabel}
          </span>
        </>
      ) : null}
    </nav>
  );
}
