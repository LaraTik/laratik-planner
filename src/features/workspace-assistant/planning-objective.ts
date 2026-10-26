import { z } from "zod";

export const planningObjectiveSchema = z
  .object({
    type: z.enum(["awareness", "engagement", "trust", "conversion", "custom"]),
    customText: z.string().trim().min(3).max(180).optional(),
  })
  .strict()
  .superRefine((objective, context) => {
    if (objective.type === "custom" && !objective.customText) {
      context.addIssue({
        code: "custom",
        path: ["customText"],
        message: "A custom planning objective needs a description",
      });
    }
    if (objective.type !== "custom" && objective.customText) {
      context.addIssue({
        code: "custom",
        path: ["customText"],
        message: "Only custom planning objectives accept a description",
      });
    }
  });

export type AssistantPlanningObjective = z.infer<typeof planningObjectiveSchema>;

/** Extract a clearly stated objective from the user's request when possible. */
export function inferPlanningObjective(message: string): AssistantPlanningObjective | null {
  const text = message.normalize("NFKC").trim();
  const customGoal =
    text.match(
      /\b(?:(?:my|our|the|this|primary)\s+)?(?:primary\s+)?(?:plan\s+)?(?:goal|objective)\s*(?:is|:|=)\s*([^.!?\n]{3,180})/iu,
    )?.[1] ??
    text.match(
      /(?:الهدف|الغاية)\s*(?:الرئيسي|الرئيسية)?\s*(?:هو|هي|أن|:|=)?\s*([^.!؟\n]{3,180})/u,
    )?.[1];
  if (customGoal) {
    const customText = customGoal.trim().replace(/[،,;؛:]+$/u, "");
    if (
      customText.length >= 3 &&
      !/\b(?:improve|optimise|optimize|make better)\b.{0,40}\b(?:plan|calendar|schedule)\b|(?:تحسين|تطوير).{0,30}(?:الخطة|خطة|الجدول|التقويم|مزيج المحتوى|مزيج الصيغ)/u.test(
        customText,
      )
    ) {
      return { type: "custom", customText: customText.slice(0, 180) };
    }
  }

  const hasGoalIntent =
    /\b(?:goal|objective|focus|aim|improve|increase|grow|drive|build|support|want|need|prioritise|prioritize)\b|(?:هدف|تركيز|لأجل|من أجل|زيادة|تعزيز|تحسين|دعم|أريد|اريد|نحتاج|نريد|أسعى|اسعى)/iu.test(
      text,
    ) ||
    /\bfor\s+(?:more\s+)?(?:awareness|reach|visibility|recognition|engagement|community|trust|education|conversions?|visits?|traffic|leads?|sales|orders?)\b/iu.test(
      text,
    );
  if (!hasGoalIntent) return null;

  if (
    /\b(?:engagement|community|interaction|comments?|shares?)\b|(?:التفاعل|المجتمع|التعليقات|المشاركات)/iu.test(
      text,
    )
  ) {
    return { type: "engagement" };
  }
  if (/\b(?:trust|education|educate|expertise)\b|(?:الثقة|التثقيف|التعليم|الخبرة)/iu.test(text)) {
    return { type: "trust" };
  }
  if (
    /\b(?:conversion|visits?|traffic|leads?|sales|orders?|bookings?)\b|(?:الزيارات|التحويل|المبيعات|الطلبات|الحجوزات|العملاء المحتملين)/iu.test(
      text,
    )
  ) {
    return { type: "conversion" };
  }
  if (
    /\b(?:awareness|reach|visibility|recognition)\b|(?:الوعي|الوصول|الانتشار|الظهور)/iu.test(text)
  ) {
    return { type: "awareness" };
  }
  return null;
}

/**
 * Scope markers that name one specific content item instead of the plan.
 *
 * The determiner has to be `selected` / `this` / `that` (or a definite article
 * in front of an unmistakably per-item noun) so that plan-level phrases such as
 * "improve the content mix" or "improve the plan" are not mistaken for an edit
 * of a single item.
 */
const ITEM_SCOPE_PATTERN =
  /\b(?:selected|this|that)\s+(?:\w+\s+){0,2}?(?:draft|post|item|content|asset|caption|brief|title|date|delivery|design|version|thumbnail|schedule)\b/iu;
const DEFINITE_ITEM_SCOPE_PATTERN = /\bthe\s+(?:draft|post|caption|brief|thumbnail)\b/iu;
const ARABIC_ITEM_SCOPE_PATTERN =
  /(?:العنصر|المنشور|المسودة|العنوان|الموعد|التاريخ|الفكرة|الوصف|النص)\s*المحدد(?:ة)?|(?:هذا|هذه)\s+(?:المنشور|العنصر|المسودة|العنوان|الموعد|التاريخ)/u;

