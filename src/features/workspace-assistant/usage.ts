/**
 * Estimate provider input usage from the complete bounded request before
 * reserving agency budget. Two characters per token is intentionally
 * conservative for mixed English/Arabic text; provider-reported usage still
 * reconciles the reservation after the call.
 */
export function estimateWorkspaceAssistantInputTokens(
  messages: readonly { content: string }[],
): number {
  const characterCount = messages.reduce((total, message) => total + message.content.length, 0);
  const perMessageOverhead = messages.length * 8;
  const safetyMargin = 256;
  return Math.max(1, Math.ceil((characterCount + perMessageOverhead) / 2) + safetyMargin);
}
