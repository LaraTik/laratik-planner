-- Add an application-claim state so concurrent retries cannot create the
-- same approved proposal twice. Failed claims are returned to approved by
-- the route; applied rows retain their receipt for safe idempotent retries.
ALTER TABLE "planning_proposal" DROP CONSTRAINT "planning_proposal_status_valid";--> statement-breakpoint
ALTER TABLE "planning_proposal" ADD CONSTRAINT "planning_proposal_status_valid" CHECK ("planning_proposal"."status" IN ('draft', 'approved', 'applying', 'applied', 'stale', 'rejected'));
