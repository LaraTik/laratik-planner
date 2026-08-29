import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdvancedDisclosure } from "@/components/forms/advanced-disclosure";
import { type FieldDef } from "@/components/forms/format-payload-field-set";

const FIELDS: FieldDef[] = [
  { key: "voiceOverNotes", label: "Voiceover notes", group: "advanced" },
  { key: "audioReference", label: "Audio reference", group: "advanced" },
  { key: "coverDirection", label: "Cover direction", group: "advanced" },
];

describe("AdvancedDisclosure", () => {
  beforeEach(() => {
    // Clear localStorage between tests so preferences don't leak
    // across runs. JSDOM's `localStorage` is the same instance
    // for all tests in a file.
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("renders collapsed by default with the right count", () => {
    render(
      <AdvancedDisclosure
        fields={FIELDS}
        format="short_form_video"
        payload={{}}
        renderField={(f) => <div data-testid={`field-${f.key}`}>{f.label}</div>}
      />,
    );
    const disclosure = screen.getByTestId("advanced-disclosure");
    expect(disclosure).toHaveAttribute("data-open", "false");
    expect(within(disclosure).getByTestId("advanced-disclosure-show")).toHaveTextContent(
      "Advanced details (3)",
    );
  });

  it("does not render empty advanced fields in the collapsed state", () => {
    render(
      <AdvancedDisclosure
        fields={FIELDS}
        format="short_form_video"
        payload={{}}
        renderField={(f) => <div data-testid={`field-${f.key}`}>{f.label}</div>}
      />,
    );
    expect(screen.queryByTestId("field-voiceOverNotes")).toBeNull();
    expect(screen.queryByTestId("field-audioReference")).toBeNull();
  });

  it("auto-expands populated advanced fields above the disclosure", () => {
    render(
      <AdvancedDisclosure
        fields={FIELDS}
        format="short_form_video"
        payload={{ voiceOverNotes: "Soft whisper, second beat" }}
        renderField={(f) => <div data-testid={`field-${f.key}`}>{f.label}</div>}
      />,
    );
    // The disclosure is still collapsed, but the populated
    // field is rendered above it so the planner sees their
    // existing work.
    expect(screen.getByTestId("advanced-disclosure")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("field-voiceOverNotes")).toBeInTheDocument();
    expect(screen.getByTestId("field-voiceOverNotes")).toHaveTextContent("Voiceover notes");
    // Empty fields stay hidden.
    expect(screen.queryByTestId("field-audioReference")).toBeNull();
  });

  it("expands the disclosure when the user clicks the button", async () => {
    render(
      <AdvancedDisclosure
        fields={FIELDS}
        format="short_form_video"
        payload={{}}
        renderField={(f) => <div data-testid={`field-${f.key}`}>{f.label}</div>}
      />,
    );
    await userEvent.click(screen.getByTestId("advanced-disclosure-show"));
    expect(screen.getByTestId("advanced-disclosure")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("field-voiceOverNotes")).toBeInTheDocument();
    expect(screen.getByTestId("field-audioReference")).toBeInTheDocument();
    expect(screen.getByTestId("field-coverDirection")).toBeInTheDocument();
    // The collapse button replaces the show button.
    expect(screen.getByTestId("advanced-disclosure-collapse")).toBeInTheDocument();
  });

  it("respects the always-show preference via localStorage", async () => {
    // Pre-seed the preference. The first render with the
    // preference set opens the disclosure immediately.
    window.localStorage.setItem(
      "laratik.format.alwaysShowAdvanced",
      JSON.stringify({ short_form_video: true }),
    );
    render(
      <AdvancedDisclosure
        fields={FIELDS}
        format="short_form_video"
        payload={{}}
        renderField={(f) => <div data-testid={`field-${f.key}`}>{f.label}</div>}
      />,
    );
    // The disclosure opens automatically when the preference
    // is set on mount.
    expect(screen.getByTestId("advanced-disclosure")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("field-voiceOverNotes")).toBeInTheDocument();
  });

  it("renders nothing when there are no advanced fields", () => {
    const { container } = render(
      <AdvancedDisclosure
        fields={[]}
        format="static_post"
        payload={{}}
        renderField={(f) => <div>{f.label}</div>}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("treats empty strings, empty arrays, and empty objects as unfilled", () => {
    render(
      <AdvancedDisclosure
        fields={FIELDS}
        format="short_form_video"
        payload={{
          voiceOverNotes: "   ",
          audioReference: [],
          coverDirection: {},
        }}
        renderField={(f) => <div data-testid={`field-${f.key}`}>{f.label}</div>}
      />,
    );
    expect(screen.queryByTestId("field-voiceOverNotes")).toBeNull();
    expect(screen.queryByTestId("field-audioReference")).toBeNull();
    expect(screen.queryByTestId("field-coverDirection")).toBeNull();
  });
});
