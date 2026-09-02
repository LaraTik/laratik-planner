import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { HashtagEditor, HASHTAG_MAX } from "@/components/forms/hashtag-editor";

/**
 * HashtagEditor — plan §3 acceptance:
 *   - Enter / comma / space commits a tag
 *   - Backspace on an empty input pops the last chip
 *   - Rejects duplicates
 *   - Caps at HASHTAG_MAX (30)
 *   - Strips leading `#` and trims
 *   - The hidden form field carries the joined string
 */
describe("HashtagEditor", () => {
  it("renders the existing chips", () => {
    render(
      <HashtagEditor
        id="tags"
        name="hashtags"
        label="Hashtags"
        value={["spring", "drop"]}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("spring")).toBeInTheDocument();
    expect(screen.getByText("drop")).toBeInTheDocument();
    expect(screen.getByText("2 / 30")).toBeInTheDocument();
  });

  it("commits a chip on Enter", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [tags, setTags] = React.useState<string[]>([]);
      return (
        <HashtagEditor
          id="tags"
          name="hashtags"
          label="Hashtags"
          value={tags}
          onChange={setTags}
        />
      );
    }
    render(<Wrapper />);
    const input = screen.getByTestId("hashtag-editor-input");
    await user.type(input, "spring");
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("hashtag-editor-chip")).toHaveTextContent("spring");
  });

  it("strips a leading #", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [tags, setTags] = React.useState<string[]>([]);
      return (
        <HashtagEditor
          id="tags"
          name="hashtags"
          label="Hashtags"
          value={tags}
          onChange={setTags}
        />
      );
    }
    render(<Wrapper />);
    const input = screen.getByTestId("hashtag-editor-input");
    await user.type(input, "#brand");
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("hashtag-editor-chip")).toHaveTextContent("brand");
  });

  it("rejects duplicates", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [tags, setTags] = React.useState<string[]>(["spring"]);
      return (
        <HashtagEditor
          id="tags"
          name="hashtags"
          label="Hashtags"
          value={tags}
          onChange={setTags}
        />
      );
    }
    render(<Wrapper />);
    const input = screen.getByTestId("hashtag-editor-input");
    await user.type(input, "spring");
    await user.keyboard("{Enter}");
    // Still only one chip — the duplicate was rejected.
    expect(screen.getAllByTestId("hashtag-editor-chip")).toHaveLength(1);
  });

  it("caps at HASHTAG_MAX", () => {
    const tags = Array.from({ length: HASHTAG_MAX }, (_, i) => `tag${i}`);
    render(
      <HashtagEditor
        id="tags"
        name="hashtags"
        label="Hashtags"
        value={tags}
        onChange={() => undefined}
      />,
    );
    // Counter shows the cap, and the input placeholder flips
    // to the "Maximum 30 hashtags" message.
    expect(screen.getByText("30 / 30")).toBeInTheDocument();
    const input = screen.getByTestId("hashtag-editor-input");
    expect(input.getAttribute("placeholder")).toMatch(/Maximum 30/i);
  });

  it("removes a chip when its X button is clicked", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [tags, setTags] = React.useState<string[]>(["a", "b"]);
      return (
        <HashtagEditor
          id="tags"
          name="hashtags"
          label="Hashtags"
          value={tags}
          onChange={setTags}
        />
      );
    }
    render(<Wrapper />);
    const removeA = screen.getByRole("button", { name: /Remove a/i });
    await user.click(removeA);
    // Now only "b" remains.
    expect(screen.getAllByTestId("hashtag-editor-chip")).toHaveLength(1);
    expect(screen.getByTestId("hashtag-editor-chip")).toHaveTextContent("b");
  });

  it("renders a hidden field with the joined tag list", () => {
    render(
      <HashtagEditor
        id="tags"
        name="hashtags"
        label="Hashtags"
        value={["a", "b", "c"]}
        onChange={() => undefined}
      />,
    );
    const hidden = document.querySelector<HTMLInputElement>('input[name="hashtags"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.value).toBe("a b c");
  });
});
