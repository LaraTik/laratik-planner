"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * CopyHexButton — single-line swatch + hex value with a click-to-copy
 * affordance. Used in the Color Palette section of the brand kit.
 *
 * Why client-side copy: the modern way to copy text to the clipboard
 * is `navigator.clipboard.writeText`. It's a promise-returning API,
 * supported in every browser we care about, and avoids the legacy
 * `document.execCommand("copy")` fallback that needed a hidden
 * `<textarea>` and a flash of selected text.
 *
 * Accessibility:
 *   - The button has a descriptive `aria-label` that announces both
 *     the action ("Copy hex") and the value.
 *   - On success, the icon swaps from Copy to Check for ~1.5s and a
 *     Sonner toast confirms the copy.
 *   - On error (e.g. clipboard permission denied), the toast shows
 *     the error and the icon does not swap, so the user can retry.
 *
 * The component is a button, not an `<a>`, because clicking copies
 * — it doesn't navigate. Keyboard activation (Enter / Space) is the
 * browser default for `<button type="button">`.
 */
export interface CopyHexButtonProps {
  /** The hex string, including the leading `#`. */
  hex: string;
  /** Optional accessible name override. Defaults to "Copy hex {hex}". */
  label?: string;
  className?: string;
}

export function CopyHexButton({ hex, label, className }: CopyHexButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const accessibleLabel = label ?? `Copy hex ${hex}`;

  async function onClick() {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      toast.success(`Copied ${hex}`, { duration: 1500 });
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      toast.error("Couldn't copy to clipboard", {
        description: err instanceof Error ? err.message : "Check your browser permissions.",
      });
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={accessibleLabel}
      data-testid="copy-hex-button"
      data-copied={copied || undefined}
      className={cn(
        "border-border bg-surface text-fg-muted hover:border-primary hover:text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border px-2 py-1 font-mono text-[12px] transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
      <span>{hex}</span>
    </button>
  );
}
