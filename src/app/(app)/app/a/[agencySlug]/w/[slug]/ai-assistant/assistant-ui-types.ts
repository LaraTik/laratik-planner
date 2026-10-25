export type AssistantProposal = {
  id: string;
  contentItemId: string;
  field: "title" | "brief" | "plannedPublishAt";
  title: string;
  beforeValue: string;
  afterValue: string;
  evidenceIds: string[];
  status:
    "proposed" | "applied" | "rejected" | "stale" | "expired" | "already_applied" | "applying";
  expiresAt: string;
};

export type AssistantReply = {
  answer: {
    answer: string;
    findings: {
      title: string;
      detail: string;
      severity: "low" | "medium" | "high";
      evidenceIds: string[];
    }[];
    recommendations: { title: string; detail: string; evidenceIds: string[] }[];
    proposedChanges: [];
    limitations: string[];
  };
  evidence: {
    id: string;
    source: string;
    retrievedAt: string;
    period: string;
    version?: string | null;
    completeness: string;
    itemCount: number;
  }[];
  deterministicFindings: {
    title: string;
    detail: string;
    severity: string;
    evidenceIds: string[];
  }[];
  referencedItem?: { id: string; title: string; revision: number } | null;
  reviewedPlanMonth?: string;
  proposals: AssistantProposal[];
};

export type AssistantResponseLabels = {
  reviewedPlan: string;
  selectedContent: string;
  findGaps: string;
  findings: string;
  recommendations: string;
  evidence: string;
  proposedEdits: string;
  applySelectedEdits: string;
  applyingSelectedEdits: string;
  selectProposal: string;
  editApplied: string;
  editRejected: string;
  editStale: string;
  editExpired: string;
  applyingEdit: string;
  before: string;
  after: string;
  applyEdit: string;
  rejectEdit: string;
  editStatusError: string;
  limitations: string;
  source: string;
  itemCount: string;
  capturedAt: string;
  boundedData: string;
  completeData: string;
};
