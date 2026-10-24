export type CommunityConversationState =
  | "new"
  | "open"
  | "assigned"
  | "waiting_customer"
  | "waiting_approval"
  | "resolved"
  | "reopened"
  | "spam";

/** Keep routing changes from reopening resolved conversations or changing other workflow states. */
export function stateAfterAssignment(current: string, assigneeId: string | null): string {
  if (assigneeId && ["new", "open", "reopened", "assigned"].includes(current)) {
    return "assigned";
  }
  if (!assigneeId && current === "assigned") return "open";
  return current;
}
