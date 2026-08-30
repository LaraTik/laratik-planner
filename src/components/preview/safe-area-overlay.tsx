"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * SafeAreaOverlay — toggle that paints a translucent mask
 * over the regions of an Instagram-style preview that the
 * app's own UI can occlude (profile strip, caption, like /
 * comment / share buttons, bottom progress / next reel).
 *
 * Phase 4 of the planning-workspace-v2 refactor (2026-08-30).
 *
 * The overlay is a preview aid, never persisted to the
 * asset. It's intended to help the planner ensure that
 * important text and faces fall inside the safe area.
 *
 * Coordinates are expressed as percentages of the preview
 * box so the overlay scales with the container. The exact
 * pixel positions would be brittle — the safe areas here
 * are a planning-grade approximation of the regions
 * Instagram's UI typically covers.
 */

const SAFE_AREA_REGIONS = {
  feed: [
    // Bottom button bar (Like / Comment / Share / Save).
    { top: 91, left: 0, width: 100, height: 9 },
    // Caption + username overlay.
    { top: 70, left: 0, width: 100, height: 16 },
  ],
  reel: [
    // Bottom: caption + username + music ticker.
    { top: 70, left: 0, width: 75, height: 30 },
    // Right side: action button stack (Like / Comment / Share / Remix).
    { top: 35, left: 84, width: 16, height: 55 },
    // Top: progress dots + close.
    { top: 0, left: 0, width: 100, height: 6 },
  ],
  story: [
    // Top: profile / progress / close.
    { top: 0, left: 0, width: 100, height: 15 },
    // Bottom: text reply / DM / reactions.
    { top: 80, left: 0, width: 100, height: 20 },
  ],
} as const;

export type SafeAreaShape = keyof typeof SAFE_AREA_REGIONS;

export function SafeAreaOverlay({
  shape,
  children,
}: {
  shape: SafeAreaShape;
  children: React.ReactNode;
}) {
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const regions = SAFE_AREA_REGIONS[shape];
  return (
    <div className="relative">
      <div className="absolute top-1 right-1 z-10">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setShowSafeAreas((v) => !v)}
          aria-pressed={showSafeAreas}
          data-testid="safe-area-toggle"
          className="h-7 px-2 text-xs"
        >
          {showSafeAreas ? (
            <EyeOff className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Eye className="h-3 w-3" aria-hidden="true" />
          )}
          {showSafeAreas ? "Hide safe areas" : "Show safe areas"}
        </Button>
      </div>
      {children}
      {showSafeAreas ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          data-testid="safe-area-overlay"
        >
          {regions.map((r, i) => (
            <div
              key={i}
              className="absolute border-2 border-dashed border-amber-400/80 bg-amber-300/15"
              style={{
                top: `${r.top}%`,
                left: `${r.left}%`,
                width: `${r.width}%`,
                height: `${r.height}%`,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
