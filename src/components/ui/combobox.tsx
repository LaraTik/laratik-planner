"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Combobox — a searchable select with grouped options and a
 * free-text fallback. Built on Radix Popover so outside-click,
 * Escape, and focus-return are native.
 *
 * Use cases in this codebase:
 *   - Typography form: 14+ Google Fonts grouped by Sans / Serif /
 *     Display / Mono, each option rendered in its own font for a
 *     live preview without leaving the dropdown.
 *   - Anything else that needs a searchable picker with a flat
 *     list of options.
 *
 * Behaviour:
 *   - Click the trigger to open. The search input is auto-focused
 *     and the current selection is highlighted.
 *   - Type to filter; the filter is a case-insensitive substring
 *     match against the option label.
 *   - Arrow Up / Down navigates the visible options; Enter
 *     selects the focused option; Escape closes the popover.
 *   - The trigger button shows the current value (or a placeholder
 *     when none is set) and a trailing chevron. When a value is
 *     set, a check mark appears to the left of the option in the
 *     dropdown.
 *   - The popover closes on selection; focus returns to the
 *     trigger. The hidden `<input name="…">` that backs the form
 *     is the source of truth for the value — the trigger button
 *     is a display-only view of it.
 *   - When the user types a value that does not match any
 *     option (and `allowCustom` is true), the free-text value is
 *     accepted and the dropdown shows an "Use '<value>'" hint at
 *     the top. This matches the previous `<datalist>` behavior so
 *     the form still accepts fonts the catalog does not list.
 */
export interface ComboboxOption {
  /** Stable identifier — this is what the form posts. */
  value: string;
  /** Display label (also the search needle). */
  label: string;
  /**
   * Optional category for grouped rendering. The categories are
   * rendered in the order they first appear in the `options` prop.
   * Options without a category are rendered in an "Other" group
   * at the bottom.
   */
  category?: string;
  /**
   * Optional className applied to the option row (used for
   * "render in this font" previews).
   */
  className?: string;
  /**
   * Optional fully custom render — wins over the default row.
   * Use for icons, badges, or richer previews.
   */
  render?: (state: { selected: boolean; focused: boolean }) => React.ReactNode;
  /**
   * Optional disabled flag. Disabled options are visible but not
   * selectable; they appear dimmed.
   */
  disabled?: boolean;
}

export interface ComboboxProps {
  value: string;
  onChange: (next: string) => void;
  options: ComboboxOption[];
  /** Hidden input name — the form field that backs the value. */
  name: string;
  /** Trigger placeholder when no value is set. */
  placeholder?: string;
  /** Empty-state message when no options match the search. */
  emptyMessage?: string;
  /**
   * When true, the user can type a value that does not match any
   * option. The free-text value is accepted as-is. Defaults to
   * true to match the legacy `<datalist>` behaviour.
   */
  allowCustom?: boolean;
  /** Optional aria-label for the trigger button. */
  ariaLabel?: string;
  /** Optional testid for the trigger. */
  triggerTestId?: string;
  /** Optional testid for the search input. */
  inputTestId?: string;
  /** Optional id used for the underlying input / aria wiring. */
  id?: string;
  /** Class applied to the trigger button. */
  triggerClassName?: string;
  /** When true, the combobox is disabled. */
  disabled?: boolean;
}

/**
 * Group the options by their `category` field, preserving the
 * first-encountered order. Options without a category go into
 * an "Other" group appended at the end.
 */
function groupByCategory(options: ComboboxOption[]): [string, ComboboxOption[]][] {
  const seen = new Map<string, ComboboxOption[]>();
  const order: string[] = [];
  for (const opt of options) {
    const key = opt.category ?? "Other";
    if (!seen.has(key)) {
      seen.set(key, []);
      order.push(key);
    }
    seen.get(key)!.push(opt);
  }
  return order.map((k) => [k, seen.get(k)!] as const);
}

function matches(option: ComboboxOption, needle: string): boolean {
  if (!needle) return true;
  return option.label.toLowerCase().includes(needle);
}

