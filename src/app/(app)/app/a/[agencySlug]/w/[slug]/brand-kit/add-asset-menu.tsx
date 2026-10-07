"use client";

import * as React from "react";
import {
  ChevronDown,
  Link as LinkIcon,
  type LucideIcon,
  Palette,
  Plus,
  Sparkles,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * AddAssetMenu — the brand-kit page header's "Add asset" CTA.
 *
 * Replaces the previous non-functional `<Button>` stub with a
 * `DropdownMenu` of section-scoped jump links. Picking an option
 *  1. Smooth-scrolls to the matching section (`#{id}`);
 *  2. Focuses the section's first form input so the user can type
 *     immediately without a second click.
 *
 * The dropdown uses the project's shadcn `DropdownMenu` primitive
 * (Radix under the hood) so keyboard navigation, focus trap, and
 * outside-click dismissal are all native.
 *
 * Accessibility:
 *   - The trigger has an `aria-label` describing the action in full.
 *   - Each menu item carries a visible icon, a primary label, and a
 *     short description so the choice is unambiguous.
 *   - The keyboard hint is surfaced on hover (Radix's default
 *     behaviour for menu items that show a right-aligned key cap).
 */
type SectionId = "logo" | "color" | "guidelines" | "voice" | "publishing" | "linked";

const ITEMS: {
  id: SectionId;
  labelKey: string;
  labelFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
  icon: LucideIcon;
}[] = [
  {
    id: "logo",
    labelKey: "users.addAssetMenu.itemLogoLabel",
    labelFallback: "Logo",
    descriptionKey: "users.addAssetMenu.itemLogoDesc",
    descriptionFallback: "Upload a file or paste an external URL",
    icon: Plus,
  },
  {
    id: "color",
    labelKey: "users.addAssetMenu.itemColorLabel",
    labelFallback: "Color",
    descriptionKey: "users.addAssetMenu.itemColorDesc",
    descriptionFallback: "Add a hex token to the palette",
    icon: Palette,
  },
  {
    id: "guidelines",
    labelKey: "users.addAssetMenu.itemGuidelinesLabel",
    labelFallback: "Typography",
    descriptionKey: "users.addAssetMenu.itemGuidelinesDesc",
    descriptionFallback: "Catalogue a font with role + weight",
    icon: Type,
  },
  {
    id: "voice",
    labelKey: "users.addAssetMenu.itemVoiceLabel",
    labelFallback: "Voice rule",
    descriptionKey: "users.addAssetMenu.itemVoiceDesc",
    descriptionFallback: "Document tone, do's, or don'ts",
    icon: Sparkles,
  },
  {
    id: "publishing",
    labelKey: "users.addAssetMenu.itemPublishingLabel",
    labelFallback: "Publishing rule",
    descriptionKey: "users.addAssetMenu.itemPublishingDesc",
    descriptionFallback: "Editorial guardrail for the team",
    icon: Sparkles,
  },
  {
    id: "linked",
    labelKey: "users.addAssetMenu.itemLinkedLabel",
    labelFallback: "Linked resource",
    descriptionKey: "users.addAssetMenu.itemLinkedDesc",
    descriptionFallback: "Figma, Drive, Canva, or Dropbox link",
    icon: LinkIcon,
  },
];

function jumpToSection(id: SectionId) {
  if (typeof window === "undefined") return;
  const target = document.getElementById(id);
  if (!target) return;
  // Smooth scroll for users with no reduced-motion preference; the
  // global stylesheet already flips this to `auto` under
  // `prefers-reduced-motion: reduce`.
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  // Focus the first form input inside the section (if any) so the
  // user can start typing immediately. We wait one frame to let the
  // smooth-scroll start; the focus doesn't actually move the page.
  window.setTimeout(() => {
    const firstInput = target.querySelector<HTMLElement>(
      "input, textarea, select, button[aria-haspopup]",
    );
    if (firstInput instanceof HTMLElement) firstInput.focus({ preventScroll: true });
  }, 120);
}

export function AddAssetMenu({ t }: { t?: (key: string) => string }) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="default"
          size="default"
          data-testid="brand-kit-add-asset"
          aria-label={tr("users.addAssetMenu.triggerAria", "Add to the brand kit")}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {tr("users.addAssetMenu.triggerLabel", "Add to brand kit")}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {tr("users.addAssetMenu.menuLabel", "Add to brand kit")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => jumpToSection(item.id)}
              data-testid={`brand-kit-add-${item.id}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <div className="flex flex-col">
                <span className="text-body text-fg-primary font-semibold">
                  {tr(item.labelKey, item.labelFallback)}
                </span>
                <span className="text-label text-fg-muted">
                  {tr(item.descriptionKey, item.descriptionFallback)}
                </span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
