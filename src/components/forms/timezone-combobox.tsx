"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * TimezoneCombobox — searchable select for IANA timezones.
 *
 * The list is sourced from `Intl.supportedValuesOf("timeZone")` so the
 * browser ships the canonical IANA tz database. The offset string is
 * computed once per zone via `Intl.DateTimeFormat` with
 * `timeZoneName: "longOffset"`, which returns e.g. "UTC+01:00" or
 * "UTC-05:30". "GMT" is normalized to "UTC" so the label reads
 * "Europe/Berlin (UTC+01:00)" instead of "Europe/Berlin (GMT+01:00)".
 *
 * The form contract: the parent owns `value` and `onChange` (this is a
 * controlled component) and renders a hidden `<input name="timezone">`
 * with the same value so the form submission carries the selected
 * IANA name. The schema in `src/lib/workspaces/settings-command.ts`
 * validates the timezone via `Intl.DateTimeFormat`, so anything this
 * combobox emits is accepted.
 *
 * Accessibility:
 *   - Trigger is a real `<button type="button">` so Enter/Space open
 *     the popover without submitting the form.
 *   - The popover content owns `role="listbox"` with `aria-activedescendant`
 *     for keyboard navigation; the visible label uses `aria-live="polite"`
 *     so the user hears the active match as they arrow.
 *   - The search input has `aria-controls={listboxId}` and `aria-activedescendant`
 *     so screen readers can announce the active option.
 *   - Esc closes the popover and returns focus to the trigger; outside
 *     click also closes (Radix Popover default).
 *   - The trigger label is the full option text, so even when the
 *     popover is closed, the user sees the selected value with its offset.
 */
type TimezoneOption = { value: string; offset: string };

const controlClass =
  "border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none";

// Generate the IANA list at module load. `supportedValuesOf` is
// available in Node 18+ / all modern browsers; the project's .nvmrc
// pins 20.x, and the schema validation uses the same Intl API, so the
// runtime guarantees are already met. The component is "use client",
// so this runs in the browser, where `Intl.DateTimeFormat` correctly
// returns the local time-zone offset for the user's clock.
const ALL_ZONES: TimezoneOption[] = (() => {
  const zones = Intl.supportedValuesOf("timeZone");
  const sample = new Date();
  return zones.map((zone) => {
    let offset = "UTC";
    try {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: zone,
        timeZoneName: "longOffset",
      }).formatToParts(sample);
      const offsetPart = parts.find((p) => p.type === "timeZoneName");
      const raw = offsetPart?.value ?? "UTC";
      // `longOffset` yields "GMT+01:00" / "GMT-05:30" / "GMT" (for UTC).
      // Normalize to "UTC..." so the trigger label is consistent.
      offset = raw === "GMT" ? "UTC" : raw.replace(/^GMT/, "UTC");
    } catch {
      // keep the default "UTC"
    }
    return { value: zone, offset };
  });
})();

function labelFor(option: TimezoneOption | undefined): string {
  if (!option) return "";
  return `${option.value} (${option.offset})`;
}

function findOption(zones: TimezoneOption[], value: string): TimezoneOption | undefined {
  if (!value) return undefined;
  return zones.find((z) => z.value === value);
}

export interface TimezoneComboboxProps {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  "aria-describedby"?: string;
  /** Optional id of an element describing the field (rendered in `aria-describedby`). */
  descriptionId?: string;
  /** Optional id of a help text element under the trigger. */
  helpId?: string;
}

export function TimezoneCombobox({
  value,
  onChange,
  id,
  name,
  required,
  descriptionId,
  helpId,
}: TimezoneComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const autoId = React.useId();
  const triggerId = id ?? `tz-trigger-${autoId}`;
  const listboxId = `${triggerId}-listbox`;
  const optionId = (index: number) => `${listboxId}-opt-${index}`;

  const selected = React.useMemo(() => findOption(ALL_ZONES, value), [value]);
  const selectedLabel = labelFor(selected);

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return ALL_ZONES;
    return ALL_ZONES.filter((z) => z.value.toLowerCase().includes(needle));
  }, [search]);

  // Scroll the active option into view as the user arrows.
  React.useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function commit(option: TimezoneOption) {
    onChange(option.value);
    setOpen(false);
    setSearch("");
  }

  function onSearchChange(next: string) {
    setSearch(next);
    // Reset the highlight to the first match so the keyboard nav
    // starts at the top of the new filtered list.
    setActiveIndex(0);
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = filtered[activeIndex];
      if (pick) commit(pick);
    } else if (event.key === "Escape") {
      // Let Radix handle the close + focus return; just clear the search.
      setSearch("");
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(filtered.length - 1, 0));
    }
  }

  return (
    <div className="space-y-1.5">
      {/* Hidden input drives form submission. The form action reads
          formData.get("timezone") and the schema validates it. */}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={triggerId}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-required={required || undefined}
            aria-describedby={helpId ?? descriptionId}
            onKeyDown={onTriggerKeyDown}
            className={cn(
              controlClass,
              "flex items-center justify-between gap-2 text-start",
              !selected && "text-fg-muted",
            )}
            data-testid="timezone-combobox-trigger"
          >
            <span className="truncate">{selected ? selectedLabel : "Select a timezone"}</span>
            <ChevronDown
              className={cn(
                "text-fg-muted h-4 w-4 shrink-0 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <div className="border-border flex items-center gap-2 border-b px-3">
            <Search className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              role="searchbox"
              autoComplete="off"
              spellCheck={false}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search timezone…"
              aria-controls={listboxId}
              aria-activedescendant={filtered.length > 0 ? optionId(activeIndex) : undefined}
              className="text-body text-fg-primary placeholder:text-fg-muted h-10 w-full bg-transparent focus:outline-none"
              data-testid="timezone-combobox-search"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="text-fg-muted hover:text-fg-primary focus-visible:ring-focus-ring rounded p-1 focus:outline-none focus-visible:ring-2"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Timezones"
            className="max-h-72 overflow-y-auto py-1"
            data-testid="timezone-combobox-listbox"
          >
            {filtered.length === 0 ? (
              <p className="text-body text-fg-muted px-3 py-6 text-center">
                No timezones match “{search}”.
              </p>
            ) : (
              filtered.map((option, index) => {
                const isActive = index === activeIndex;
                const isSelected = option.value === value;
                return (
                  <button
                    type="button"
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    data-option-index={index}
                    key={option.value}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commit(option)}
                    className={cn(
                      "text-body flex w-full items-center gap-2 px-3 py-2 text-start",
                      "focus:outline-none",
                      isActive && "bg-surface-subtle",
                      isSelected && "font-semibold",
                    )}
                  >
                    <span className="flex-1 truncate">
                      <span className="text-fg-primary">{option.value}</span>
                      <span className="text-fg-muted ms-2">({option.offset})</span>
                    </span>
                    {isSelected ? (
                      <Check className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
