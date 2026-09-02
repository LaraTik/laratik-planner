"use client";

import * as React from "react";
import { Check, Copy, GitCommitHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { BuildInfo } from "@/lib/build-info";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useLocaleT } from "@/components/i18n/locale-provider";

function useCopyBuildInfo(buildInfo: BuildInfo) {
  const t = useLocaleT();
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildInfo.copyText);
      setCopied(true);
      toast.success(t("buildInfo.copied"), { duration: 1500 });
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error(t("buildInfo.copyFailed"), {
        description:
          error instanceof Error ? error.message : t("buildInfo.checkBrowserPermissions"),
      });
    }
  }

  return { copied, copy, t };
}

export function CopyBuildInfoButton({
  buildInfo,
  className,
}: {
  buildInfo: BuildInfo;
  className?: string;
}) {
  const { copied, copy, t } = useCopyBuildInfo(buildInfo);

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      onClick={() => void copy()}
      data-testid="copy-build-info-button"
      data-copied={copied || undefined}
      className={cn("w-full sm:w-auto", className)}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? t("buildInfo.copied") : t("buildInfo.copy")}
    </Button>
  );
}

export function CopyBuildInfoMenuItem({ buildInfo }: { buildInfo: BuildInfo }) {
  const { copied, copy, t } = useCopyBuildInfo(buildInfo);

  return (
    <DropdownMenuItem
      onSelect={() => void copy()}
      data-testid="copy-build-info-menuitem"
      className="min-h-11 cursor-pointer"
    >
      <GitCommitHorizontal className="text-fg-secondary h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{buildInfo.displayLabel}</span>
        <span className="text-label text-fg-muted block font-normal">
          {buildInfo.environmentLabel}
        </span>
      </span>
      {copied ? (
        <Check className="text-success h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Copy className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="sr-only">{t("buildInfo.copy")}</span>
    </DropdownMenuItem>
  );
}

export function CopyBuildInfoSheetAction({ buildInfo }: { buildInfo: BuildInfo }) {
  const { copied, copy, t } = useCopyBuildInfo(buildInfo);

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => void copy()}
      data-testid="copy-build-info-sheet-action"
      className="hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-start transition-colors focus:outline-none focus-visible:ring-2"
    >
      <GitCommitHorizontal className="text-fg-secondary h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="text-body text-fg-primary block truncate font-semibold">
          {buildInfo.displayLabel}
        </span>
        <span className="text-label text-fg-muted block">{buildInfo.environmentLabel}</span>
      </span>
      {copied ? (
        <Check className="text-success h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Copy className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="sr-only">{t("buildInfo.copy")}</span>
    </button>
  );
}