/**
 * Intent verbs that ask for one item to be changed. Mirrors the edit-preview
 * gate in the assistant route and adds the verbs used for dates and titles.
 */
const EDIT_INTENT_PATTERN =
  /\b(?:edit|rewrite|improve|change|update|revise|suggest|move|reschedule|rename|retitle|recaption|adjust|shorten|expand|translate|fix|correct|polish)\b|حر(?:ر|ّر)|عد(?:ل|ّل)|حس(?:ن|ّن)|أطوّر|اطوّر|طوّر|اقترح|انقل|أعد|اعد|أصلح|اصلح/iu;

/**
 * Plan-level aggregates. A request about the content or format mix is a
 * strategic review even when it also mentions a selected item.
 */
const PLAN_LEVEL_MIX_PATTERN =
  /\b(?:content|format|channel|platform)\s+mix\b|مزيج\s+(?:المحتوى|الصيغ|القنوات)/iu;

/**
 * Detect a request that explicitly asks to change one selected content item.
 *
 * "Improve the selected draft schedule" is an edit of a single item, not a
 * strategic review of the plan, so it must keep the edit-preview flow and must
 * not be turned into a "choose a planning objective" request.
 */
export function isExplicitItemEditRequest(message: string | null | undefined): boolean {
  const text = (message ?? "").normalize("NFKC").trim();
  if (!text) return false;
  if (PLAN_LEVEL_MIX_PATTERN.test(text)) return false;
  const itemScoped =
    ITEM_SCOPE_PATTERN.test(text) ||
    DEFINITE_ITEM_SCOPE_PATTERN.test(text) ||
    ARABIC_ITEM_SCOPE_PATTERN.test(text);
  if (!itemScoped) return false;
  return EDIT_INTENT_PATTERN.test(text);
}

/**
 * Decide whether a request is asking for strategic plan improvements. Those
 * requests need one stated outcome before the assistant can rank actions.
 * Summary, schedule, and format-review requests remain descriptive.
 */
export function isPlanImprovementRequest(input: {
  message: string;
  mode: "ask" | "plan" | "apply";
  promptId?: string | undefined;
  promptContext?: string | undefined;
  /** The user's own wording, used to detect an explicit per-item edit. */
  userMessage?: string | undefined;
}) {
  if (input.mode === "apply") return false;
  if (isExplicitItemEditRequest(input.userMessage ?? input.message)) return false;
  if (input.promptId === "practical-plan-improvements") return true;

  const text = `${input.message} ${input.promptContext ?? ""}`
    .normalize("NFKC")
    .toLocaleLowerCase();
  const mentionsPlan =
    /\b(?:plan|planning|calendar|schedule|content mix|format mix)\b|(?:ال)?خط(?:ة|تي|تنا|تك|ه|ها)|(?:ال)?جدول|(?:ال)?تقويم|مزيج المحتوى|مزيج الصيغ/iu.test(
      text,
    );
  if (!mentionsPlan) return false;

  const requestsImprovement =
    /\b(?:how\s+(?:can|should|could)\s+i\s+.{0,45}(?:improve|optimise|optimize)|how\s+to\s+improve|(?:suggest|recommend|identify)\s+(?:up\s+to\s+\d+\s+)?(?:practical\s+)?(?:improvements?|ways\s+to\s+improve)|(?:improve|optimise|optimize)\s+(?:(?:my|our|the|this)\s+)?(?:monthly\s+|content\s+)?plan|ways?\s+to\s+improve)\b/iu.test(
      text,
    ) ||
    /\b(?:improve|optimise|optimize)\b.{0,45}\b(?:plans?|calendars?|schedules?|content\s+mix|format\s+mix|formats?)\b/iu.test(
      text,
    ) ||
    /\bmake\b.{0,25}\b(?:plans?|calendars?|schedules?|content\s+mix|format\s+mix)\b.{0,25}\b(?:better|stronger|more effective)\b/iu.test(
      text,
    ) ||
    /\b(?:improve|optimise|optimize|suggest|recommend)\b.{0,35}\b(?:formats?|format\s+mix|content\s+mix)\b/iu.test(
      text,
    ) ||
    /(?:كيف.{0,45}(?:تحسين|حسّن|حسن|تطوير|أطوّر|أطور|اطوّر|اطور)|(?:اقترح|أقترح|اريد|أريد|نحتاج|احتاج).{0,40}(?:تحسين|تطوير)|(?:تحسينات|تحسين|تطوير).{0,30}(?:الخطة|خطة|الجدول|المنشورات|الصيغ))/iu.test(
      text,
    );

  return requestsImprovement;
}
