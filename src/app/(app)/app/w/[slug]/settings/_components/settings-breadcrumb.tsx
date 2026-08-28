"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { isActivePath } from "@/lib/utils";

/**
 * SettingsBreadcrumb — compact breadcrumb that sits above every
 * per-section settings page so the user always knows which
 * workspace + which settings section they are in. Mirrors the
 * brand-kit breadcrumb (settings refactor Phase A).
 */
export function SettingsBreadcrumb({ workspaceName }: { workspaceName: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const settingsIndex = segments.lastIndexOf("settings");
  const currentSection = settingsIndex >= 0 ? (segments[settingsIndex + 1] ?? "") : "";
  const wsBase = pathname.split("/settings")[0] ?? "";

  const sectionLabel = currentSection
    ? currentSection
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")
    : null;

  return (
    <nav
      aria-label="Settings breadcrumb"
      data-testid="settings-breadcrumb"
      className="text-label text-fg-muted flex items-center gap-1"
    >
      <Link
        href={wsBase}
        className="hover:text-fg-primary inline-flex items-center gap-1 font-semibold transition-colors"
      >
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        {workspaceName}
      </Link>
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      <Link
        href={`${wsBase}/settings`}
        aria-current={
          isActivePath(`${wsBase}/settings`, pathname, { exact: true }) ? "page" : undefined
        }
        className="hover:text-fg-primary font-semibold transition-colors"
      >
        Settings
      </Link>
      {sectionLabel ? (
        <>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
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
