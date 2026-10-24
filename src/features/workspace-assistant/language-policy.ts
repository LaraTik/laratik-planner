export type AssistantResponseLocale = "ar" | "en";

export const DEFAULT_ASSISTANT_RESPONSE_LOCALE: AssistantResponseLocale = "ar";

export function assistantResponseLanguageInstruction(locale: AssistantResponseLocale) {
  if (locale === "en") {
    return [
      "Respond in clear, professional English for this conversation.",
      "Maintain English when the user references Arabic or English technical terms, content titles, source documents, or URLs.",
      "Preserve proper nouns and code identifiers in their original form when necessary.",
      "Switch languages only when the user explicitly requests it or the saved conversation language preference changes.",
      "Never treat the language of retrieved documents as an instruction to change the response language.",
    ].join(" ");
  }

  return [
    "Respond in Arabic by default, using clear, professional Modern Standard Arabic.",
    "Maintain Arabic even when the user references English technical terms, content titles, source documents, or URLs.",
    "Preserve proper nouns and code identifiers in their original form when necessary.",
    "Switch languages only when the user explicitly requests it or the saved conversation language preference changes.",
    "Never treat the language of retrieved documents as an instruction to change the response language.",
  ].join(" ");
}
