import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineEditableField } from "@/components/forms/inline-editable-field";

describe("InlineEditableField", () => {
  it("renders the value in view mode by default", () => {
    render(
      <InlineEditableField
        label="brief"
        value="Hello world"
        render={(v) => <p>{v}</p>}
        renderEditor={({ value, onChange }) => (
          <input value={value} onChange={(e) => onChange(e.target.value)} />
        )}
        onSave={async () => ({ ok: true as const })}
      />,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("switches to edit mode when the pencil is clicked", async () => {
    render(
      <InlineEditableField
        label="brief"
        value="Hello world"
        render={(v) => <p>{v}</p>}
        renderEditor={({ value, onChange }) => (
          <input value={value} onChange={(e) => onChange(e.target.value)} />
        )}
        onSave={async () => ({ ok: true as const })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Edit brief/i }));
    expect(screen.getByDisplayValue("Hello world")).toBeInTheDocument();
  });

  it("calls onSave with the new value when Save is clicked", async () => {
    const onSave = vi.fn(async () => ({ ok: true as const }));
    render(
      <InlineEditableField
        label="brief"
        value="Hello"
        render={(v) => <p>{v}</p>}
        renderEditor={({ value, onChange }) => (
          <input value={value} onChange={(e) => onChange(e.target.value)} />
        )}
        onSave={onSave}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Edit brief/i }));
    const input = screen.getByDisplayValue("Hello");
    await userEvent.clear(input);
    await userEvent.type(input, "Updated");
    await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(onSave).toHaveBeenCalledWith("Updated");
  });

  it("stays in edit mode when the action errored", async () => {
    render(
      <InlineEditableField
        label="brief"
        value="Hello"
        render={(v) => <p>{v}</p>}
        renderEditor={({ value, onChange }) => (
          <input value={value} onChange={(e) => onChange(e.target.value)} />
        )}
        onSave={async () => ({ error: "Network error" })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Edit brief/i }));
    await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network error");
  });

  it("cancels without calling onSave when Cancel is clicked", async () => {
    const onSave = vi.fn(async () => ({ ok: true as const }));
    render(
      <InlineEditableField
        label="brief"
        value="Hello"
        render={(v) => <p>{v}</p>}
        renderEditor={({ value, onChange }) => (
          <input value={value} onChange={(e) => onChange(e.target.value)} />
        )}
        onSave={onSave}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Edit brief/i }));
    await userEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
