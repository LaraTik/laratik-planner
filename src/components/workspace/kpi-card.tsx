import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * KpiCard — a clickable tile that surfaces a single number and its label
 * (e.g. "Total ideas: 24"). Used on the Workspace Overview screen. Tiles
 * stack 2-up on phones, 4-up on >= lg screens. Hover/focus gives a
 * primary border hint without being noisy.
 */
export interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  /**
   * Optional. When omitted, the card is rendered as a non-clickable
   * tile (e.g. on the cross-workspace "My Work" page where the KPIs
   * span every workspace and a single href would 404).
   */
  href?: string;
  /** Render the icon in the danger color (e.g. for "At risk" tiles). */
  danger?: boolean;
}

export function KpiCard({ label, value, icon, href, danger = false }: KpiCardProps) {
  const body = (
    <>
      <div className={cn(danger ? "text-danger" : "text-primary")}>{icon}</div>
      <p className="text-title-page text-fg-primary mt-3 font-semibold">{value}</p>
      <p className="text-label text-fg-secondary">{label}</p>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="border-border bg-surface hover:border-primary focus-visible:ring-focus-ring rounded-[var(--radius-card)] border p-4 transition-colors focus:outline-none focus-visible:ring-2"
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="border-border bg-surface rounded-[var(--radius-card)] border p-4">{body}</div>
  );
}
