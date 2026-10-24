import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { makeCreativeExportSheets } from "@/features/content/planning-xlsx-creative.server";
import type { PlanningXlsxLabels } from "@/features/content/planning-xlsx-export.server";
import type { CreativeExportData } from "@/features/content/planning-xlsx-export-data.server";

const labels = {
  locale: "ar",
  creativeHandoffTitle: "التسليم الإبداعي",
  channelCopyTitle: "نصوص القنوات",
  itemId: "المعرّف",
  plannedPublishAt: "موعد النشر",
  title: "العنوان",
  format: "التنسيق",
  brief: "الموجز",
  contentLanguage: "اللغة",
  caption: "التعليق",
  hashtags: "الوسوم",
  hook: "الافتتاحية",
  mainMessage: "الرسالة",
  callToAction: "الإجراء",
  audience: "الجمهور",
  visualDirection: "التوجيه البصري",
  onImageText: "نص الصورة",
  onScreenText: "نص الشاشة",
  coverDirection: "الغلاف",
  voiceOverNotes: "التعليق الصوتي",
  formatOutline: "المخطط",
  mediaRequired: "الوسائط مطلوبة",
  yes: "نعم",
  no: "لا",
  weekday: "اليوم",
  requestedPlatforms: "المنصات",
  requiredImageLinks: "الصور المطلوبة",
  designReadyLink: "التصميم النهائي",
  references: "المراجع",
  firstComment: "التعليق الأول",
  additionalNotes: "ملاحظات إضافية",
  publicationStatus: "حالة النشر",
  channel: "القناة",
  channelCaption: "تعليق القناة",
  channelHashtags: "وسوم القناة",
  channelFirstComment: "تعليق القناة الأول",
  channelDescription: "وصف القناة",
  channelCallToAction: "إجراء القناة",
  channelCallToActionUrl: "رابط الإجراء",
  destinationUrl: "رابط الوجهة",
  captionSource: "مصدر التعليق",
  hashtagsSource: "مصدر الوسوم",
  channelOverride: "مخصص للقناة",
  sharedDraft: "المسودة المشتركة",
  briefFallback: "الموجز الاحتياطي",
  noContent: "لا يوجد محتوى",
  formatLabels: { short_form_video: "فيديو قصير" },
} as unknown as PlanningXlsxLabels;

const item = {
  id: "content-1",
  title: "حملة عربية",
  format: "short_form_video" as const,
  plannedPublishAt: new Date("2026-10-24T12:30:00.000Z"),
  brief: "موجز الحملة",
};

const data: ReadonlyMap<string, CreativeExportData> = new Map([
  [
    "content-1",
    {
      mediaRequired: false,
      payload: {
        contentLanguage: "ar",
        caption: "رسالة عربية",
        hashtags: ["#عربي", "#حملة"],
        visualDirection: "ألوان دافئة",
        onImageText: "ابدأ اليوم",
        requiredImageLinks: ["https://example.com/image.png"],
        designReadyLink: "https://example.com/design.png",
        references: ["https://example.com/reference"],
        additionalNotes: "تفاصيل إضافية",
        scenes: [{ position: 1, summary: "المشهد الأول", durationSeconds: 4 }],
      },
      channels: [
        {
          socialChannelId: "channel-1",
          platform: "instagram",
          accountName: "Brand AR",
          plannedPublishAtOverride: null,
          caption: null,
          callToAction: null,
          hashtags: [],
          platformPayload: {
            caption: "نسخة إنستغرام",
            hashtags: ["#إنستغرام"],
            firstComment: "تعليق خاص بالقناة",
            callToAction: { label: "تسوق الآن", url: "https://example.com/shop" },
          },
        },
        {
          socialChannelId: "channel-2",
          platform: "facebook",
          accountName: "Brand AR",
          plannedPublishAtOverride: null,
          caption: "نسخة فيسبوك",
          callToAction: null,
          hashtags: [],
          platformPayload: {},
        },
      ],
    },
  ],
]);

describe("planning XLSX creative sheets", () => {
  it("exports Arabic creative handoff fields with readable outlines and RTL wrapping", () => {
    const [handoff] = makeCreativeExportSheets([item], data, "UTC", labels);

    expect(handoff.rightToLeft).toBe(true);
    expect(handoff.wrapText).toBe(true);
    expect(handoff.rows[1]).toContain("رسالة عربية");
    expect(handoff.rows[1]).toContain("#عربي\n#حملة");
    expect(handoff.rows[1]).toContain("ألوان دافئة");
    expect(handoff.rows[1]).toContain("https://example.com/image.png");
    expect(handoff.rows[1]).toContain("1. المشهد الأول (4s)");
    expect(handoff.rows[1]).toContain("لا");
  });

  it("exports effective per-channel captions, hashtags and CTA, honoring the channel filter", () => {
    const [, channelCopy] = makeCreativeExportSheets([item], data, "UTC", labels, "channel-1");

    expect(channelCopy.rows).toHaveLength(2);
    expect(channelCopy.rows[1]).toContain("instagram: Brand AR");
    expect(channelCopy.rows[1]).toContain("نسخة إنستغرام");
    expect(channelCopy.rows[1]).toContain("#إنستغرام");
    expect(channelCopy.rows[1]).toContain("تعليق خاص بالقناة");
    expect(channelCopy.rows[1]).toContain("تسوق الآن");
    expect(channelCopy.rows[1]).toContain("مخصص للقناة");
    expect(channelCopy.rows).not.toContainEqual(expect.arrayContaining(["facebook: Brand AR"]));
  });
});
