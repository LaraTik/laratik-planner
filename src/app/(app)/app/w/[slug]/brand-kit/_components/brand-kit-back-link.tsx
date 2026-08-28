import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * BrandKitBackLink — the small "← Back to Brand Kit" link that
 * sits above each section page. Reduces to the breadcrumb for
 * keyboard users (the breadcrumb lives in the layout, this is a
 * visual shortcut for mouse / touch users).
 */
export function BrandKitBackLink({ slug }: { slug: string }) {
  return (
    <Link
      href={`/app/w/${slug}/brand-kit`}
      className="text-label text-fg-secondary hover:text-fg-primary inline-flex items-center gap-1 font-semibold transition-colors"
      data-testid="brand-kit-back-link"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Back to Brand Kit
    </Link>
  );
}
