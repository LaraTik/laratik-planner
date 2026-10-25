export type AssistantKnowledgeLocale = "en" | "ar";
export type AssistantKnowledgeScope = "workspace" | "agency" | "default";
export type AssistantKnowledgeCategory =
  "brand" | "audience" | "strategy" | "operations" | "performance" | "reference";
export type AssistantKnowledgeVerificationStatus = "unverified" | "verified" | "outdated";

export type AssistantKnowledgeEntry = {
  id: string;
  scope: AssistantKnowledgeScope;
  category: AssistantKnowledgeCategory;
  title: string;
  content: string;
  tags: string[];
  sourceUrl: string | null;
  verificationStatus: AssistantKnowledgeVerificationStatus;
  verifiedAt: Date | null;
  revision: number;
  updatedAt: Date;
  isBuiltIn: boolean;
};

type LocalizedText = Record<AssistantKnowledgeLocale, string>;

type DefaultKnowledgeDefinition = {
  key: string;
  category: AssistantKnowledgeCategory;
  title: LocalizedText;
  content: LocalizedText;
  tags: string[];
  sourceUrl: string | null;
};

// These generic defaults are adapted from the reviewed planning defaults in
// docs/ai-planning/defaults/ and grounded in the linked public standards where
// applicable. Bump revision when an entry's meaning changes.
const DEFAULT_KNOWLEDGE_REVISION = 2;
const DEFAULT_KNOWLEDGE_REVIEWED_AT = new Date("2026-10-25T00:00:00.000Z");

