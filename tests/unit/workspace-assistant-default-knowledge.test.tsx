import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { KnowledgeLibrary } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/ai-assistant/knowledge-library";
import { getDefaultAssistantKnowledge } from "@/features/workspace-assistant/default-knowledge";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Planner default assistant knowledge", () => {
  it("returns nine stable, built-in entries in English and Arabic", () => {
    const english = getDefaultAssistantKnowledge("en");
    const arabic = getDefaultAssistantKnowledge("ar");

    expect(english).toHaveLength(9);
    expect(arabic.map((entry) => entry.id)).toEqual(english.map((entry) => entry.id));
    expect(new Set(english.map((entry) => entry.id)).size).toBe(english.length);
    expect(english.every((entry) => entry.scope === "default" && entry.isBuiltIn)).toBe(true);
    expect(arabic.every((entry) => entry.scope === "default" && entry.isBuiltIn)).toBe(true);
    expect(english.every((entry) => entry.title.length > 0 && entry.content.length > 0)).toBe(true);
    expect(arabic.every((entry) => entry.title.length > 0 && entry.content.length > 0)).toBe(true);
    expect(english[0]?.title).toBe("Set the objective and audience first");
    expect(arabic[0]?.title).toBe("حدّد الهدف والجمهور أولًا");
  });
});

describe("KnowledgeLibrary default guidance", () => {
  it("copies a built-in note into workspace knowledge as unverified", async () => {
    const entry = getDefaultAssistantKnowledge("en")[0];
    if (!entry) throw new Error("Expected the default knowledge pack to contain an entry");

    const serialize = (value: typeof entry) => ({
      ...value,
      verifiedAt: value.verifiedAt?.toISOString() ?? null,
      updatedAt: value.updatedAt.toISOString(),
    });
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ knowledge: [serialize(entry)] }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ knowledge: [] }) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <KnowledgeLibrary
          workspaceSlug="acme"
          locale="en"
          canManageWorkspace
          canManageAgency={false}
        />
      </LocaleProvider>,
    );

    await screen.findByText(entry.title);
    await user.click(screen.getByRole("button", { name: "Copy to workspace" }));
    expect(screen.getByLabelText("Review status")).toHaveValue("unverified");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const saveCall = fetchMock.mock.calls[1];
    expect(saveCall?.[0]).toBe("/api/ai/workspace-assistant/knowledge");
    const saved = JSON.parse(String(saveCall?.[1]?.body)) as {
      workspaceSlug: string;
      knowledge: { scope: string; verificationStatus: string; title: string; content: string };
    };
    expect(saved).toMatchObject({
      workspaceSlug: "acme",
      knowledge: {
        scope: "workspace",
        verificationStatus: "unverified",
        title: entry.title,
        content: entry.content,
      },
    });
  });
});
