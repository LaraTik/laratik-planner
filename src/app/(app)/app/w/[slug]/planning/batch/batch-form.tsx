"use client";
import { useActionState, useMemo, useState } from "react";
import { batchCreateAction } from "../actions";
import { Button } from "@/components/ui/button";
import { DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { parseBatchRows } from "@/lib/content/batch";

/**
 * Batch add form. Each line is one content item. The v1
 * format was `title | format | date | brief`; the v2 format
 * (added in the format-payload editor commit) extends with
 * three optional trailing fields:
 *
 *   title | format | date | brief | caption | #tag1 #tag2 | "Dubai Mall" | "fb-123"
 *
 * The preview below the textarea shows the parsed row count
 * + per-line errors before the planner submits, so a row with
 * an over-length caption or unknown format shows up inline
 * instead of failing the whole batch on the server.
 *
 * The textarea uses content-aware direction detection, with the
 * active interface locale as the fallback for an empty field. This
 * keeps Arabic pasted content RTL without making the batch syntax
 * itself locale-dependent.
 */
export function BatchForm({ slug }: { slug: string }) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const [state, action] = useActionState(
    batchCreateAction.bind(null, slug),
    {} as { error?: string },
  );
  const [rows, setRows] = useState<string>("");
  const parsed = useMemo(() => parseBatchRows(rows), [rows]);
  const errorCount = parsed.filter((r) => "parseError" in r).length;

  return (
    <form action={action} className="space-y-4">
      <label className="text-body block font-semibold" htmlFor="rows">
        {t("batchAdd.form.rowsLabel")}
      </label>
      <DirAwareTextarea
        id="rows"
        name="rows"
        required
        rows={12}
        value={rows}
        onChange={(e) => setRows(e.target.value)}
        locale={locale}
        className="min-h-11 w-full font-mono"
        placeholder={t("batchAdd.form.placeholder")}
      />
      {rows.trim().length > 0 ? (
        <p className="text-label text-fg-muted" data-testid="batch-row-count">
          {t(parsed.length === 1 ? "batchAdd.form.rowOne" : "batchAdd.form.rowMany", {
            count: parsed.length,
          })}
          {errorCount > 0 ? ` · ${t("batchAdd.form.withErrors", { count: errorCount })}` : ""}
        </p>
      ) : null}
      {errorCount > 0 ? (
        <ul
          className="border-danger-subtle bg-danger-subtle text-label text-danger space-y-1 rounded-[var(--radius-control)] border p-2"
          data-testid="batch-row-errors"
        >
          {parsed
            .filter((r) => "parseError" in r)
            .slice(0, 10)
            .map((r) => (
              <li key={r.lineNumber}>
                {t("batchAdd.form.rowError", { line: r.lineNumber })}:{" "}
                {"parseError" in r ? r.parseError : ""}
              </li>
            ))}
        </ul>
      ) : null}
      {state?.error ? (
        <p role="alert" className="text-label text-danger font-semibold">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <FormSubmitButton
          label={t("batchAdd.form.createDrafts")}
          pendingLabel={t("batchAdd.form.creating")}
        />
        <Button variant="ghost" asChild>
          <a href={`/app/w/${slug}/planning`}>{t("batchAdd.form.cancel")}</a>
        </Button>
      </div>
    </form>
  );
}
