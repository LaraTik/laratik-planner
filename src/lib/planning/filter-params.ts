import {
  ALL_FORMATS,
  ALL_STATUSES,
  type ContentFormat,
  type ContentStatus,
} from "@/lib/content/status";
import type { HealthSnapshot } from "@/lib/dashboard/health";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Values exposed by the planning toolbar's workflow-stage selector. */
export const PLANNING_STAGE_VALUES = [
  "draft",
  "content_review",
  "approved_for_design",
  "creative_review",
  "ready_to_publish",
] as const satisfies readonly ContentStatus[];
export type PlanningStage = (typeof PLANNING_STAGE_VALUES)[number];

const HEALTH_VALUES: readonly HealthSnapshot[] = [
  "at_risk",
  "overdue",
  "blocked",
  "needs_review",
  "not_started",
  "ready",
  "in_progress",
  "published",
  "cancelled",
  "scheduled",
];

export type PlanningFilterInput = {
  status?: string;
  format?: string;
  stage?: string;
  owner?: string;
  channel?: string;
  health?: string;
  risk?: string;
  density?: string;
  search?: string;
};

export type PlanningFilterSelection = {
  status?: ContentStatus;
  format?: ContentFormat;
  stage?: PlanningStage;
  ownerId?: string;
  channelId?: string;
  healthIn?: readonly HealthSnapshot[];
  risk?: "at_risk";
  density: "comfortable" | "compact";
  searchTerm?: string;
};

function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID_PATTERN.test(value);
}

function isHealth(value: string): value is HealthSnapshot {
  return HEALTH_VALUES.includes(value as HealthSnapshot);
}

/**
 * Parse the planning URL contract once at the server boundary.
 * Invalid values are ignored so a hand-edited URL cannot widen a query or
 * inject an unsupported enum into the database layer.
 */
export function parsePlanningFilterParams(input: PlanningFilterInput): PlanningFilterSelection {
  const result: PlanningFilterSelection = {
    density: input.density === "compact" ? "compact" : "comfortable",
  };

  if (input.status && (ALL_STATUSES as readonly string[]).includes(input.status)) {
    result.status = input.status as ContentStatus;
  }
  if (input.format && (ALL_FORMATS as readonly string[]).includes(input.format)) {
    result.format = input.format as ContentFormat;
  }
  if (input.stage && (PLANNING_STAGE_VALUES as readonly string[]).includes(input.stage)) {
    result.stage = input.stage as PlanningStage;
  }
  if (isUuid(input.owner)) result.ownerId = input.owner;
  if (isUuid(input.channel)) result.channelId = input.channel;

  const healthIn = input.health
    ?.split(",")
    .map((value) => value.trim())
    .filter((value): value is HealthSnapshot => isHealth(value));
  if (healthIn && healthIn.length > 0) {
    result.healthIn = [...new Set(healthIn)];
  }
  if (input.risk === "at_risk") result.risk = "at_risk";
  const searchTerm = input.search?.trim();
  if (searchTerm) result.searchTerm = searchTerm;

  return result;
}
