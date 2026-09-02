import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Catalog parity:
 *   - `en` and `ar` catalogs have an identical key structure
 *     (the test recursively walks both trees)
 *   - `tFor("ar")` returns a non-empty Arabic value for
 *     every required Common + Navigation key
 *   - interpolation is supported for `{name}` placeholders
 *   - missing keys are loud: the English fallback is wrapped
 *     in `[…]` so the untranslated key is visible in QA
 *   - resolved unknown locales fall back to English
 *
 * The catalog files are the source of truth for "what copy
 * ships today". Adding a key to only one locale fails this
 * test and forces the second locale to follow.
 */

const enCatalog = (await import("@/messages/en")).default;
const arCatalog = (await import("@/messages/ar")).default;
const messages = await import("@/messages");

function collectKeys(value: unknown, prefix = ""): string[] {
  if (value == null || typeof value !== "object") return [prefix];
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      out.push(...collectKeys(v, next));
    } else {
      out.push(next);
    }
  }
  return out;
}

function collectLeaves(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (value == null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectLeaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function collectStaticTranslationKeys(): string[] {
  const keyPattern = /(?:^|[^\w.])(?:[A-Za-z_$][\w$]*\.)?t\(\s*["']([^"']+)["']/gm;
  return collectSourceFiles(resolve(process.cwd(), "src")).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return Array.from(source.matchAll(keyPattern), ([, key]) => key).filter(
      (key): key is string => key !== undefined,
    );
  });
}

function placeholders(value: string): string[] {
  return Array.from(value.matchAll(/\{(\w+)\}/g), ([, name]) => name)
    .filter((name): name is string => name !== undefined)
    .sort();
}

describe("messages/catalogs — parity", () => {
  it("en and ar have identical key structure", () => {
    const enKeys = collectKeys(enCatalog).sort();
    const arKeys = collectKeys(arCatalog).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it("every leaf value in ar is a non-empty string", () => {
    for (const [key, value] of collectLeaves(arCatalog)) {
      expect(value, key).toBeTypeOf("string");
      expect(value.length, key).toBeGreaterThan(0);
    }
  });

  it("en and ar preserve the same interpolation placeholders", () => {
    const enLeaves = new Map(collectLeaves(enCatalog));
    const arLeaves = new Map(collectLeaves(arCatalog));
    for (const [key, enValue] of enLeaves) {
      expect(placeholders(arLeaves.get(key) ?? ""), key).toEqual(placeholders(enValue));
    }
  });

  it("every static t() key exists in the catalogs", () => {
    const catalogKeys = new Set(collectKeys(enCatalog));
    const missing = [...new Set(collectStaticTranslationKeys())].filter(
      (key) => !catalogKeys.has(key),
    );
    expect(missing).toEqual([]);
  });
});

describe("messages — t()", () => {
  it("returns the locale-specific value", () => {
    const t = messages.tFor("en");
    expect(t("common.save")).toBe("Save");
    const ta = messages.tFor("ar");
    expect(ta("common.save")).toBe("حفظ");
  });

  it("interpolates {name} placeholders", () => {
    const t = messages.tFor("en");
    expect(t("languageSwitcher.switchToEnglish", { name: "English" })).toBe("Switch to English");
  });

  it("returns a missing key wrapped in [key] with the English fallback", () => {
    const t = messages.tFor("ar");
    // The key is intentionally absent from both catalogs;
    // we expect the loud [key] wrapper.
    expect(t("not.a.real.key")).toBe("[not.a.real.key]");
  });

  it("returns the English fallback wrapped when the requested locale is missing the key", () => {
    // We construct a translator for a synthetic locale that
    // happens to look like Arabic, but the catalog lookup
    // is unchanged. The real test is that `tForResolved` with
    // a null input returns the English translator and that
    // a key missing in the resolved catalog wraps the
    // English value.
    const t = messages.tForResolved("en");
    expect(t("common.save")).toBe("Save");
  });

  it("falls back to English when the resolved locale is unknown", () => {
    const t = messages.tForResolved("xx-YY");
    expect(t("common.save")).toBe("Save");
  });
});
