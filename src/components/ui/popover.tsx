"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Popover — Radix-powered, portal-mounted so the panel can
 * escape overflow:hidden ancestors and stacked transforms that would
 * otherwise clip it (see workspace-switcher bug 2026-08-21).
 *
 * Drop-in replacement for hand-rolled `position: absolute` menus.
 * Handles outside-click, Escape, focus return to the trigger, and
 * arrow-key navigation when a listbox is the first focusable child.
 */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "border-border bg-surface text-fg-primary z-50 w-72 rounded-[var(--radius-card)] border shadow-lg",
        "outline-none",
        // Subtle fade + scale; matches the project-wide pattern used by
        // DialogContent + DropdownMenuContent. The data-state variant
        // selectors pair with Radix's open/close transitions.
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent };
