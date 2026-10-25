import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseWorkspaceAssistantResponse,
  parseWorkspaceAssistantResponseWithRecovery,
} from "@/features/workspace-assistant/analysis";
import { repairTruncatedJsonCandidates } from "@/features/workspace-assistant/repair-truncated-json";

/**
 * The fixtures are real provider responses that were cut off at the output
 * budget. They keep the failure honest: the recovery is exercised against
 * the shapes the model actually produces, not against a hand-written
 * approximation.
 */
const FIXTURE_NAMES = [
  "truncated-m3-400.json.txt",
  "truncated-m3-600.json.txt",
  "truncated-m3-1-flash-low-600.json.txt",
  "truncated-m3-1-flash-low-900.json.txt",
];

function fixture(name: string) {
  return readFileSync(join(process.cwd(), "tests/fixtures/workspace-assistant", name), "utf8");
}

function allowedEvidenceIds(text: string) {
  return new Set(text.match(/assistant-evidence-\d+/g) ?? []);
}

describe("truncated provider responses", () => {
  it("never repairs a syntactically complete document", () => {
    const complete = JSON.stringify({
      answer: "The plan has one item.",
      findings: [],
      recommendations: [],
      limitations: [],
    });

    expect(repairTruncatedJsonCandidates(complete)).toEqual([]);
    expect(repairTruncatedJsonCandidates("not json at all")).toEqual([]);
  });

  it("offers recoverable documents for a truncated response, most complete first", () => {
    const candidates = repairTruncatedJsonCandidates(fixture(FIXTURE_NAMES[0] ?? ""));

    expect(candidates.length).toBeGreaterThan(0);
    const answers = candidates
      .map((candidate) => (candidate as { answer?: unknown }).answer)
      .filter((answer): answer is string => typeof answer === "string");
    expect(answers.length).toBeGreaterThan(0);
    // The first candidate retains at least as much as any later one.
    expect(Math.max(...answers.map((answer) => answer.length))).toBe(answers[0]?.length ?? 0);
  });

  it.each(FIXTURE_NAMES)("recovers the answer from %s", (name) => {
    const text = fixture(name ?? "");

    expect(() => parseWorkspaceAssistantResponse(text, allowedEvidenceIds(text))).toThrow();

    const recovered = parseWorkspaceAssistantResponseWithRecovery(text, allowedEvidenceIds(text));

    expect(recovered.recovery).toBe("truncated");
    expect(recovered.response.answer.length).toBeGreaterThan(50);
    expect(recovered.response.findings.length).toBeGreaterThanOrEqual(0);
  });

  it("keeps a complete response unflagged", () => {
    const complete = JSON.stringify({
      answer: "The plan has one item.",
      findings: [],
      recommendations: [],
      limitations: [],
    });

    const parsed = parseWorkspaceAssistantResponseWithRecovery(complete, new Set());

    expect(parsed.recovery).toBe("none");
    expect(parsed.response.answer).toBe("The plan has one item.");
  });

  it("drops recovered findings that cite evidence outside the authorized context", () => {
    const text = fixture(FIXTURE_NAMES[0] ?? "");

    const recovered = parseWorkspaceAssistantResponseWithRecovery(text, new Set());

    expect(recovered.recovery).toBe("truncated");
    expect(recovered.response.findings).toEqual([]);
    expect(recovered.response.recommendations).toEqual([]);
  });

  it("drops a recovered finding that is missing required fields but keeps the rest", () => {
    const text = JSON.stringify({
      answer: "Recovered answer.",
      findings: [
        {
          title: "Complete",
          detail: "All fields present.",
          severity: "medium",
          evidenceIds: ["e1"],
        },
        { title: "Half written", severity: "medium", evidenceIds: ["e1"] },
      ],
      recommendations: [],
      limitations: [],
    }).slice(0, 200);

    const recovered = parseWorkspaceAssistantResponseWithRecovery(text, new Set(["e1"]));

    expect(recovered.recovery).toBe("truncated");
    expect(recovered.response.findings.map((finding) => finding.title)).toEqual(["Complete"]);
  });

  it("fails when the truncated document has no usable answer", () => {
    const truncated = '{"answer": "This answer was cut off';

    expect(() => parseWorkspaceAssistantResponseWithRecovery(truncated, new Set(["e1"]))).toThrow();
  });

  it("fails when a recovered answer exceeds the response limits", () => {
    const truncated = JSON.stringify({ answer: "x".repeat(5_001) });

    expect(() => parseWorkspaceAssistantResponseWithRecovery(truncated, new Set(["e1"]))).toThrow();
  });
});

describe("imperfect but complete provider responses", () => {
  it("keeps a complete answer that returns more findings than the response allows", () => {
    const findings = Array.from({ length: 11 }, (_, index) => ({
      title: `Finding ${index}`,
      detail: "A complete finding.",
      severity: "medium",
      evidenceIds: ["e1"],
    }));
    const document = JSON.stringify({
      answer: "The plan has eleven findings.",
      findings,
      recommendations: [],
      limitations: [],
    });

    const recovered = parseWorkspaceAssistantResponseWithRecovery(document, new Set(["e1"]));

    expect(recovered.recovery).toBe("pruned");
    expect(recovered.response.answer).toBe("The plan has eleven findings.");
    expect(recovered.response.findings).toHaveLength(8);
  });

  it("drops a complete finding that cites evidence the context does not authorize", () => {
    const document = JSON.stringify({
      answer: "The plan cites evidence.",
      findings: [
        {
          title: "Allowed",
          detail: "Uses authorized evidence.",
          severity: "low",
          evidenceIds: ["e1"],
        },
        {
          title: "Not allowed",
          detail: "Cites evidence outside the context.",
          severity: "low",
          evidenceIds: ["not-in-context"],
        },
      ],
      recommendations: [],
      limitations: [],
    });

    const recovered = parseWorkspaceAssistantResponseWithRecovery(document, new Set(["e1"]));

    expect(recovered.recovery).toBe("pruned");
    expect(recovered.response.findings.map((finding) => finding.title)).toEqual(["Allowed"]);
  });

  it("drops a complete finding that cites no evidence at all", () => {
    const document = JSON.stringify({
      answer: "The plan has one supported finding.",
      findings: [
        { title: "Supported", detail: "Cites evidence.", severity: "low", evidenceIds: ["e1"] },
        { title: "Unsupported", detail: "Cites nothing.", severity: "low", evidenceIds: [] },
      ],
      recommendations: [],
      limitations: [],
    });

    const recovered = parseWorkspaceAssistantResponseWithRecovery(document, new Set(["e1"]));

    expect(recovered.recovery).toBe("pruned");
    expect(recovered.response.findings.map((finding) => finding.title)).toEqual(["Supported"]);
  });

  it("accepts a citation list that covers every supplied evidence id", () => {
    const evidenceIds = Array.from({ length: 10 }, (_, index) => `e${index}`);
    const document = JSON.stringify({
      answer: "The plan cites everything.",
      findings: [
        {
          title: "Cites all evidence",
          detail: "A finding that cites the whole supplied set.",
          severity: "low",
          evidenceIds,
        },
      ],
      recommendations: [],
      limitations: [],
    });

    const recovered = parseWorkspaceAssistantResponseWithRecovery(document, new Set(evidenceIds));

    expect(recovered.recovery).toBe("none");
    expect(recovered.response.findings[0]?.evidenceIds).toHaveLength(10);
  });
});
