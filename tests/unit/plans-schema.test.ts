import { describe, expect, it } from "vitest";
import {
  agencyEntitlements,
  agencyEntitlementChanges,
  agencyUsageThresholdEvents,
  platformAuditEvents,
  platformPlanTemplates,
  agencyEntitlementGracePolicyEnum,
  agencyUsageThresholdLevelEnum,
} from "@/lib/db/schema";

/**
 * M2.1 — schema-level invariants for the plans / entitlements /
 * threshold-events / platform-audit tables. These tests are
 * deliberately type-level and structure-level: they assert that the
 * Drizzle schema has the right columns, the right nullability, the
 * right foreign-key relationships, and the right enum values, so a
 * typo in `src/lib/db/schema/plans.ts` is caught at the type level
 * before it ever reaches the DB.
 *
 * Tests that require a live Postgres (NOT NULL enforcement, FK
 * cascade behavior, the append-only trigger, threshold dedupe) live
 * in `tests/integration/plans-schema.test.ts`.
 */
describe("M2.1 plans schema — Drizzle shape", () => {
  describe("platform_plan_template", () => {
    it("exposes id / slug / name / description / defaultLimits / archivedAt / timestamps", () => {
      const columns = Object.keys(platformPlanTemplates);
      // Column names are camelCased in Drizzle even when the Postgres
      // column is snake_case. The Drizzle column map is the contract
      // that the service layer reads.
      expect(columns).toEqual(
        expect.arrayContaining([
          "id",
          "slug",
          "name",
          "description",
          "defaultLimits",
          "archivedAt",
          "createdAt",
          "updatedAt",
        ]),
      );
    });

    it("slug and name are NOT NULL at the Drizzle column level (NOT NULL discipline)", () => {
      // The Drizzle column builder is `notNull()` — guard against an
      // accidental `.notNull()` removal by reading the column
      // definition. `notNull: boolean` is part of the column metadata
      // exposed by Drizzle for both generators and runtime.
      const slugCol = platformPlanTemplates.slug;
      const nameCol = platformPlanTemplates.name;
      expect(slugCol.notNull).toBe(true);
      expect(nameCol.notNull).toBe(true);
    });

    it("description and defaultLimits and archivedAt are nullable (Optional fields)", () => {
      expect(platformPlanTemplates.description.notNull).toBe(false);
      expect(platformPlanTemplates.defaultLimits.notNull).toBe(false);
      expect(platformPlanTemplates.archivedAt.notNull).toBe(false);
    });
  });

  describe("agency_entitlement", () => {
    it("exposes agencyId / planTemplateId / overrides / hardStopPercent / gracePolicy / effectiveSince / timestamps", () => {
      const columns = Object.keys(agencyEntitlements);
      expect(columns).toEqual(
        expect.arrayContaining([
          "agencyId",
          "planTemplateId",
          "overrides",
          "hardStopPercent",
          "gracePolicy",
          "effectiveSince",
          "createdAt",
          "updatedAt",
        ]),
      );
    });

    it("agencyId is the primary key (one-to-one cardinality)", () => {
      // The PK enforces the "exactly one entitlement per agency"
      // shape the service layer relies on. A 1-to-N would force the
      // M2.2 service to pick a "current" row, which is a footgun.
      expect(agencyEntitlements.agencyId.primary).toBe(true);
    });

    it("plan_template_id is NOT NULL — every agency must point at a plan template", () => {
      // The whole point of the entitlement row is "this agency is on
      // this plan". An agency with plan_template_id IS NULL would be
      // a degenerate case the service layer has to special-case.
      expect(agencyEntitlements.planTemplateId.notNull).toBe(true);
    });

    it("overrides is nullable (null means use plan defaults verbatim)", () => {
      expect(agencyEntitlements.overrides.notNull).toBe(false);
    });

    it("hardStopPercent is NOT NULL with a numeric column type (preserves fractional percent)", () => {
      expect(agencyEntitlements.hardStopPercent.notNull).toBe(true);
      // numeric(5,2) → postgres dataType 'numeric' — Drizzle's
      // dataType discriminator is the shape, not a string. The
      // important assertion is that the value supports fractional
      // percents like 99.50, which a plain integer column would not.
      const dataType = agencyEntitlements.hardStopPercent.getSQLType();
      expect(dataType).toBe("numeric(5, 2)");
    });

    it("gracePolicy is nullable (null means inherit from plan / no override)", () => {
      expect(agencyEntitlements.gracePolicy.notNull).toBe(false);
    });
  });

  describe("agency_entitlement_change (append-only audit log)", () => {
    it("exposes id / agencyId / actorUserId / before / after / reason / createdAt", () => {
      const columns = Object.keys(agencyEntitlementChanges);
      expect(columns).toEqual(
        expect.arrayContaining([
          "id",
          "agencyId",
          "actorUserId",
          "before",
          "after",
          "reason",
          "createdAt",
        ]),
      );
    });

    it("agencyId, reason, before, after, createdAt are NOT NULL (every audit row has a payload)", () => {
      // The audit row is meaningless without a reason, a before, an
      // after, and a timestamp. The FK on agencyId + the
      // before/after/reason are all part of the "this row tells a
      // complete story" contract.
      expect(agencyEntitlementChanges.agencyId.notNull).toBe(true);
      expect(agencyEntitlementChanges.reason.notNull).toBe(true);
      expect(agencyEntitlementChanges.before.notNull).toBe(true);
      expect(agencyEntitlementChanges.after.notNull).toBe(true);
      expect(agencyEntitlementChanges.createdAt.notNull).toBe(true);
    });

    it("actorUserId is nullable (system-driven changes have no human actor)", () => {
      // A scheduled downgrade or a webhook-driven plan change has no
      // human actor. The audit row still exists; actor is null.
      expect(agencyEntitlementChanges.actorUserId.notNull).toBe(false);
    });
  });

  describe("agency_usage_threshold_event", () => {
    it("exposes id / agencyId / resource / percent / level / observedAt", () => {
      const columns = Object.keys(agencyUsageThresholdEvents);
      expect(columns).toEqual(
        expect.arrayContaining(["id", "agencyId", "resource", "percent", "level", "observedAt"]),
      );
    });

    it("agencyId, resource, percent, level, observedAt are NOT NULL", () => {
      // A row with a missing resource / level / agencyId is
      // unidentifiable. The Drizzle NOT NULL discipline plus the DB
      // CHECK on percent >= 0 is the contract.
      expect(agencyUsageThresholdEvents.agencyId.notNull).toBe(true);
      expect(agencyUsageThresholdEvents.resource.notNull).toBe(true);
      expect(agencyUsageThresholdEvents.percent.notNull).toBe(true);
      expect(agencyUsageThresholdEvents.level.notNull).toBe(true);
      expect(agencyUsageThresholdEvents.observedAt.notNull).toBe(true);
    });

    it("percent column is numeric(7, 2) (supports >100% for over_limit events)", () => {
      // 7 digits / 2 decimals → max value 99999.99. The over_limit
      // level can legitimately exceed 100% (a 110% observation is
      // what triggered the event), so the column must support that.
      const dataType = agencyUsageThresholdEvents.percent.getSQLType();
      expect(dataType).toBe("numeric(7, 2)");
    });
  });

  describe("platform_audit_event (append-only platform audit log)", () => {
    it("exposes id / actorUserId / action / target / before / after / ip / userAgent / createdAt", () => {
      const columns = Object.keys(platformAuditEvents);
      expect(columns).toEqual(
        expect.arrayContaining([
          "id",
          "actorUserId",
          "action",
          "target",
          "before",
          "after",
          "ip",
          "userAgent",
          "createdAt",
        ]),
      );
    });

    it("id, action, target, createdAt are NOT NULL (the row is meaningless without them)", () => {
      expect(platformAuditEvents.id.notNull).toBe(true);
      expect(platformAuditEvents.action.notNull).toBe(true);
      expect(platformAuditEvents.target.notNull).toBe(true);
      expect(platformAuditEvents.createdAt.notNull).toBe(true);
    });

    it("actorUserId, before, after, ip, userAgent are nullable (no actor / no before-after / no request context)", () => {
      // actorUserId: system-initiated actions have no human actor.
      // before/after: read-only actions (e.g. viewed) have no
      //                before/after. ip/userAgent: system actions
      //                have no HTTP request.
      expect(platformAuditEvents.actorUserId.notNull).toBe(false);
      expect(platformAuditEvents.before.notNull).toBe(false);
      expect(platformAuditEvents.after.notNull).toBe(false);
      expect(platformAuditEvents.ip.notNull).toBe(false);
      expect(platformAuditEvents.userAgent.notNull).toBe(false);
    });

    it("ip column uses Postgres INET (not text) so the platform can do range queries", () => {
      // INET is the right type for "an IP address from a request":
      // it validates format, supports IPv4+IPv6, and indexes for
      // range queries (e.g. "show me all events from this /24").
      const dataType = platformAuditEvents.ip.getSQLType();
      expect(dataType).toBe("inet");
    });
  });

  describe("enums", () => {
    it("agency_entitlement_grace_policy enum is exactly { 'block', 'allow_grace' }", () => {
      // The two-value enum is the contract the M2.4 service enforces
      // at the wire boundary. Adding a third value here is an
      // explicit breaking change — the trigger + merge logic + UI
      // pill would all need to be re-thought.
      const values = agencyEntitlementGracePolicyEnum.enumValues;
      expect(values).toEqual(["block", "allow_grace"]);
    });

    it("agency_usage_threshold_level enum is exactly { 'warning', 'urgent', 'over_limit' }", () => {
      // Same as above: the three-value enum maps 1:1 to the
      // threshold boundaries (80% / 90% / 100%+) the platform
      // console surfaces as a status pill. Adding a fourth value
      // would break the dedupe key + the UI rendering pipeline.
      const values = agencyUsageThresholdLevelEnum.enumValues;
      expect(values).toEqual(["warning", "urgent", "over_limit"]);
    });
  });
});
