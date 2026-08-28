/**
 * Settings templates (Phase C) — curated preset lead times,
 * approval modes, and lifecycle defaults the planner can
 * pick to seed a workspace's settings without writing the
 * numbers by hand.
 *
 * Why a static file: the templates are platform content, not
 * workspace content. Every workspace sees the same curated
 * list; the workspace's settings are the unique part.
 *
 * Adding a new template is a 2-line change here. The page at
 * /app/w/[slug]/settings/templates renders the list and the
 * 'Apply preset' button calls the matching per-section action.
 */

export type LeadTimeTemplate = {
  id: string;
  name: string;
  blurb: string;
  /** True when the preset is designed for the 2-step
   *  (internal + client) approval flow. The Apply action
   *  flips the approvalMode automatically. */
  forClientApproval: boolean;
  values: {
    contentApprovalLeadDays: number;
    designCompleteLeadDays: number;
    creativeApprovalLeadDays: number;
    readyToPublishLeadDays: number;
  };
};

export const leadTimeTemplates: readonly LeadTimeTemplate[] = [
  {
    id: "lead-fast",
    name: "Fast (8 days)",
    blurb: "Lean team, daily cadence, low review depth. Use when speed > polish.",
    forClientApproval: false,
    values: {
      contentApprovalLeadDays: 3,
      designCompleteLeadDays: 3,
      creativeApprovalLeadDays: 0,
      readyToPublishLeadDays: 2,
    },
  },
  {
    id: "lead-standard",
    name: "Standard (14 days)",
    blurb:
      "Most agencies. Two weeks end-to-end. Room for the writer's first pass + a creative pass.",
    forClientApproval: false,
    values: {
      contentApprovalLeadDays: 7,
      designCompleteLeadDays: 4,
      creativeApprovalLeadDays: 0,
      readyToPublishLeadDays: 3,
    },
  },
  {
    id: "lead-relaxed",
    name: "Relaxed (24 days)",
    blurb: "Monthly cadence, deep review, multiple stakeholders. Use when quality > speed.",
    forClientApproval: false,
    values: {
      contentApprovalLeadDays: 10,
      designCompleteLeadDays: 7,
      creativeApprovalLeadDays: 4,
      readyToPublishLeadDays: 3,
    },
  },
  {
    id: "lead-client",
    name: "Agency + client (22 days)",
    blurb: "Internal review + client review. The most common external-stakeholder workflow.",
    forClientApproval: true,
    values: {
      contentApprovalLeadDays: 7,
      designCompleteLeadDays: 5,
      creativeApprovalLeadDays: 4,
      readyToPublishLeadDays: 6,
    },
  },
];

export type ApprovalTemplate = {
  id: "simple" | "internal_then_client";
  label: string;
  blurb: string;
};

export const approvalTemplates: readonly ApprovalTemplate[] = [
  {
    id: "simple",
    label: "Internal approval only",
    blurb: "One approver. Faster cycle. Best for in-house content or single-stakeholder brands.",
  },
  {
    id: "internal_then_client",
    label: "Internal, then client",
    blurb: "Two approvers. Use when an external stakeholder signs off before publish.",
  },
];

export type MonthlyTargetTemplate = {
  id: string;
  name: string;
  blurb: string;
  value: number;
};

export const monthlyTargetTemplates: readonly MonthlyTargetTemplate[] = [
  {
    id: "monthly-12",
    name: "3 / week",
    blurb: "12 posts per month. A solid weekly cadence.",
    value: 12,
  },
  {
    id: "monthly-20",
    name: "5 / week",
    blurb: "20 posts per month. A common agency target.",
    value: 20,
  },
  { id: "monthly-30", name: "Daily", blurb: "30 posts per month. A high-volume brand.", value: 30 },
  {
    id: "monthly-60",
    name: "2 / day",
    blurb: "60 posts per month. Multi-channel or always-on brand.",
    value: 60,
  },
];

export const settingsTemplateSections = [
  {
    id: "lead-times",
    label: "Lead time presets",
    blurb: "Curated 4-number presets for common agency cadences.",
  },
  {
    id: "approvals",
    label: "Approval mode presets",
    blurb: "The two approval flows the workspace supports.",
  },
  {
    id: "monthly-target",
    label: "Monthly target presets",
    blurb: "Common post-per-month targets for the planning KPI bar.",
  },
] as const;
