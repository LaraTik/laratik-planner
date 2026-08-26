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
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: "logo",
    label: "Logo",
    description: "Upload a file or paste an external URL",
    icon: Plus,
  },
  {
    id: "color",
    label: "Color",
    description: "Add a hex token to the palette",
    icon: Palette,
  },
  {
    id: "guidelines",
    label: "Typography",
    description: "Catalogue a font with role + weight",
    icon: Type,
  },
  {
    id: "voice",
    label: "Voice rule",
    description: "Document tone, do's, or don'ts",
    icon: Sparkles,
  },
  {
    id: "publishing",
    label: "Publishing rule",
    description: "Editorial guardrail for the team",
    icon: Sparkles,
  },
  {
    id: "linked",
    label: "Linked resource",
    description: "Figma, Drive, Canva, or Dropbox link",
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

export function AddAssetMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="default"
          size="default"
          data-testid="brand-kit-add-asset"
          aria-label="Add to the brand kit"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add to brand kit
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Add to brand kit</DropdownMenuLabel>
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
                <span className="text-body text-fg-primary font-semibold">{item.label}</span>
                <span className="text-label text-fg-muted">{item.description}</span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
