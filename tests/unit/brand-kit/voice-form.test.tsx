import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// `useFormStatus` is a React 19 server-action hook that only works
// inside a <form action>. Mock it so the form is always "not pending"
// in the test environment.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: vi.fn(),
  };
});

vi.mock("@/app/(app)/app/w/[slug]/brand-kit/actions", () => ({
  createVoiceRuleAction: vi.fn(),
  archiveVoiceRuleAction: vi.fn(),
}));

import { useFormStatus } from "react-dom";
import { VoiceForm } from "@/app/(app)/app/w/[slug]/brand-kit/voice-form";

const mockedUseFormStatus = vi.mocked(useFormStatus);

describe("VoiceForm", () => {
  it("renders three sub-forms (Tone / Do / Don't), each with a hidden ruleType", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<VoiceForm slug="test-slug" />);

    // One per kind.
    const tone = document.querySelector<HTMLInputElement>('input[name="ruleType"][value="tone"]');
    const doRule = document.querySelector<HTMLInputElement>('input[name="ruleType"][value="do"]');
    const dontRule = document.querySelector<HTMLInputElement>(
      'input[name="ruleType"][value="dont"]',
    );
    expect(tone).not.toBeNull();
    expect(doRule).not.toBeNull();
    expect(dontRule).not.toBeNull();

    // Three submit buttons, one per kind. Use exact matchers since
    // "Add do" and "Add don't" share a prefix.
    expect(screen.getByRole("button", { name: "Add tone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add do" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add don't" })).toBeInTheDocument();
  });

  it("uses a single-line input for tone and a textarea for do/dont", () => {
    mockedUseFormStatus.mockReturnValue({ pending: false } as ReturnType<typeof useFormStatus>);
    render(<VoiceForm slug="test-slug" />);
    // Tone uses an <input>; do/dont use <textarea>.
    const contentInputs = document.querySelectorAll<HTMLInputElement>('input[name="content"]');
    const contentTextareas = document.querySelectorAll<HTMLTextAreaElement>(
      'textarea[name="content"]',
    );
    expect(contentInputs).toHaveLength(1);
    expect(contentTextareas).toHaveLength(2);
  });
});
