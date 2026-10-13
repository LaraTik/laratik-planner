ALTER TABLE "advertising_sync_state" DROP CONSTRAINT "advertising_sync_state_status_valid";--> statement-breakpoint
ALTER TABLE "advertising_sync_state" ADD CONSTRAINT "advertising_sync_state_status_valid" CHECK ("advertising_sync_state"."status" IN ('idle', 'running', 'partial', 'failed', 'dead_letter', 'paused'));
