"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Tabs — Radix-powered, accessible tab switcher.
 *
 * Use to swap between two related views in the same card (e.g. the
 * "Send invitation" / "Add directly" tabs on /app/users). Each tab
 * keeps its own uncontrolled state because switching tabs remounts
 * the content subtree only when the value changes (Radix handles
 * this with `forceMount` off and `defaultValue` set per panel).
 *
 * Keyboard: arrow keys move between triggers (Radix `orientation`),
 * Home/End jump to the ends, Enter/Space activate the focused
 * trigger. `aria-controls` and `aria-labelledby` are wired
 * automatically.
 *
 *   <Tabs defaultValue="invite">
 *     <TabsList>
 *       <TabsTrigger value="invite">Send invitation</TabsTrigger>
 *       <TabsTrigger value="add">Add directly</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="invite">…</TabsContent>
 *     <TabsContent value="add">…</TabsContent>
 *   </Tabs>
 */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "border-border bg-surface text-fg-secondary inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-control)] border p-1",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:ring-focus-ring text-label inline-flex items-center justify-center rounded-[calc(var(--radius-control)-2px)] px-3 py-1 font-semibold whitespace-nowrap transition-colors",
      "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-primary data-[state=active]:text-primary-fg",
      "data-[state=inactive]:hover:text-fg-primary",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:ring-focus-ring mt-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
