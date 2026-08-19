export function deriveCreativeApprovalOutcome(input: {
  gate: "creative_internal" | "creative_client";
  decision: "approved" | "changes_requested";
  approvalMode: "simple" | "internal_then_client";
}): {
  contentStatus: "creative_review" | "ready_to_publish" | "changes_requested";
  createClientRequest: boolean;
  markDeliveryFinal: boolean;
  changeRequestGate: "creative_internal" | "creative_client" | null;
  statusReturnTarget: "in_design" | null;
} {
  if (input.decision === "changes_requested") {
    return {
      contentStatus: "changes_requested",
      createClientRequest: false,
      markDeliveryFinal: false,
      changeRequestGate: input.gate,
      statusReturnTarget: "in_design",
    };
  }
  if (input.gate === "creative_internal" && input.approvalMode === "internal_then_client") {
    return {
      contentStatus: "creative_review",
      createClientRequest: true,
      markDeliveryFinal: false,
      changeRequestGate: null,
      statusReturnTarget: null,
    };
  }
  return {
    contentStatus: "ready_to_publish",
    createClientRequest: false,
    markDeliveryFinal: true,
    changeRequestGate: null,
    statusReturnTarget: null,
  };
}
