/**
 * Recover usable JSON documents from a truncated provider response.
 *
 * The provider streams a structured answer as JSON. When the model reaches
 * its output budget the stream stops mid-document, so the raw text is a
 * *prefix* of a valid JSON document rather than invalid JSON. Discarding the
 * whole response loses the parts that were already complete — typically the
 * `answer` field, which the model emits first.
 *
 * The recovery works by cutting the prefix at a point where a complete JSON
 * value ends and closing the structures that are still open. Several such
 * cut points exist, and they do not all yield equally usable documents: a cut
 * that lands in the middle of a nested object leaves that object without its
 * required fields. This module therefore returns every candidate, ordered
 * from the most complete to the least, and lets the caller pick the first one
 * that passes its own validation.
 *
 * A syntactically complete document is never repaired — if the text closes
 * every structure, whatever is wrong with it is not truncation.
 */

/** A container that is still open at a cut point. */
type OpenContainer = {
  /** The opening bracket: `{` for objects, `[` for arrays. */
  open: "{" | "[";
};

const CLOSING: Record<OpenContainer["open"], string> = { "{": "}", "[": "]" };

/**
 * Characters that can appear in a JSON number or literal. Runs of them are
 * treated as one value so a cut never lands inside `12` or `true`.
 */
function isValueRunCharacter(character: string): boolean {
  return /[0-9A-Za-z+.\-]/.test(character);
}

/**
 * Scan a JSON string starting at the opening quote.
 * Returns the index just after the closing quote, or `null` when the string
 * is unterminated (which means the document was cut inside it).
 */
function scanString(text: string, start: number): number | null {
  let index = start + 1;
  while (index < text.length) {
    const character = text[index];
    if (character === "\\") {
      index += 2;
      continue;
    }
    if (character === '"') return index + 1;
    index += 1;
  }
  return null;
}

/**
 * Produce every recoverable document for a truncated JSON text.
 *
 * The candidates are ordered from the most complete to the least complete.
 * An empty array means the text is either not JSON at all or a syntactically
 * complete document that needs no repair.
 */
export function repairTruncatedJsonCandidates(text: string): unknown[] {
  const cutPoints: { end: number; stack: OpenContainer[] }[] = [];
  const stack: OpenContainer[] = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index];
    if (character === '"') {
      const end = scanString(text, index);
      if (end === null) break;
      cutPoints.push({ end, stack: [...stack] });
      index = end;
      continue;
    }
    if (character === "{" || character === "[") {
      stack.push({ open: character });
      index += 1;
      continue;
    }
    if (character === "}" || character === "]") {
      if (stack.length === 0) return [];
      stack.pop();
      cutPoints.push({ end: index + 1, stack: [...stack] });
      index += 1;
      continue;
    }
    if (character !== undefined && isValueRunCharacter(character)) {
      let end = index + 1;
      while (end < text.length) {
        const next = text[end];
        if (next === undefined || !isValueRunCharacter(next)) break;
        end += 1;
      }
      cutPoints.push({ end, stack: [...stack] });
      index = end;
      continue;
    }
    index += 1;
  }

  // Every structure closed and no string was left open: the document is
  // complete, so there is nothing to repair.
  if (stack.length === 0) return [];

  const candidates: unknown[] = [];
  const seen = new Set<string>();
  // The most complete cut point first.
  for (const cutPoint of [...cutPoints].reverse()) {
    const closers = cutPoint.stack
      .map((container) => CLOSING[container.open])
      .reverse()
      .join("");
    const repaired = `${text.slice(0, cutPoint.end)}${closers}`;
    if (seen.has(repaired)) continue;
    seen.add(repaired);
    try {
      candidates.push(JSON.parse(repaired) as unknown);
    } catch {
      // This cut does not produce a valid document; try a shorter one.
    }
  }
  return candidates;
}