const DEFAULT_KNOWLEDGE: DefaultKnowledgeDefinition[] = [
  {
    key: "objective-and-audience",
    category: "strategy",
    title: { en: "Set the objective and audience first", ar: "حدّد الهدف والجمهور أولًا" },
    content: {
      en: "Begin with the business objective and the audience need or problem that communication can address. Define the priority audience and the action or change sought; connect the plan to an observable success signal and review period where data allows. Use current brand and audience evidence. If the objective, audience, offer, or a material constraint is missing or conflicts with current workspace information, name the gap and ask a focused question before committing the plan. Do not invent audience motives or business outcomes.",
      ar: "ابدأ بهدف العمل وبحاجة الجمهور أو المشكلة التي يمكن للتواصل معالجتها. حدّد الجمهور الأساسي والسلوك أو التغيير المطلوب، واربط الخطة بمؤشر نجاح يمكن ملاحظته وفترة للمراجعة متى أتاحت البيانات ذلك. استند إلى معلومات العلامة والجمهور المتاحة والحديثة. إذا غاب الهدف أو الجمهور أو العرض أو أحد القيود المؤثرة، أو تعارضت المعلومات مع بيانات مساحة العمل، فوضّح الفجوة واسأل سؤالًا محددًا قبل اعتماد الخطة. لا تختلق دوافع للجمهور أو نتائج للأعمال.",
    },
    tags: [
      "goal",
      "objective",
      "audience",
      "need",
      "business impact",
      "هدف",
      "جمهور",
      "احتياج",
      "أثر تجاري",
    ],
    sourceUrl: "https://amecorg.com/amecframework/home/supporting-material/planning/",
  },
  {
    key: "decision-ready-brief",
    category: "strategy",
    title: { en: "Write a decision-ready content brief", ar: "اكتب موجزًا واضحًا قابلًا للتنفيذ" },
    content: {
      en: "For each campaign or important content item, record the objective, priority audience and need, one primary message, supporting proof or source, intended next action, channel and format, owner and approver, required assets, timing, constraints, and primary success measure. Link the item to a campaign or pillar and its role in the audience journey. If volume or mix is unspecified, propose a starting point based on the objective, available account evidence, production capacity, and budget; explain the rationale and what can change. Avoid universal posting quotas or unsupported content ratios.",
      ar: "لكل حملة أو عنصر محتوى مهم، سجّل الهدف والجمهور الأساسي واحتياجه، ورسالة رئيسية واحدة، والدليل أو المصدر الداعم، والخطوة التالية المطلوبة، والقناة والصيغة، والمسؤول وصاحب الموافقة، والأصول المطلوبة، والتوقيت، والقيود، ومؤشر النجاح الأساسي. اربط العنصر بحملة أو محور وبالدور الذي يؤديه في رحلة الجمهور. إذا لم تُحدّد الكمية أو تركيبة المحتوى، فاقترح نقطة بداية تستند إلى الهدف وبيانات الحساب المتاحة والقدرة الإنتاجية والميزانية، واشرح سببها وما يمكن تعديله. تجنّب فرض عدد عام للمنشورات أو نسب غير مدعومة للمحتوى.",
    },
    tags: [
      "brief",
      "campaign",
      "content pillars",
      "cta",
      "content mix",
      "موجز",
      "حملة",
      "محاور المحتوى",
      "دعوة للإجراء",
      "مزيج المحتوى",
    ],
    sourceUrl: "https://amecorg.com/amecframework/home/supporting-material/planning/",
  },
  {
    key: "evidence-and-unknowns",
    category: "reference",
    title: {
      en: "Separate evidence, assumptions, and unknowns",
      ar: "افصل الأدلة والافتراضات والمعلومات المجهولة",
    },
    content: {
      en: "Use current workspace records, user-confirmed facts, or traceable sources for statements about a client, audience, offer, price, availability, performance, or operations. Keep sourced facts, observations, interpretations, recommendations, assumptions, and unknowns distinct. Name the source and date or reporting period when freshness affects a decision. Surface conflicts among the brand profile, brief, and prior results; pause the affected decision and ask instead of choosing silently. Never fill a factual gap with a plausible-sounding guess.",
      ar: "استخدم سجلات مساحة العمل الحديثة أو الحقائق التي أكدها المستخدم أو المصادر القابلة للتتبّع عند الحديث عن العميل أو الجمهور أو العرض أو السعر أو التوفر أو الأداء أو العمليات. افصل بوضوح بين الحقائق المسندة إلى مصادر والملاحظات والتفسيرات والتوصيات والافتراضات والمعلومات المجهولة. اذكر المصدر وتاريخه أو فترة التقرير عندما تؤثر حداثة المعلومة في القرار. وضّح التعارض بين ملف العلامة والموجز والنتائج السابقة، وأوقف القرار المتأثر واسأل بدلًا من اختيار أحدها بصمت. لا تملأ فجوة واقعية بتخمين يبدو معقولًا.",
    },
    tags: [
      "facts",
      "assumptions",
      "evidence",
      "sources",
      "freshness",
      "حقائق",
      "افتراضات",
      "أدلة",
      "مصادر",
      "حداثة البيانات",
    ],
    sourceUrl: null,
  },
  {
    key: "responsible-claims",
    category: "reference",
    title: {
      en: "Substantiate claims and protect audience trust",
      ar: "وثّق الادعاءات واحمِ ثقة الجمهور",
    },
    content: {
      en: "Before using factual, numerical, comparative, testimonial, endorsement, health, financial, environmental, or performance claims, check that current evidence supports the exact wording and the audience it will reach. Confirm offer terms and any permissions or disclosures required for endorsements and paid relationships. Check applicable local rules and platform policies; send regulated or high-risk claims for qualified review. If proof or approval is missing, flag, remove, or qualify the claim. Never invent substantiation or imply a guarantee without an approved basis.",
      ar: "قبل استخدام ادعاء يتضمن حقيقة أو رقمًا أو مقارنة، أو شهادة عميل أو توصية، أو ادعاء صحي أو مالي أو بيئي أو متعلقًا بالأداء، تحقّق من أن الأدلة الحديثة تسند الصياغة المحددة وتناسب الجمهور المستهدف. أكّد شروط العرض وأي أذونات أو إفصاحات مطلوبة للتوصيات والعلاقات المدفوعة. راجع القواعد المحلية وسياسات المنصة، وأحِل الادعاءات الخاضعة لتنظيم خاص أو عالية المخاطر إلى مختص مؤهل. إذا غاب الإثبات أو الاعتماد، فنبه إلى ذلك أو احذف الادعاء أو قيّده. لا تختلق دليلًا ولا توحِ بوجود ضمان من دون أساس معتمد.",
    },
    tags: [
      "claims",
      "compliance",
      "advertising",
      "testimonials",
      "endorsements",
      "ادعاءات",
      "امتثال",
      "إعلان",
      "شهادات العملاء",
      "توصيات",
    ],
    sourceUrl:
      "https://iccwbo.org/business-solutions/the-icc-advertising-and-marketing-communications-code/",
  },
  {
    key: "channel-fit-and-content-mix",
    category: "strategy",
    title: {
      en: "Build a coherent mix and adapt by channel",
      ar: "أنشئ مزيجًا متماسكًا وكيّف المحتوى لكل قناة",
    },
    content: {
      en: "Give each item a clear role tied to the objective, such as educating, demonstrating, building trust, entertaining, or prompting action. Vary angles, formats, and calls to action to reduce repetition, without imposing a fixed ratio. Adapt the idea to each channel using current official format guidance and available account evidence; do not assume that one edit works everywhere. Verify changing specifications, features, and policies when planning or publishing. Treat claims about algorithms, ideal posting times, hashtags, reach, or results as unverified unless current evidence supports them.",
      ar: "حدّد لكل عنصر دورًا واضحًا يخدم الهدف، مثل التثقيف أو العرض أو بناء الثقة أو الترفيه أو تحفيز الإجراء. نوّع الزوايا والصيغ والدعوات إلى الإجراء للحد من التكرار، من دون فرض نسبة ثابتة. كيّف الفكرة لكل قناة بالاستناد إلى إرشاداتها الرسمية الحالية وبيانات الحساب المتاحة؛ ولا تفترض أن نسخة واحدة تناسب جميع القنوات. تحقّق من المواصفات والميزات والسياسات المتغيرة عند التخطيط أو النشر. تعامل مع الادعاءات حول الخوارزميات أو أوقات النشر المثالية أو الوسوم أو الوصول أو النتائج على أنها غير مؤكدة ما لم تسندها أدلة حديثة.",
    },
    tags: [
      "channel",
      "platform",
      "content mix",
      "repetition",
      "format",
      "قناة",
      "منصة",
      "مزيج المحتوى",
      "تكرار",
      "صيغة",
    ],
    sourceUrl: null,
  },
  {
    key: "production-rights-approvals",
    category: "operations",
    title: {
      en: "Check production, rights, and approvals",
      ar: "تحقّق من متطلبات الإنتاج والحقوق والموافقات",
    },
    content: {
      en: "Before confirming a plan, check ownership, required skills, available assets, filming/design/editing capacity, lead time, budget, approvals, and dependencies. Confirm usage rights and permissions for people, customer content, photography, music, and other third-party or generated assets under the applicable agreements and policies. Verify that products, offers, and dates remain valid. Record unknowns, dependencies, and the approver; offer a simpler execution path when capacity is limited. Do not promise a deliverable, publication date, or result without confirmed resources and approval.",
      ar: "قبل اعتماد الخطة، تحقّق من المسؤوليات والمهارات المطلوبة والأصول المتاحة والقدرة على التصوير والتصميم والتحرير والوقت اللازم والميزانية والموافقات والاعتماديات. أكّد حقوق الاستخدام والأذونات المتعلقة بالأشخاص ومحتوى العملاء والصور والموسيقى والأصول الخارجية أو المولّدة بأدوات الذكاء الاصطناعي وفق الاتفاقيات وشروط الاستخدام والسياسات المعمول بها. تحقّق من استمرار صلاحية المنتجات والعروض والتواريخ. سجّل المعلومات غير المعروفة والاعتماديات وصاحب الموافقة، واقترح مسار تنفيذ أبسط عند محدودية القدرة. لا تعد بمادة أو موعد نشر أو نتيجة من دون موارد مؤكدة وموافقة.",
    },
    tags: [
      "production",
      "capacity",
      "assets",
      "rights",
      "approvals",
      "إنتاج",
      "قدرة",
      "أصول",
      "حقوق الاستخدام",
      "موافقات",
    ],
    sourceUrl: null,
  },
  {
    key: "audience-localization",
    category: "brand",
    title: {
      en: "Localize for the intended audience",
      ar: "كيّف المحتوى للجمهور والسوق المستهدفين",
    },
    content: {
      en: "Use the content language, market, audience segment, and approved brand voice specified for the item; the interface or chat language does not set the post language. Adapt idioms, examples, units, dates, currency, calls to action, and cultural references with local review while preserving factual meaning and qualifications. Ask before choosing a dialect or adding a second language. Avoid literal translation and assumptions that everyone who speaks a language shares the same preferences.",
      ar: "استخدم لغة المحتوى والسوق وشريحة الجمهور ونبرة العلامة المعتمدة والمحددة للعنصر؛ فلغة الواجهة أو المحادثة لا تحدد لغة المنشور. كيّف التعابير والأمثلة ووحدات القياس والتواريخ والعملة والدعوات إلى الإجراء والإشارات الثقافية بمراجعة محلية، مع الحفاظ على المعنى المقصود ودقة المعلومات والقيود. اسأل قبل اختيار لهجة أو إضافة لغة ثانية. تجنّب الترجمة الحرفية وافتراض أن جميع المتحدثين بلغة واحدة لديهم التفضيلات نفسها.",
    },
    tags: [
      "language",
      "localization",
      "culture",
      "translation",
      "dialect",
      "لغة",
      "توطين",
      "ثقافة",
      "ترجمة",
      "لهجة",
    ],
    sourceUrl:
      "https://iccwbo.org/business-solutions/the-icc-advertising-and-marketing-communications-code/",
  },
  {
    key: "accessible-content",
    category: "operations",
    title: { en: "Make content accessible", ar: "راعِ إمكانية الوصول إلى المحتوى" },
    content: {
      en: "For prerecorded video with speech, include accurate synchronized captions in the language spoken; include meaningful non-speech audio when needed to understand the content. Keep captions from covering essential visuals. Use readable on-screen text and sufficient contrast, and do not place essential information only in an image when an accessible text option is available. Add meaningful alternative text for informative images where the channel supports it. Check current platform features and applicable accessibility requirements; this checklist alone is not a conformance claim.",
      ar: "أضف إلى الفيديو المسجل الذي يتضمن كلامًا ترجمة نصية متزامنة ودقيقة باللغة المنطوقة، وأدرج الأصوات غير الكلامية المهمة لفهم المحتوى عند الحاجة. لا تدع الترجمة تحجب عناصر بصرية أساسية. استخدم نصًا واضحًا على الشاشة وتباينًا كافيًا، ولا تضع معلومات أساسية في صورة فقط عندما يتوفر بديل نصي ميسّر. أضف نصًا بديلًا ذا معنى للصور المعلوماتية حيث تدعم القناة ذلك. تحقّق من ميزات المنصة الحالية ومتطلبات إمكانية الوصول المنطبقة؛ فهذه القائمة وحدها لا تثبت الامتثال لمعيار.",
    },
    tags: [
      "accessibility",
      "captions",
      "subtitles",
      "alt text",
      "contrast",
      "إمكانية الوصول",
      "ترجمة نصية",
      "نص بديل",
      "تباين",
    ],
    sourceUrl: "https://www.w3.org/TR/WCAG22/",
  },
  {
    key: "measurement-and-learning",
    category: "performance",
    title: { en: "Measure outcomes and capture learning", ar: "قِس النتائج وسجّل الدروس" },
    content: {
      en: "Before launch, choose a primary KPI aligned with the objective and record its source, baseline, time window, audience and paid/organic context, and sample size where available. Separate activity and reach measures from audience response and business outcomes; compare like periods, channels, and definitions. State data coverage and attribution limits. Small or partial samples support descriptive observations, not causal claims. After review, record what worked, confidence in the finding, and one practical next test; do not treat likes or reach alone as proof of business impact.",
      ar: "قبل الإطلاق، اختر مؤشر أداء رئيسيًا مرتبطًا بالهدف وسجّل مصدره وخط الأساس والفترة الزمنية وسياق الجمهور والمحتوى العضوي أو المدفوع وحجم العينة عند توفره. افصل مقاييس النشاط والوصول عن استجابة الجمهور ونتائج الأعمال، وقارن فترات وقنوات وتعريفات متكافئة. وضّح نطاق البيانات وحدود إسناد النتائج. تدعم العينات الصغيرة أو الجزئية ملاحظات وصفية، لا ادعاءات سببية. بعد المراجعة، سجّل ما نجح ومدى الثقة بالاستنتاج وتجربة عملية تالية؛ ولا تعتبر الإعجابات أو الوصول وحدهما دليلًا على أثر تجاري.",
    },
    tags: [
      "measurement",
      "analytics",
      "kpi",
      "baseline",
      "outcomes",
      "impact",
      "قياس",
      "تحليلات",
      "مؤشر أداء",
      "خط أساس",
      "نتائج",
      "أثر",
    ],
    sourceUrl: "https://amecorg.com/amecframework/home/supporting-material/planning/",
  },
];

export function getDefaultAssistantKnowledge(
  locale: AssistantKnowledgeLocale = "en",
): AssistantKnowledgeEntry[] {
  return DEFAULT_KNOWLEDGE.map((entry) => ({
    id: `planner-default-${entry.key}`,
    scope: "default",
    category: entry.category,
    title: entry.title[locale],
    content: entry.content[locale],
    tags: entry.tags,
    sourceUrl: entry.sourceUrl,
    verificationStatus: "verified",
    verifiedAt: new Date(DEFAULT_KNOWLEDGE_REVIEWED_AT),
    revision: DEFAULT_KNOWLEDGE_REVISION,
    updatedAt: new Date(DEFAULT_KNOWLEDGE_REVIEWED_AT),
    isBuiltIn: true,
  }));
}
