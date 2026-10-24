export type BuiltInAssistantPrompt = {
  id: string;
  name: string;
  purpose: string;
  goal: string;
  instructions: string;
  tags: string[];
  parameters?: import("./parameters").AssistantPromptParameter[];
};

type LocalizedPrompt = { en: BuiltInAssistantPrompt; ar: BuiltInAssistantPrompt };

/** Daily prompts grounded in the current plan, calendar, and content-mix read tools. */
export const BUILT_IN_ASSISTANT_PROMPTS: LocalizedPrompt[] = [
  {
    en: {
      id: "monthly-plan-summary",
      name: "Monthly plan summary",
      purpose: "Get a concise view of the selected month's plan.",
      goal: "Summarize this month's plan and highlight its main strengths.",
      instructions:
        "Summarize item count, status balance, active posting dates, and format variety. Separate observed facts from interpretation and cite evidence.",
      tags: ["review", "summary", "daily"],
    },
    ar: {
      id: "monthly-plan-summary",
      name: "ملخص الخطة الشهرية",
      purpose: "احصل على نظرة موجزة على خطة الشهر المحدد.",
      goal: "لخّص خطة هذا الشهر وأبرز نقاط قوتها الرئيسية.",
      instructions:
        "لخّص عدد العناصر وتوزيع الحالات وأيام النشر النشطة وتنوع الصيغ. افصل الحقائق المرصودة عن التفسير واستشهد بالأدلة.",
      tags: ["مراجعة", "ملخص", "يومي"],
    },
  },
  {
    en: {
      id: "schedule-gap-review",
      name: "Find schedule gaps",
      purpose: "Spot long pauses in the selected month's calendar.",
      goal: "Find scheduling gaps and explain the evidence.",
      instructions:
        "List only gaps detected by the deterministic calendar analysis. Explain their dates and duration. Do not infer campaign or audience impact.",
      tags: ["calendar", "gaps", "risk"],
    },
    ar: {
      id: "schedule-gap-review",
      name: "اكتشاف فجوات الجدول",
      purpose: "اكتشف فترات الانقطاع الطويلة في تقويم الشهر المحدد.",
      goal: "اعثر على فجوات الجدول واشرح الأدلة.",
      instructions:
        "اذكر الفجوات التي كشفها تحليل التقويم الحتمي فقط. وضّح تواريخها ومدتها. لا تستنتج أثرها على الحملات أو الجمهور.",
      tags: ["تقويم", "فجوات", "مخاطر"],
    },
  },
  {
    en: {
      id: "practical-plan-improvements",
      name: "Suggest improvements",
      purpose: "Turn visible planning issues into practical next steps.",
      goal: "Suggest practical improvements to this month's plan.",
      instructions:
        "Offer up to three small, actionable improvements based only on dates, formats, item count, and statuses. Explain the evidence and name any missing goal or capacity data.",
      tags: ["improve", "actions", "daily"],
    },
    ar: {
      id: "practical-plan-improvements",
      name: "اقتراح تحسينات عملية",
      purpose: "حوّل مشكلات التخطيط الظاهرة إلى خطوات عملية.",
      goal: "اقترح تحسينات عملية على خطة هذا الشهر.",
      instructions:
        "قدّم ما يصل إلى ثلاثة تحسينات صغيرة وقابلة للتنفيذ بالاستناد إلى التواريخ والصيغ وعدد العناصر وحالاتها فقط. اشرح الأدلة واذكر أي بيانات ناقصة عن الأهداف أو القدرة.",
      tags: ["تحسين", "إجراءات", "يومي"],
    },
  },
  {
    en: {
      id: "content-format-mix",
      name: "Review content mix",
      purpose: "Understand the variety of planned formats.",
      goal: "Review the format mix in this month's plan.",
      instructions:
        "Describe the count and share of each planned format. Avoid saying a format is good or bad without a stated objective or performance evidence.",
      tags: ["formats", "content mix", "review"],
    },
    ar: {
      id: "content-format-mix",
      name: "مراجعة مزيج المحتوى",
      purpose: "افهم تنوع الصيغ المخطط لها.",
      goal: "راجع مزيج الصيغ في خطة هذا الشهر.",
      instructions:
        "اشرح عدد ونسبة كل صيغة مخطط لها. لا تصف صيغة بأنها جيدة أو سيئة دون هدف معلن أو دليل أداء.",
      tags: ["صيغ", "مزيج المحتوى", "مراجعة"],
    },
  },
  {
    en: {
      id: "status-balance",
      name: "Check work status balance",
      purpose: "See how much planned work is still in early stages.",
      goal: "Summarize the status balance and identify where follow-up may help.",
      instructions:
        "Report status counts and proportions from the selected month. Suggest follow-up only where the status data supports it; do not claim an item is overdue without deadline evidence.",
      tags: ["status", "workflow", "follow-up"],
    },
    ar: {
      id: "status-balance",
      name: "مراجعة توازن حالات العمل",
      purpose: "اعرف مقدار العمل المخطط الذي ما زال في مراحله الأولى.",
      goal: "لخّص توزيع الحالات وحدد المواضع التي قد تستفيد من المتابعة.",
      instructions:
        "اعرض أعداد ونسب الحالات في الشهر المحدد. اقترح المتابعة عندما تدعم بيانات الحالة ذلك فقط؛ لا تقل إن عنصراً متأخر دون دليل على موعد نهائي.",
      tags: ["الحالة", "سير العمل", "متابعة"],
    },
  },
  {
    en: {
      id: "weekly-publishing-rhythm",
      name: "Review weekly rhythm",
      purpose: "Compare how scheduled items are distributed across the month.",
      goal: "Describe the weekly publishing rhythm and any uneven periods.",
      instructions:
        "Use active dates and daily counts to describe busy and quiet stretches. Do not invent a target posting frequency.",
      tags: ["weekly", "schedule", "consistency"],
    },
    ar: {
      id: "weekly-publishing-rhythm",
      name: "مراجعة إيقاع النشر الأسبوعي",
      purpose: "قارن توزيع العناصر المجدولة خلال الشهر.",
      goal: "صِف إيقاع النشر الأسبوعي وأي فترات غير متوازنة.",
      instructions:
        "استخدم أيام النشاط والأعداد اليومية لوصف الفترات المزدحمة والهادئة. لا تخترع وتيرة نشر مستهدفة.",
      tags: ["أسبوعي", "جدول", "انتظام"],
    },
  },
  {
    en: {
      id: "busiest-publishing-days",
      name: "Find busiest days",
      purpose: "Identify dates with multiple planned items.",
      goal: "Which dates have the most planned content, and what should I review?",
      instructions:
        "Rank the busiest dates using daily counts. Explain that same-day volume is a planning observation, not proof of audience fatigue or channel conflict.",
      tags: ["busy days", "calendar", "load"],
    },
    ar: {
      id: "busiest-publishing-days",
      name: "أكثر أيام النشر ازدحاماً",
      purpose: "حدد التواريخ التي تحتوي على عدة عناصر مخطط لها.",
      goal: "ما أكثر التواريخ ازدحاماً بالمحتوى المخطط، وما الذي ينبغي مراجعته؟",
      instructions:
        "رتّب أكثر التواريخ ازدحاماً باستخدام الأعداد اليومية. وضّح أن كثافة اليوم ملاحظة تخطيطية وليست دليلاً على إرهاق الجمهور أو تعارض القنوات.",
      tags: ["أيام مزدحمة", "تقويم", "عبء"],
    },
  },
  {
    en: {
      id: "quiet-periods",
      name: "Review quiet periods",
      purpose: "Find long stretches with little or no scheduled activity.",
      goal: "Show the quietest periods in this month's schedule.",
      instructions:
        "Use the selected month's daily distribution and deterministic gaps. If the bounded data cannot identify every quiet date, say so.",
      tags: ["quiet periods", "calendar", "gaps"],
    },
    ar: {
      id: "quiet-periods",
      name: "مراجعة الفترات الهادئة",
      purpose: "اعثر على الفترات الطويلة ذات النشاط المجدول القليل أو المعدوم.",
      goal: "اعرض أهدأ الفترات في جدول هذا الشهر.",
      instructions:
        "استخدم التوزيع اليومي والفجوات الحتمية للشهر المحدد. إذا لم تسمح البيانات المحدودة بتحديد كل الأيام الهادئة، فاذكر ذلك.",
      tags: ["فترات هادئة", "تقويم", "فجوات"],
    },
  },
  {
    en: {
      id: "first-half-second-half",
      name: "Compare month halves",
      purpose: "Check whether planned activity is concentrated early or late.",
      goal: "Compare the first and second halves of the selected month.",
      instructions:
        "Compare planned item counts and active dates in each half. State the exact date boundary and avoid judging the result without a plan objective.",
      tags: ["distribution", "month", "comparison"],
    },
    ar: {
      id: "first-half-second-half",
      name: "مقارنة نصفي الشهر",
      purpose: "تحقق مما إذا كان النشاط المخطط يتركز في بداية الشهر أو نهايته.",
      goal: "قارن النصف الأول والنصف الثاني من الشهر المحدد.",
      instructions:
        "قارن أعداد العناصر وأيام النشاط في كل نصف. اذكر حد التاريخ بدقة ولا تحكم على النتيجة دون هدف للخطة.",
      tags: ["توزيع", "شهر", "مقارنة"],
    },
  },
  {
    en: {
      id: "format-diversity-check",
      name: "Check format diversity",
      purpose: "See how many different content formats are represented.",
      goal: "How varied are the planned content formats?",
      instructions:
        "Count distinct formats and show their distribution. Explain that format variety alone does not establish audience or channel fit.",
      tags: ["formats", "variety", "content mix"],
    },
    ar: {
      id: "format-diversity-check",
      name: "فحص تنوع الصيغ",
      purpose: "تحقق من عدد صيغ المحتوى المختلفة الممثلة.",
      goal: "ما مدى تنوع صيغ المحتوى المخطط؟",
      instructions:
        "احسب الصيغ المختلفة واعرض توزيعها. وضّح أن تنوع الصيغ وحده لا يثبت ملاءمتها للجمهور أو القناة.",
      tags: ["صيغ", "تنوع", "مزيج المحتوى"],
    },
  },
  {
    en: {
      id: "draft-work-review",
      name: "Review draft workload",
      purpose: "Estimate how many planned items remain in draft.",
      goal: "How many items are still drafts, and what follow-up is reasonable?",
      instructions:
        "Report draft count and share. Suggest a review queue only as an option; do not infer ownership, due dates, or team capacity.",
      tags: ["drafts", "workflow", "planning"],
    },
    ar: {
      id: "draft-work-review",
      name: "مراجعة عبء المسودات",
      purpose: "قدّر عدد العناصر المخطط لها التي ما زالت في حالة المسودة.",
      goal: "كم عنصراً ما زال مسودة، وما المتابعة المناسبة؟",
      instructions:
        "اعرض عدد المسودات ونسبتها. اقترح قائمة مراجعة كخيار فقط؛ لا تستنتج المالك أو الموعد النهائي أو قدرة الفريق.",
      tags: ["مسودات", "سير العمل", "تخطيط"],
    },
  },
  {
    en: {
      id: "schedule-quick-wins",
      name: "Find quick wins",
      purpose: "Choose small calendar improvements that need no new metrics.",
      goal: "Give me three low-effort improvements based on this calendar.",
      instructions:
        "Return at most three practical suggestions tied to observed gaps, clustering, or format concentration. Mark each as a suggestion and cite evidence.",
      tags: ["quick wins", "improve", "actions"],
    },
    ar: {
      id: "schedule-quick-wins",
      name: "تحسينات سريعة",
      purpose: "اختر تحسينات بسيطة للتقويم لا تحتاج إلى مقاييس جديدة.",
      goal: "قدّم لي ثلاثة تحسينات قليلة الجهد استناداً إلى هذا التقويم.",
      instructions:
        "قدّم ما يصل إلى ثلاثة اقتراحات عملية مرتبطة بالفجوات المرصودة أو التكدس أو تركّز الصيغ. وضّح أن كل بند اقتراح واستشهد بالأدلة.",
      tags: ["تحسينات سريعة", "تحسين", "إجراءات"],
    },
  },
  {
    en: {
      id: "calendar-density-review",
      name: "Review calendar density",
      purpose: "Understand whether items are clustered on a small number of dates.",
      goal: "Explain whether this month is spread out or concentrated on a few dates.",
      instructions:
        "Compare active dates, total items, and daily counts. Do not claim that a specific frequency is ideal without a supplied target.",
      tags: ["density", "calendar", "distribution"],
    },
    ar: {
      id: "calendar-density-review",
      name: "مراجعة كثافة التقويم",
      purpose: "افهم ما إذا كانت العناصر متجمعة في عدد قليل من التواريخ.",
      goal: "اشرح ما إذا كان توزيع هذا الشهر واسعاً أم متركزاً في أيام قليلة.",
      instructions:
        "قارن أيام النشاط وإجمالي العناصر والأعداد اليومية. لا تقل إن وتيرة محددة مثالية دون هدف مقدم.",
      tags: ["كثافة", "تقويم", "توزيع"],
    },
  },
  {
    en: {
      id: "status-follow-up-priorities",
      name: "Prioritize follow-up",
      purpose: "Turn status counts into a short review order.",
      goal: "Prioritize which parts of the plan deserve a human follow-up first.",
      instructions:
        "Use status counts and planned dates only. Prioritize items scheduled soon that remain in early workflow states only if those facts are present. Never claim individual records because the context is aggregate.",
      tags: ["priorities", "follow-up", "workflow"],
    },
    ar: {
      id: "status-follow-up-priorities",
      name: "ترتيب أولويات المتابعة",
      purpose: "حوّل أعداد الحالات إلى ترتيب مراجعة مختصر.",
      goal: "رتّب أجزاء الخطة التي تستحق متابعة بشرية أولاً.",
      instructions:
        "استخدم أعداد الحالات والتواريخ المخطط لها فقط. أعط أولوية للعناصر القريبة في حالات مبكرة فقط إذا توفرت هذه الحقائق. لا تدّع معرفة سجلات فردية لأن السياق إجمالي.",
      tags: ["أولويات", "متابعة", "سير العمل"],
    },
  },
  {
    en: {
      id: "missing-data-check",
      name: "Check what is missing",
      purpose: "Separate available planning facts from unavailable information.",
      goal: "What can this review confirm, and what information is missing?",
      instructions:
        "List supported facts first, then limitations such as unavailable goals, channel-level distribution, owners, or performance metrics. Do not fill gaps with assumptions.",
      tags: ["data quality", "limitations", "review"],
    },
    ar: {
      id: "missing-data-check",
      name: "فحص البيانات الناقصة",
      purpose: "افصل حقائق التخطيط المتاحة عن المعلومات غير المتاحة.",
      goal: "ما الذي تؤكده هذه المراجعة، وما المعلومات الناقصة؟",
      instructions:
        "اعرض الحقائق المدعومة أولاً، ثم القيود مثل غياب الأهداف أو توزيع القنوات أو المالكين أو مقاييس الأداء. لا تملأ الفجوات بافتراضات.",
      tags: ["جودة البيانات", "قيود", "مراجعة"],
    },
  },
  {
    en: {
      id: "plan-review-for-manager",
      name: "Manager-ready review",
      purpose: "Prepare a short evidence-based update for a planning review.",
      goal: "Write a concise manager-ready review of this month's plan.",
      instructions:
        "Use three sections: status, calendar coverage, and suggested attention. Keep every factual point tied to the selected month's evidence and include limitations.",
      tags: ["report", "manager", "review"],
    },
    ar: {
      id: "plan-review-for-manager",
      name: "مراجعة موجزة للمدير",
      purpose: "أعد تحديثاً قصيراً ومدعوماً بالأدلة لمراجعة التخطيط.",
      goal: "اكتب مراجعة موجزة لخطة هذا الشهر مناسبة للمدير.",
      instructions:
        "استخدم ثلاثة أقسام: الحالة، وتغطية التقويم، وما يستحق الانتباه. اربط كل حقيقة بأدلة الشهر المحدد وأدرج القيود.",
      tags: ["تقرير", "مدير", "مراجعة"],
    },
  },
  {
    en: {
      id: "next-planning-meeting",
      name: "Prepare planning discussion",
      purpose: "Create focused questions for the next team planning discussion.",
      goal: "Suggest five evidence-based questions for our next planning meeting.",
      instructions:
        "Ask questions grounded in observed schedule gaps, daily clustering, status balance, or format mix. Do not assume campaign objectives, channel strategy, or employee workload.",
      tags: ["meeting", "questions", "team"],
    },
    ar: {
      id: "next-planning-meeting",
      name: "الاستعداد لاجتماع التخطيط",
      purpose: "أنشئ أسئلة مركزة لنقاش التخطيط القادم مع الفريق.",
      goal: "اقترح خمسة أسئلة مدعومة بالأدلة لاجتماع التخطيط القادم.",
      instructions:
        "اطرح أسئلة مرتبطة بفجوات الجدول أو تكدس الأيام أو توزيع الحالات أو مزيج الصيغ المرصود. لا تفترض أهداف الحملات أو استراتيجية القنوات أو عبء الموظفين.",
      tags: ["اجتماع", "أسئلة", "فريق"],
    },
  },
  {
    en: {
      id: "posting-patterns",
      name: "Describe posting patterns",
      purpose: "Explain the calendar pattern in plain language.",
      goal: "Describe the main posting patterns without jargon.",
      instructions:
        "Summarize active dates, quiet stretches, busy dates, and long gaps using plain language and exact evidence. Avoid claims about reach or engagement.",
      tags: ["patterns", "calendar", "plain language"],
    },
    ar: {
      id: "posting-patterns",
      name: "وصف أنماط النشر",
      purpose: "اشرح نمط التقويم بلغة واضحة.",
      goal: "صِف أنماط النشر الرئيسية دون مصطلحات معقدة.",
      instructions:
        "لخّص أيام النشاط والفترات الهادئة والأيام المزدحمة والفجوات الطويلة بلغة واضحة وأدلة دقيقة. تجنب الادعاءات عن الوصول أو التفاعل.",
      tags: ["أنماط", "تقويم", "لغة واضحة"],
    },
  },
  {
    en: {
      id: "format-concentration-risk",
      name: "Check format concentration",
      purpose: "Notice when one format makes up most of the plan.",
      goal: "Is one format dominating this month's plan? Explain the trade-offs.",
      instructions:
        "Report format counts and concentration. Explain possible planning trade-offs as questions to consider, not evidence of poor performance.",
      tags: ["formats", "balance", "risk"],
    },
    ar: {
      id: "format-concentration-risk",
      name: "فحص تركّز الصيغ",
      purpose: "لاحظ عندما تشكل صيغة واحدة معظم الخطة.",
      goal: "هل تهيمن صيغة واحدة على خطة هذا الشهر؟ اشرح المفاضلات.",
      instructions:
        "اعرض أعداد الصيغ ومدى تركّزها. اشرح المفاضلات التخطيطية المحتملة كأمور تستحق النقاش، لا كدليل على ضعف الأداء.",
      tags: ["صيغ", "توازن", "مخاطر"],
    },
  },
  {
    en: {
      id: "calendar-alternatives",
      name: "Explore schedule alternatives",
      purpose: "Suggest ways to spread items more evenly without changing data.",
      goal: "Suggest two alternative ways to spread this month's planned items.",
      instructions:
        "Offer hypothetical options based on observed daily clustering and gaps. Do not propose exact item moves because this read-only assistant lacks item-level action approval.",
      tags: ["alternatives", "schedule", "ideas"],
    },
    ar: {
      id: "calendar-alternatives",
      name: "استكشاف بدائل الجدول",
      purpose: "اقترح طرقاً لتوزيع العناصر بشكل أعدل دون تغيير البيانات.",
      goal: "اقترح طريقتين بديلتين لتوزيع عناصر هذا الشهر المخطط لها.",
      instructions:
        "قدّم خيارات افتراضية تستند إلى تكدس الأيام والفجوات المرصودة. لا تقترح نقل عناصر بعينها لأن هذا المساعد للقراءة فقط ولا يملك موافقة على الإجراءات.",
      tags: ["بدائل", "جدول", "أفكار"],
    },
  },
  {
    en: {
      id: "calendar-risk-brief",
      name: "Create a calendar risk brief",
      purpose: "Summarize visible scheduling risks for quick triage.",
      goal: "Give me a short calendar risk brief with evidence and next checks.",
      instructions:
        "Rank deterministic long gaps and unusually dense dates. Use cautious language and identify missing channel goals or team-capacity data.",
      tags: ["risk", "brief", "triage"],
    },
    ar: {
      id: "calendar-risk-brief",
      name: "ملخص مخاطر التقويم",
      purpose: "لخّص مخاطر الجدولة الظاهرة لفرزها بسرعة.",
      goal: "قدّم ملخصاً قصيراً لمخاطر التقويم مع الأدلة وما ينبغي التحقق منه لاحقاً.",
      instructions:
        "رتّب الفجوات الطويلة الحتمية والتواريخ ذات الكثافة المرتفعة. استخدم لغة حذرة وحدد غياب أهداف القنوات أو بيانات قدرة الفريق.",
      tags: ["مخاطر", "ملخص", "فرز"],
    },
  },
  {
    en: {
      id: "executive-summary",
      name: "One-minute executive summary",
      purpose: "Create a very short readout for stakeholders.",
      goal: "Explain this month's plan in five bullets for a busy stakeholder.",
      instructions:
        "Use at most five bullets covering volume, status, calendar spread, format mix, and one practical review question. Include evidence IDs for factual points.",
      tags: ["executive", "summary", "report"],
    },
    ar: {
      id: "executive-summary",
      name: "ملخص تنفيذي في دقيقة",
      purpose: "أنشئ عرضاً موجزاً جداً لأصحاب المصلحة.",
      goal: "اشرح خطة هذا الشهر في خمس نقاط لصاحب مصلحة مشغول.",
      instructions:
        "استخدم خمس نقاط كحد أقصى تغطي حجم العمل والحالات وتوزيع التقويم ومزيج الصيغ وسؤال مراجعة عملياً واحداً. أدرج معرّفات الأدلة للحقائق.",
      tags: ["تنفيذي", "ملخص", "تقرير"],
    },
  },
  {
    en: {
      id: "follow-up-question-list",
      name: "Create a follow-up checklist",
      purpose: "Turn review findings into questions a planner can verify.",
      goal: "Make a checklist of what I should verify before finalizing this plan.",
      instructions:
        "Create a checklist limited to facts the assistant cannot confirm, such as goals, channel fit, owners, deadlines, and capacity. Distinguish unknown items from detected issues.",
      tags: ["checklist", "review", "follow-up"],
    },
    ar: {
      id: "follow-up-question-list",
      name: "قائمة تحقق للمتابعة",
      purpose: "حوّل نتائج المراجعة إلى أسئلة يستطيع المخطط التحقق منها.",
      goal: "أنشئ قائمة تحقق بما ينبغي لي مراجعته قبل اعتماد الخطة.",
      instructions:
        "أنشئ قائمة تقتصر على الحقائق التي لا يستطيع المساعد تأكيدها، مثل الأهداف وملاءمة القنوات والمالكين والمواعيد والقدرة. ميّز المجهول عن المشكلات المكتشفة.",
      tags: ["قائمة تحقق", "مراجعة", "متابعة"],
    },
  },
  {
    en: {
      id: "team-workload-review",
      name: "Review assigned workload",
      purpose: "See how the selected month's work is assigned across content owners and designers.",
      goal: "Summarize the assignment distribution for this month's planned content.",
      instructions:
        "Report the bounded counts by content owner and designer, including unassigned work and any omitted groups. Identify the highest and lowest counts as observations only. Do not infer available hours, capacity, deadlines, fairness, or performance from assignment counts.",
      tags: ["workload", "team", "assignments", "review"],
    },
    ar: {
      id: "team-workload-review",
      name: "مراجعة توزيع العمل المسند",
      purpose: "اطّلع على توزيع عمل الشهر المحدد بين مالكي المحتوى والمصممين.",
      goal: "لخّص توزيع المهام على محتوى هذا الشهر المخطط.",
      instructions:
        "اعرض الأعداد المحدودة حسب مالك المحتوى والمصمم، بما في ذلك العمل غير المسند وأي مجموعات لم تُعرض. اذكر أعلى الأعداد وأقلها كملاحظات فقط. لا تستنتج ساعات العمل المتاحة أو القدرة أو المواعيد النهائية أو العدالة أو الأداء من أعداد المهام.",
      tags: ["عبء العمل", "الفريق", "التكليفات", "مراجعة"],
    },
  },
];

export function getBuiltInAssistantPrompts(locale: string): BuiltInAssistantPrompt[] {
  const language = locale.toLowerCase().startsWith("ar") ? "ar" : "en";
  return BUILT_IN_ASSISTANT_PROMPTS.map((entry) => entry[language]);
}

export function getBuiltInAssistantPrompt(
  id: string,
  locale: string,
): BuiltInAssistantPrompt | null {
  return getBuiltInAssistantPrompts(locale).find((prompt) => prompt.id === id) ?? null;
}