export function Combobox({
  value,
  onChange,
  options,
  name,
  placeholder = "Select…",
  emptyMessage = "No matches.",
  allowCustom = true,
  ariaLabel,
  triggerTestId,
  inputTestId,
  id,
  triggerClassName,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [needle, setNeedle] = React.useState("");
  // Track the focused option by its value (string) rather than an
  // index. Index-based focus is fragile because the index space
  // changes when the user types and the filtered set shrinks; a
  // value-based focus lets us reset to the first visible option
  // when the previous focus is no longer in the list, without
  // calling setState inside an effect.
  const [focusedValue, setFocusedValue] = React.useState<string | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const optionRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const listId = React.useId();

  const selectedOption = options.find((o) => o.value === value) ?? null;
  const filtered = options.filter((o) => matches(o, needle));
  const groups = groupByCategory(filtered);

  // Flat list (with separator markers) for keyboard nav. We collapse
  // group boundaries into a single index space so arrow nav is
  // continuous. Disabled options are still in the list but not
  // focusable.
  const flat: ComboboxOption[] = groups.flatMap(([, opts]) => opts);

  // Derive the focus index from the focused value. When the
  // focused option is no longer in the filtered set, fall back to
  // the first visible option. Recomputed on every render so the
  // filter / focus stay in lockstep without a setState-in-effect.
  const focusIndex = (() => {
    if (focusedValue) {
      const idx = flat.findIndex((o) => o.value === focusedValue);
      if (idx >= 0) return idx;
    }
    return 0;
  })();

  // When the popover opens, focus the search input so the user can
  // start typing immediately.
  React.useEffect(() => {
    if (open) {
      // Wait one frame for the popover to mount.
      const t = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  function commit(next: ComboboxOption) {
    if (next.disabled) return;
    onChange(next.value);
    setOpen(false);
    setNeedle("");
    setFocusedValue(null);
    // Return focus to the trigger so keyboard users land in a
    // sensible place after selection.
    triggerRef.current?.focus();
  }

  function commitFreeText() {
    if (!allowCustom) return;
    if (!needle) return;
    onChange(needle);
    setOpen(false);
    setNeedle("");
    setFocusedValue(null);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(focusIndex + 1, flat.length - 1);
      const nextValue = flat[next]?.value;
      if (nextValue) setFocusedValue(nextValue);
      optionRefs.current[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(focusIndex - 1, 0);
      const nextValue = flat[next]?.value;
      if (nextValue) setFocusedValue(nextValue);
      optionRefs.current[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = flat[focusIndex];
      if (opt) commit(opt);
      else if (allowCustom) commitFreeText();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  // Map each visible option to its position in the flat list so we
  // can wire focus + ref correctly.
  const flatIndex = new Map<string, number>();
  flat.forEach((o, i) => flatIndex.set(o.value, i));

  const customIsNew = allowCustom && needle.length > 0 && !options.some((o) => o.value === needle);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel ?? placeholder}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          disabled={disabled}
          data-testid={triggerTestId}
          className={cn(
            "border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-left font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
            "hover:bg-surface-subtle",
            disabled && "cursor-not-allowed opacity-60",
            triggerClassName,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !selectedOption && "text-fg-muted")}>
            {selectedOption?.label ?? (value ? value : placeholder)}
          </span>
          <ChevronsUpDown className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <div className="border-border flex items-center gap-2 border-b px-3 py-2">
          <Search className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            ref={searchRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search…"
            data-testid={inputTestId}
            className="text-body text-fg-primary placeholder:text-fg-muted h-8 w-full bg-transparent focus:outline-none"
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          className="max-h-72 overflow-y-auto py-1"
          data-testid={inputTestId ? `${inputTestId}-listbox` : undefined}
        >
          {customIsNew ? (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={commitFreeText}
                className="text-body text-fg-primary hover:bg-surface-subtle flex w-full items-center gap-2 px-3 py-2 text-left font-semibold"
              >
                <span className="bg-primary-subtle text-primary text-label rounded px-1.5 py-0.5 font-bold">
                  Use
                </span>
                <span className="truncate">“{needle}”</span>
              </button>
            </li>
          ) : null}
          {groups.length === 0 ? (
            <li>
              <p className="text-label text-fg-muted px-3 py-3">{emptyMessage}</p>
            </li>
          ) : null}
          {groups.map(([category, opts]) => (
            <React.Fragment key={category}>
              {opts.length > 0 ? (
                <li
                  className="text-label text-fg-muted bg-surface sticky top-0 px-3 pt-2 pb-1 font-semibold tracking-wide uppercase"
                  aria-hidden="true"
                >
                  {category}
                </li>
              ) : null}
              {opts.map((opt) => {
                const idx = flatIndex.get(opt.value) ?? 0;
                const isSelected = opt.value === value;
                const isFocused = idx === focusIndex;
                return (
                  <li key={opt.value}>
                    <button
                      ref={(el) => {
                        optionRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      onMouseEnter={() => setFocusedValue(opt.value)}
                      onClick={() => commit(opt)}
                      data-testid={inputTestId ? `${inputTestId}-option-${opt.value}` : undefined}
                      className={cn(
                        "text-body text-fg-primary flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                        isFocused && "bg-surface-subtle",
                        opt.disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      {opt.render ? (
                        opt.render({ selected: isSelected, focused: isFocused })
                      ) : (
                        <>
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center",
                              isSelected ? "text-primary" : "text-transparent",
                            )}
                            aria-hidden="true"
                          >
                            <Check className="h-4 w-4" />
                          </span>
                          <span className={cn("truncate", opt.className)}>{opt.label}</span>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </React.Fragment>
          ))}
        </ul>
      </PopoverContent>
      {/* Hidden input so the form posts the same value the trigger
          displays. The form action's Zod schema is the source of
          truth for the value shape; this input is a wire. */}
      <input type="hidden" name={name} value={value} />
    </Popover>
  );
}
