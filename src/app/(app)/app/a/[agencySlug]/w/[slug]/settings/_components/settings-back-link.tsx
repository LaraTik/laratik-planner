import * as React from "react";
import Link from "next/link";

import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";

/**
 * SettingsBackLink — small "← Back to Settings" link for the
 * per-section pages. Mirrors the brand-kit equivalent
 * (BrandKitBackLink).
 */
export function SettingsBackLink({ slug }: { slug: string }) {
  return (
    <Link
      href={`/app/w/${slug}/settings`}
      className="text-label text-fg-secondary hover:text-fg-primary inline-flex items-center gap-1 font-semibold transition-colors"
      data-testid="settings-back-link"
    >
      <DirAwareArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Back to Settings
    </Link>
  );
}
