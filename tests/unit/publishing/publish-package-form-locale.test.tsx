import { fireEvent, render, screen } from "@testing-library/react";
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
const secondSocialChannelId = "55555555-5555-4555-8555-555555555555";

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
      requiredTotal: 4,
      requiredCompleted: 0,
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
          workspaceTimezone="Europe/Berlin"
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
    expect(
      screen.getByTestId("publish-channel-tab-22222222-2222-4222-8222-222222222222"),
    ).toHaveTextContent("Instagram");
    expect(screen.getByTestId("publish-item-format")).toHaveValue("منشور ثابت");
    expect(screen.getByLabelText("النص البديل وإمكانية الوصول")).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("publish-save-draft")).toHaveTextContent("حفظ المسودة");
    expect(screen.getByTestId("publish-ready")).toHaveTextContent("جاهز للنشر");
  });

  it("links publish blockers to the section that resolves them", () => {
    render(
      <LocaleProvider locale="en">
        <PublishPackageForm
          workspaceId="33333333-3333-4333-8333-333333333333"
          workspaceSlug="food-game"
          workspaceTimezone="Europe/Berlin"
          contentItemId={contentItemId}
          itemTitle="Autumn campaign"
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
          readiness={{
            ...readiness,
            channels: [
              {
                ...readiness.channels[0]!,
                blockerCount: 1,
                issues: [
                  {
                    path: "channels[0].approvedDeliveryVersion",
                    code: "delivery_not_approved",
                    severity: "blocker",
                    message: "Approve a delivery version.",
                  },
                ],
              },
            ],
          }}
          canEdit={false}
          canApproveFinalCopy={false}
          canConfirmReadiness={false}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("publish-readiness-fix-delivery_not_approved")).toHaveAttribute(
      "href",
      "#assets-versions",
    );
  });

  it("shows readiness progress for the selected channel", () => {
    render(
      <LocaleProvider locale="en">
        <PublishPackageForm
          workspaceId="33333333-3333-4333-8333-333333333333"
          workspaceSlug="food-game"
          workspaceTimezone="Europe/Berlin"
          contentItemId={contentItemId}
          itemTitle="Autumn campaign"
          itemFormat="static_post"
          channels={[
            {
              id: "44444444-4444-4444-8444-444444444444",
              socialChannelId,
              platform: "instagram",
              accountName: "Food Game",
              payload: null,
            },
            {
              id: "66666666-6666-4666-8666-666666666666",
              socialChannelId: secondSocialChannelId,
              platform: "facebook",
              accountName: "Food Game Facebook",
              payload: null,
            },
          ]}
          deliveryVersions={[]}
          readiness={{
            ...readiness,
            requiredTotal: 99,
            requiredCompleted: 88,
            channels: [
              {
                ...readiness.channels[0]!,
                requiredTotal: 2,
                requiredCompleted: 1,
              },
              {
                socialChannelId: secondSocialChannelId,
                platform: "facebook",
                hasPayload: false,
                requiredTotal: 5,
                requiredCompleted: 4,
                blockerCount: 1,
                recommendationCount: 0,
                issues: [
                  {
                    path: "channels[1].payload.caption",
                    code: "missing_caption",
                    severity: "blocker",
                    message: "Add a caption before publishing.",
                  },
                ],
              },
            ],
          }}
          canEdit={false}
          canApproveFinalCopy={false}
          canConfirmReadiness={false}
        />
      </LocaleProvider>,
    );

    const checklist = screen.getByTestId("publish-readiness-checklist");
    expect(checklist).toHaveTextContent("1 of 2 required checks complete for this channel.");

    fireEvent.click(screen.getByTestId(`publish-channel-tab-${secondSocialChannelId}`));
    expect(checklist).toHaveTextContent("4 of 5 required checks complete for this channel.");
    expect(checklist).not.toHaveTextContent("88 of 99");
  });

  it("moves focus to the publish blocker resolution section", () => {
    const target = document.createElement("section");
    target.id = "assets-versions";
    target.tabIndex = -1;
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    try {
      render(
        <LocaleProvider locale="en">
          <PublishPackageForm
            workspaceId="33333333-3333-4333-8333-333333333333"
            workspaceSlug="food-game"
            workspaceTimezone="Europe/Berlin"
            contentItemId={contentItemId}
            itemTitle="Autumn campaign"
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
            readiness={{
              ...readiness,
              channels: [
                {
                  ...readiness.channels[0]!,
                  blockerCount: 1,
                  issues: [
                    {
                      path: "channels[0].approvedDeliveryVersion",
                      code: "delivery_not_approved",
                      severity: "blocker",
                      message: "Approve a delivery version.",
                    },
                  ],
                },
              ],
            }}
            canEdit={false}
            canApproveFinalCopy={false}
            canConfirmReadiness={false}
          />
        </LocaleProvider>,
      );

      fireEvent.click(screen.getByTestId("publish-readiness-fix-delivery_not_approved"));

      expect(target).toHaveFocus();
      expect(target.scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
    } finally {
      target.remove();
      window.history.replaceState(null, "", "#");
    }
  });

  it("opens the lazy delivery stage before focusing its blocker target", () => {
    const target = document.createElement("section");
    target.id = "assets-versions";
    target.tabIndex = -1;
    target.scrollIntoView = vi.fn();
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        document.body.appendChild(target);
        callback(0);
        return 1;
      });

    try {
      render(
        <LocaleProvider locale="en">
          <PublishPackageForm
            workspaceId="33333333-3333-4333-8333-333333333333"
            workspaceSlug="food-game"
            workspaceTimezone="Europe/Berlin"
            contentItemId={contentItemId}
            itemTitle="Autumn campaign"
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
            readiness={{
              ...readiness,
              channels: [
                {
                  ...readiness.channels[0]!,
                  blockerCount: 1,
                  issues: [
                    {
                      path: "channels[0].approvedDeliveryVersion",
                      code: "delivery_not_approved",
                      severity: "blocker",
                      message: "Approve a delivery version.",
                    },
                  ],
                },
              ],
            }}
            canEdit={false}
            canApproveFinalCopy={false}
            canConfirmReadiness={false}
          />
        </LocaleProvider>,
      );

      fireEvent.click(screen.getByTestId("publish-readiness-fix-delivery_not_approved"));

      expect(window.location.hash).toBe("#assets-versions");
      expect(target).toHaveFocus();
      expect(requestAnimationFrame).toHaveBeenCalled();
    } finally {
      requestAnimationFrame.mockRestore();
      target.remove();
      window.history.replaceState(null, "", "#");
    }
  });
});
