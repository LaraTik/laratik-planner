import { describe, expect, it } from "vitest";
import { deriveCreativeApprovalOutcome } from "@/lib/deliveries/approval-workflow";

describe("creative approval workflow", () => {
  it("moves a simple internal approval to ready to publish", () => {
    expect(
      deriveCreativeApprovalOutcome({
        gate: "creative_internal",
        decision: "approved",
        approvalMode: "simple",
      }),
    ).toEqual({
      contentStatus: "ready_to_publish",
      createClientRequest: false,
      markDeliveryFinal: true,
      changeRequestGate: null,
      statusReturnTarget: null,
    });
  });

  it("opens client review after internal approval when configured", () => {
    expect(
      deriveCreativeApprovalOutcome({
        gate: "creative_internal",
        decision: "approved",
        approvalMode: "internal_then_client",
      }),
    ).toMatchObject({
      contentStatus: "creative_review",
      createClientRequest: true,
      markDeliveryFinal: false,
    });
  });

  it("marks the exact delivery final after client approval", () => {
    expect(
      deriveCreativeApprovalOutcome({
        gate: "creative_client",
        decision: "approved",
        approvalMode: "internal_then_client",
      }),
    ).toMatchObject({
      contentStatus: "ready_to_publish",
      createClientRequest: false,
      markDeliveryFinal: true,
    });
  });

  it("returns creative changes to design with the originating gate", () => {
    expect(
      deriveCreativeApprovalOutcome({
        gate: "creative_client",
        decision: "changes_requested",
        approvalMode: "internal_then_client",
      }),
    ).toMatchObject({
      contentStatus: "changes_requested",
      createClientRequest: false,
      markDeliveryFinal: false,
      changeRequestGate: "creative_client",
      statusReturnTarget: "in_design",
    });
  });
});
