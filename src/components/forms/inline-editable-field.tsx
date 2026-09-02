"use client";

import * as React from "react";
import { useTransition } from "react";
import { Pencil, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

/**
 * InlineEditableField — a field that the user can edit
 * in place without leaving the page. The "view" state shows
 * the rendered value; clicking the pencil switches to the
 * "edit" state. The save action is a server action passed
 * by the parent; the component owns the local edit buffer
 * and the pending state.
 *
 * Use cases:
 *  - Brief on the planning detail page
 *  - Publish date on the planning detail page
 *  - Any single field the planner wants to tweak without
 *    jumping to the dedicated edit page
 *
 * Why not a full inline-edit form for every field: the
 * planning detail page is dense, and a per-field pencil
 * per field makes the page noisy. The compact form below
 * is the right ergonomics for "small change" updates.
 */

export interface InlineEditableFieldProps<TValue> {
  /** What the parent renders when the field is in view mode. */
  render: (value: TValue) => React.ReactNode;
  /**
   * What the parent renders when the field is in edit mode.
   * The component passes the current edit buffer and an
   * `onChange` setter; the parent decides what input
   * controls to use.
   */
  renderEditor: (args: {
    value: TValue;
    onChange: (next: TValue) => void;
    errorId: string;
  }) => React.ReactNode;
  /** Initial value. */
  value: TValue;
  /**
   * Server action called on Save. Returns `{ error? }` on
   * failure. The component keeps the user in edit mode
   * when the action errored so they can fix and retry.
   * Also accepts any truthy return value (e.g. `{ ok: true }`)
   * for symmetry with the existing server-action contract.
   */
  onSave: (next: TValue) => Promise<{ error?: string; ok?: true } | void | undefined>;
  /** Optional synchronous validation for immediate field-level feedback. */
  validate?: (value: TValue) => string | undefined;
  /** ARIA label for the edit button. */
  label: string;
  /** Test id prefix. */
  testId?: string;
  /** Show the pencil only on hover. Default false. */
  revealOnHover?: boolean;
  /** Visual treatment for the container. */
  className?: string;
  /**
   * Optional extra action buttons (e.g. "Reset to default")
   * rendered next to Save / Cancel. They're only visible
   * in edit mode.
   */
  extraActions?: React.ReactNode;
}

export function InlineEditableField<TValue>({
  render,
  renderEditor,
  value,
  onSave,
  validate,
  label,
  testId,
  revealOnHover = false,
  className,
  extraActions,
}: InlineEditableFieldProps<TValue>) {
  const t = useLocaleT();
  const [editing, setEditing] = React.useState(false);
  const [buffer, setBuffer] = React.useState<TValue>(value);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = useTransition();
  const groupRef = React.useRef<HTMLDivElement | null>(null);

  // Reset the buffer when the value changes (e.g. another
  // tab saved a new version). The reset only happens when
  // we're NOT in edit mode; mid-edit the buffer is the
  // user's in-progress work.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setBuffer(value);
  }, [value, editing]);

  const beginEdit = () => {
    setBuffer(value);
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setBuffer(value);
    setError(null);
    setEditing(false);
  };
  const save = () => {
    const validationError = validate?.(buffer);
    if (validationError) {
      setError(validationError);
      return;
    }
    start(async () => {
      const result = await onSave(buffer);
      if (result?.error) {
        setError(result.error);
      } else {
        setEditing(false);
        setError(null);
      }
    });
  };

  // Cmd/Ctrl+Enter to save, Escape to cancel — keyboard
  // first ergonomics for users on the planning detail page
  // (a primary keyboard-driven surface).
  React.useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    const node = groupRef.current;
    node?.addEventListener("keydown", onKey);
    return () => node?.removeEventListener("keydown", onKey);
    // We intentionally omit `save` and `cancel` from the deps:
    // they're stable callbacks that read the current state via
    // React's closure-on-render model. Re-attaching the
    // listener on every save/cancel rebuild would defeat the
    // purpose of the memoised handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, buffer]);

  const errorId = testId ? `${testId}-error` : "inline-edit-error";

  return (
    <div
      ref={groupRef}
      className={cn(
        "group/field relative",
        revealOnHover && "hover:bg-surface-subtle rounded-[var(--radius-control)]",
        className,
      )}
      data-testid={testId}
      data-editing={editing ? "true" : "false"}
    >
      {editing ? (
        <div className="space-y-2">
          {renderEditor({ value: buffer, onChange: setBuffer, errorId })}
          {error ? (
            <p
              id={errorId}
              role="alert"
              aria-live="assertive"
              className="text-label text-danger font-semibold"
              data-testid={`${testId ?? "inline-edit"}-error`}
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              // size="default" → 40px control. The previous
              // `sm` (36px) was below the studio's 40px
              // standard and tight on touch. The full editor
              // view already uses default-sized buttons.
              size="default"
              onClick={save}
              disabled={pending}
              data-testid={testId ? `${testId}-save` : undefined}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {pending ? t("common.saving") : t("common.save")}
            </Button>
            <Button
              size="default"
              variant="ghost"
              onClick={cancel}
              disabled={pending}
              data-testid={testId ? `${testId}-cancel` : undefined}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {t("common.cancel")}
            </Button>
            {extraActions}
            <span className="text-label text-fg-muted ms-auto inline-flex items-center gap-1">
              <kbd className="border-border bg-canvas rounded border px-1.5 py-0.5 font-mono text-[10px]">
                ⌘↵
              </kbd>{" "}
              {t("common.keyboardSave")} ·{" "}
              <kbd className="border-border bg-canvas rounded border px-1.5 py-0.5 font-mono text-[10px]">
                Esc
              </kbd>{" "}
              {t("common.keyboardCancel")}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{render(value)}</div>
          <Button
            // size="icon" → 40×40 (project standard for icon
            // buttons; matches `--control-standard`). 32×32 was
            // below the WCAG 2.2 AA 24×24 minimum and the
            // studio's own 40×40 icon convention.
            size="icon"
            variant="ghost"
            onClick={beginEdit}
            aria-label={t("common.editField", { field: label })}
            data-testid={testId ? `${testId}-edit` : undefined}
            className={cn(
              // Two visibility modes:
              //  - Default (`revealOnHover=false`): the pencil
              //    is always visible at 50% opacity on rest,
              //    100% on hover/focus. Discoverable on touch
              //    devices, calm on desktop. The hover/focus
              //    state is also reinforced by the underlying
              //    `variant="ghost"` background change.
              //  - Opt-in `revealOnHover=true`: hidden at rest
              //    (e.g. inside a dense table row), 100% on
              //    hover/focus via the field group.
              revealOnHover
                ? "opacity-0 group-focus-within/field:opacity-100 group-hover/field:opacity-100"
                : "opacity-50 hover:opacity-100 focus-visible:opacity-100",
              "transition-opacity",
            )}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
