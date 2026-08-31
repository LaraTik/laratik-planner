import * as React from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Direction-aware icon wrapper.
 *
 * Lucide's `ArrowLeft` / `ArrowRight` / `ChevronLeft` / `ChevronRight`
 * are hard-coded to point in one direction. In an RTL layout (Arabic,
 * Hebrew, etc.) the user expects "back" to flip — the right-pointing
 * arrow that visually means "previous" in LTR should still mean
 * "previous" in RTL, but its physical orientation must mirror.
 *
 * Two options were considered:
 *   1. JS: read `document.documentElement.dir` and swap the icon.
 *   2. CSS: add `rtl:rotate-180` to the icon.
 *
 * The CSS option wins because:
 *   - No hydration mismatch (the document `dir` is set by the
 *     server-rendered `<html>` tag, so SSR and client agree from
 *     the first paint).
 *   - No `useEffect` flash on mount.
 *   - Works with Tailwind 4's `rtl:` variant out of the box when
 *     the parent is `dir="rtl"`.
 *   - The icon does not need to know its semantic meaning; the
 *     consumer picks the icon and the wrapper applies the flip.
 *
 * Usage:
 *   ```tsx
 *   <DirAwareArrowLeft className="h-4 w-4" />
 *   <DirAwareChevronRight className="h-3.5 w-3.5" />
 *   ```
 *
 * Pass `flip={false}` for icons that should NOT mirror (e.g. an arrow
 * that represents a literal direction on a map, not a navigation
 * affordance).
 */
function DirAwareIcon({
  Icon,
  flip = true,
  className,
  ariaHidden = true,
}: {
  Icon: LucideIcon;
  /**
   * When true (default), the icon is rotated 180° in RTL contexts.
   * Set false for icons that have an intrinsic LTR meaning (e.g. a
   * "previous frame" button on a video timeline).
   */
  flip?: boolean;
  className: string;
  ariaHidden?: boolean;
}) {
  return (
    <span className={cn("inline-flex shrink-0", flip && "rtl:rotate-180")} aria-hidden={ariaHidden}>
      <Icon className={className} />
    </span>
  );
}

const DEFAULT_CLASS = "h-4 w-4";

/**
 * Convenience wrappers for the most common cases. Use these in
 * preference to writing the JSX by hand — it documents the intent
 * (a back arrow, a forward chevron) and keeps the visual contract
 * consistent across the app.
 */
export function DirAwareArrowLeft({
  className = DEFAULT_CLASS,
  flip = true,
}: {
  className?: string;
  flip?: boolean;
}) {
  return <DirAwareIcon Icon={ArrowLeft} className={className} flip={flip} />;
}

export function DirAwareArrowRight({
  className = DEFAULT_CLASS,
  flip = true,
}: {
  className?: string;
  flip?: boolean;
}) {
  return <DirAwareIcon Icon={ArrowRight} className={className} flip={flip} />;
}

export function DirAwareChevronLeft({
  className = DEFAULT_CLASS,
  flip = true,
}: {
  className?: string;
  flip?: boolean;
}) {
  return <DirAwareIcon Icon={ChevronLeft} className={className} flip={flip} />;
}

export function DirAwareChevronRight({
  className = DEFAULT_CLASS,
  flip = true,
}: {
  className?: string;
  flip?: boolean;
}) {
  return <DirAwareIcon Icon={ChevronRight} className={className} flip={flip} />;
}
