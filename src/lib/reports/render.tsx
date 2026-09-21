import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import * as React from "react";
import { getTemplate, listTemplates } from "./templates";
import type { ReportTemplateContext } from "./templates/types";

/**
 * Render a report PDF as a Node `Buffer` for the API route to
 * stream back. Pure server-side; never bundle on the client.
 *
 * Step 1: lookup the template by id.
 * Step 2: `template.load(ctx)` returns the typed aggregate.
 * Step 3: `template.render({ ctx, data })` returns the
 *         `<Document>` tree.
 * Step 4: `renderToBuffer` produces the PDF binary.
 */

export interface RenderReportOptions {
  templateId: string;
  ctx: ReportTemplateContext;
}

export interface RenderReportResult {
  /** The raw PDF bytes. */
  buffer: Buffer;
  /** The template id (echoed for downstream logging). */
  templateId: string;
  /** The user-visible title used by `Document.title`. */
  title: string;
  /** PDF size in bytes (post-render). */
  bytes: number;
  /** Suggested filename (without path). */
  suggestedFilename: string;
}

export async function renderReport(opts: RenderReportOptions): Promise<RenderReportResult> {
  const template = getTemplate(opts.templateId);
  if (!template) {
    throw new Error(`Unknown report template: ${opts.templateId}`);
  }
  const data = await template.load(opts.ctx);
  const doc = React.createElement(template.render, { ctx: opts.ctx, data });
  // `template.render(props)` returns `ReactElement<unknown, ...>` because
  // the spec is parametric on `TData`; React-PDF expects
  // `ReactElement<DocumentProps, ...>`. The two are structurally
  // compatible at runtime — the cast closes the type gap.
  const buffer = await renderToBuffer(doc as unknown as Parameters<typeof renderToBuffer>[0]);

  const filename = `${opts.templateId}-${opts.ctx.period.preset}-${opts.ctx.period.from
    .toISOString()
    .slice(0, 10)}-${opts.ctx.period.to.toISOString().slice(0, 10)}.pdf`;

  return {
    buffer,
    templateId: template.id,
    title: `${template.label}`,
    bytes: buffer.byteLength,
    suggestedFilename: filename,
  };
}

/** List every registered template id (for the API to validate a
    string before rendering). */
export function listRegisteredTemplateIds(): ReadonlyArray<string> {
  return listTemplates().map((t) => t.id);
}
