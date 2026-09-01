"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Checkbox — Radix-powered, fully accessible checkbox with
 * the project's design tokens.
 *
 * Use instead of bare `<input type="checkbox">` for visual
 * consistency with the rest of the design system. Radix wires up
 * the `checkbox` role, `aria-checked` state, keyboard handling
 * (space to toggle), and indeterminate state out of the box.
 *
 *   <Checkbox id="mustChange" name="mustChangePassword" defaultChecked />
 *   <Checkbox id="grants" name="grantsAgencyAdmin" />
 *
 * **Form integration:** works inside any server-action `<form>`; the
 * underlying `<button role="checkbox">` submits `name=value` when
 * checked (Radix renders a hidden `<input>` for that). The
 * `value` prop is required when `name` is set so the submitted
 * value is meaningful (defaults to `"on"`).
 *
 * **Why not native input:** the unstyled native input we used
 * before had two issues: (1) browser-default checkbox visuals that
 * didn't match the design tokens, and (2) the parent `<label>` had
 * to wrap the input OR use `htmlFor` for accessibility — easy to
 * get wrong. The Radix primitive bakes in the role/state
 * association so the form stays correct.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // Visual: 16x16, primary-fg bg, primary border on hover, danger on
      // invalid. Rounded-[2px] matches the project's other controls.
      "border-border bg-surface text-primary-foreground focus-visible:ring-focus-ring peer h-4 w-4 shrink-0 rounded-[2px] border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      "data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground",
      "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground",
      "hover:border-fg-secondary",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-[invalid=true]:border-danger",
      // Form integration: the underlying button needs to participate
      // in the form so the server action receives the value. Radix
      // renders a hidden input when `name` is set; no extra wiring
      // needed here.
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {props.checked === "indeterminate" ? (
        <Minus className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Check className="h-3 w-3" aria-hidden="true" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
