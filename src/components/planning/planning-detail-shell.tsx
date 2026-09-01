"use client";

import * as React from "react";
import { WorkflowRail, type WorkflowRailBodyProps } from "./workflow-rail";
import { WorkspaceShell } from "@/app/(app)/app/w/[slug]/planning/[id]/workspace-shell";
import type { WorkspaceTab, WorkspaceTabId } from "./workspace-tabs";
import type { CommentRecord, CommentRoleFlags } from "@/components/comments/comment-item";
import type { ResetIdeaCounts } from "@/lib/content/reset-idea-shared";

/**
 * Props that feed the right rail (workflow + approvals). Serialised
 * to the client by the page's Server Component.
 */
export type PlanningDetailShellWorkflowProps = WorkflowRailBodyProps;

/**
 * Props that feed the tabbed workspace body (tab strip + panels +
 * discussion drawer + operator overflow). Serialised to the client.
 */
export interface PlanningDetailShellWorkspaceProps {
  workspaceSlug: string;
  contentItemId: string;
  ideaTitle: string;
  comments: CommentRecord[];
  currentUserId: string;
  roles: CommentRoleFlags;
  canPostInternal: boolean;
  canPostClientVisible: boolean;
  tabs: WorkspaceTab[];
  panels: Partial<Record<WorkspaceTabId, React.ReactNode>>;
  canResetIdea: boolean;
  resetCounts: ResetIdeaCounts;
  activityCount: number;
  openCommentCount: number;
  mentionCount: number;
  /**
   * Bound translator from the parent planning detail page.
   * Threaded to `<WorkspaceShell>` (and onward to the
   * discussion drawer + comments + composer + mention
   * picker) so the discussion surface renders in the
   * active locale.
   */
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * PlanningDetailShell — the three-zone application shell for the
 * planning content detail page.
 *
 * Replaces the previous page-level `<div className="space-y-6">`
 * pattern where the workflow card sat *above* the tabbed workspace
 * in a vertical stack. The new structure on `xl+`:
 *
 *   ┌──────────────────────────────────────────┬──────────────────┐
 *   │ Header (PlanningHeader)                  │                  │
 *   │                                          │  WorkflowRail    │
 *   │ Workspace tabs (sticky)                  │  (sticky,        │
 *   │ ──────────────────────────────────       │   320px)         │
 *   │ Active tab panel                         │  ↕ localStorage  │
 *   │                                          │    collapsed     │
 *   │ Footer (audit row)                       │    state         │
 *   └──────────────────────────────────────────┴──────────────────┘
 *
 * Responsive:
 *   - `<lg`  (mobile): the right rail is **not rendered**. The page
 *     renders a `WorkflowSheet` trigger pill alongside the header
 *     instead, which opens a bottom sheet.
 *   - `lg` (1024–1279): the right rail renders in its
 *     localStorage-persisted collapsed/expanded state. The user
 *     can collapse it to a 56px icon rail for more working room.
 *   - `xl+` (1280+): the right rail is always present in the
 *     same state. On a standard laptop, the default is expanded
 *     (`300px`).
 *
 * The collapsed/expanded state is owned by the `WorkflowRail`
 * component itself (which already has localStorage persistence);
 * the shell doesn't duplicate the state. The shell's only
 * responsibility is the grid layout and the right-rail wrapper.
 */
export interface PlanningDetailShellProps {
  /** Center-column header (PlanningHeader). */
  header: React.ReactNode;
  /** Center-column footer (audit row). */
  footer?: React.ReactNode;
  /** Workflow props for the right rail. */
  workflow: PlanningDetailShellWorkflowProps;
  /** Workspace props for the tabbed center body. */
  workspace: PlanningDetailShellWorkspaceProps;
}

export function PlanningDetailShell({
  header,
  footer,
  workflow,
  workspace,
}: PlanningDetailShellProps) {
  return (
    <div className="space-y-4" data-testid="planning-detail-shell">
      {/* Header — spans the full center column. */}
      <div data-testid="planning-detail-header">{header}</div>

      {/* Center + right rail grid. The `lg` breakpoint only
          includes the rail if the user has expanded it (the
          `WorkflowRail` component renders a 56px collapsed icon
          rail by default at narrow widths, then a 300px full
          rail when expanded). At `<lg` the rail is hidden; the
          page renders a `WorkflowSheet` trigger pill in the
          header area. The grid template reserves the rail
          column at `lg+` regardless of collapsed/expanded so
          the center column doesn't reflow when the user
          toggles. */}
      <div
        className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto]"
        data-testid="planning-detail-grid"
      >
        {/* Center column — tabs + active panel. */}
        <section
          className="min-w-0 space-y-4"
          data-testid="planning-detail-center"
          aria-label="Content workspace"
        >
          <WorkspaceShell {...workspace} />
        </section>

        {/* Right rail — sticky so it stays visible while the
            user scrolls through long Content / Publishing
            workspaces. Page-level scrolling (no nested
            scrollers). Hidden at <lg because the WorkflowSheet
            is the mobile equivalent. The rail's own
            collapsed/expanded toggle (a chevron in its
            header) controls the rail's width inside this
            column. */}
        <aside
          className="sticky top-16 hidden self-start lg:block"
          data-testid="planning-detail-rail"
          aria-label="Workflow rail"
        >
          <WorkflowRail {...workflow} />
        </aside>
      </div>

      {footer ? <div data-testid="planning-detail-footer">{footer}</div> : null}
    </div>
  );
}
