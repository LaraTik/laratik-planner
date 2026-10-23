type Translator = (key: string) => string;

/** Localize a stable action error code without exposing arbitrary server text. */
export function localizeActionError(
  error: string,
  translate: Translator,
  codePrefix: string,
  catalogPrefix: string,
  fallback: string,
): string {
  if (!error.startsWith(codePrefix)) return error;
  const code = error.slice(codePrefix.length);
  if (!/^[a-z][a-z0-9_]*$/i.test(code)) return fallback;
  const key = `${catalogPrefix}.${code}`;
  const translated = translate(key);
  return translated === key ? fallback : translated;
}
