"use client";

import * as React from "react";

import { makeTranslator } from "@/messages";
import type { LocaleCode } from "@/lib/i18n/locales";

export type ClientTranslator = ReturnType<typeof makeTranslator>;

const LocaleContext = React.createContext<ClientTranslator | null>(null);
const LocaleCodeContext = React.createContext<LocaleCode>("en");

/**
 * Client-side translation boundary. The server passes only the
 * serialisable locale code; the translator function is created inside
 * the client tree and never crosses the React Server Component boundary.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: LocaleCode;
  children: React.ReactNode;
}) {
  const t = React.useMemo(() => makeTranslator(locale), [locale]);
  return (
    <LocaleCodeContext.Provider value={locale}>
      <LocaleContext.Provider value={t}>{children}</LocaleContext.Provider>
    </LocaleCodeContext.Provider>
  );
}

/** Read the translator for the active server-resolved interface locale. */
export function useLocaleT(): ClientTranslator {
  const t = React.useContext(LocaleContext);
  // Keep isolated component previews and tests usable while production
  // trees still receive the active locale from the root provider.
  return t ?? makeTranslator("en");
}

/** Read the active locale for locale-aware formatting in client components. */
export function useLocaleCode(): LocaleCode {
  return React.useContext(LocaleCodeContext);
}
