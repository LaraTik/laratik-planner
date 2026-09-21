import "server-only";
import type { AgencyReachAggregate } from "../aggregate";

/**
 * The shared shape every report template consumes. Adding a new
 * metric means adding a field here AND extending the aggregate query;
 * the template never touches the DB.
 */

export interface Period {
  from: Date;
  to: Date;
  /** Short label for the PDF header. */
  label: string;
  /** `7d` | `30d` | `90d` | `custom`. */
  preset: "7d" | "30d" | "90d" | "custom";
}

export interface ReportTemplateContext {
  /** Agency-id of the requester. */
  agencyId: string;
  /** Workspaces included in the report. */
  workspaceIds: string[];
  /** Channels included in the report. */
  channelIds: string[];
  /** Time window for the report. */
  period: Period;
  /** Recipient display name (for the PDF cover). May be empty. */
  preparedFor: string;
}

export interface ReportTemplateSpec<TData = unknown> {
  /** Stable id, used in storage keys + the picker UI. */
  id: "analytics" | "post_engagement" | "ads_performance";
  /** Display label (already i18n-resolved by the caller). */
  label: string;
  /** Short blurb shown in the picker card. */
  blurb: string;
  /** Which Postgres aggregate this template needs. The renderer
   *  dispatches on this. */
  requires: "agency-reach";
  /** Fetch the data this template needs. Pure function of ctx. */
  load(ctx: ReportTemplateContext): Promise<TData>;
  /**
   * Render the PDF document for this template. We declare the
   * signature as a plain function-of-props — not a React.ComponentType
   * — because `React.ComponentType` is invariant in its `props`
   * argument, which collides with `TData = unknown` at the registry
   * level. A function signature is contravariant in args, so the
   * template's `TData` (e.g. `AgencyReachAggregate`) is assignable
   * to a function that consumes `unknown`.
   */
  render(props: { ctx: ReportTemplateContext; data: TData }): React.ReactElement;
}

export interface ResolvedTemplate {
  template: ReportTemplateSpec;
  /** Pre-fetched data for the render step. */
  data: unknown;
}

/* Re-export the aggregate type so callers don't have to chase imports. */
export type { AgencyReachAggregate };
