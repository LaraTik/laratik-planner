import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/w/[slug]/planning/[id]/publish/actions", () => ({
  confirmPublishReadinessAction: vi.fn(),
  recordInternalNoteAction: vi.fn(),
  savePublishPackageAction: vi.fn(),
  setFinalCopyApprovalAction: vi.fn(),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PublishPackageForm } from "@/app/(app)/app/w/[slug]/planning/[id]/publish/publish-package-form";
import type { ReadinessReport } from "@/lib/publishing/readiness";

const contentItemId = "11111111-1111-4111-8111-111111111111";
const socialChannelId = "22222222-2222-4222-8222-222222222222";

const readiness: ReadinessReport = {
  contentItemId,
  revision: 1,
  blockers: 0,
  recommendations: 0,
  requiredTotal: 0,
  requiredCompleted: 0,
  canPublish: false,
  issues: [],
  channels: [
    {
      socialChannelId,
      platform: "instagram",
      hasPayload: false,
      blockerCount: 0,
      recommendationCount: 0,
      issues: [],
    },
  ],
};

describe("PublishPackageForm localization", () => {
  it("renders Arabic publish labels and direction-aware alt text", () => {
    render(
      <LocaleProvider locale="ar">
        <PublishPackageForm
          workspaceId="33333333-3333-4333-8333-333333333333"
          workspaceSlug="food-game"
          contentItemId={contentItemId}
          itemTitle="حملة الخريف"
          itemFormat="static_post"
          channels={[
            {
              id: "44444444-4444-4444-8444-444444444444",
              socialChannelId,
              platform: "instagram",
              accountName: "Food Game",
              payload: null,
            },
          ]}
          deliveryVersions={[]}
          readiness={readiness}
          canEdit={false}
          canApproveFinalCopy={false}
          canConfirmReadiness={false}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText("الوجهة والتعليق")).toBeInTheDocument();
    expect(screen.getByText("إضافة ملاحظة داخلية")).toBeInTheDocument();
    expect(screen.getByLabelText("النص البديل وإمكانية الوصول")).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("publish-save-draft")).toHaveTextContent("حفظ المسودة");
    expect(screen.getByTestId("publish-ready")).toHaveTextContent("جاهز للنشر");
  });
});
