export const DEFAULT_LEAD_TIMES = {
  contentApprovalLeadDays: 10,
  designCompleteLeadDays: 5,
  creativeApprovalLeadDays: 2,
  readyToPublishLeadDays: 1,
} as const;

export type LeadTimeValues = {
  contentApprovalLeadDays: number;
  designCompleteLeadDays: number;
  creativeApprovalLeadDays: number;
  readyToPublishLeadDays: number;
};

export function hasCustomLeadTimes(values: LeadTimeValues): boolean {
  return (
    values.contentApprovalLeadDays !== DEFAULT_LEAD_TIMES.contentApprovalLeadDays ||
    values.designCompleteLeadDays !== DEFAULT_LEAD_TIMES.designCompleteLeadDays ||
    values.creativeApprovalLeadDays !== DEFAULT_LEAD_TIMES.creativeApprovalLeadDays ||
    values.readyToPublishLeadDays !== DEFAULT_LEAD_TIMES.readyToPublishLeadDays
  );
}
