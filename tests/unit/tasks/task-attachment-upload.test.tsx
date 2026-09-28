import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TaskAttachmentUpload } from "@/components/tasks/task-attachment-upload";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe("TaskAttachmentUpload", () => {
  it("falls back through the same-origin proxy when direct storage upload fails", async () => {
    const onUploaded = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            attachmentId: "attachment-1",
            uploadUrl: "https://storage.example.test/direct",
            proxyUploadUrl: "/api/tasks/task-1/attachments/proxy?attachmentId=attachment-1",
          }),
          { status: 201 },
        ),
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ attachment: { id: "attachment-1" } })));
    vi.stubGlobal("fetch", fetchMock);

    const { container, getAllByRole } = render(
      <TaskAttachmentUpload
        taskId="task-1"
        label="Add attachment"
        uploadingLabel="Uploading"
        errorLabel="Upload failed"
        sourceDeviceLabel="Device"
        sourceLinkLabel="Link"
        linkPlaceholder="https://example.com/file.pdf"
        addLinkLabel="Add link"
        previewLabel="Preview"
        retryLabel="Try again"
        removeLabel="Remove"
        onUploaded={onUploaded}
      />,
    );

    await userEvent
      .setup()
      .upload(
        container.querySelector('input[type="file"]')!,
        new File(["hello"], "notes.txt", { type: "text/plain" }),
      );
    await userEvent.setup().click(getAllByRole("button", { name: "Add attachment" })[1]!);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/tasks/task-1/attachments/proxy?attachmentId=attachment-1",
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe("/api/tasks/task-1/attachments/complete");
  });

  it("adds an external link through the task attachment source picker", async () => {
    const onUploaded = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ attachment: {} })));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <TaskAttachmentUpload
        taskId="task-1"
        label="Add attachment"
        uploadingLabel="Uploading"
        errorLabel="Upload failed"
        sourceDeviceLabel="Device"
        sourceLinkLabel="Link"
        linkPlaceholder="https://example.com/file.pdf"
        addLinkLabel="Add link"
        previewLabel="Preview"
        retryLabel="Try again"
        removeLabel="Remove"
        onUploaded={onUploaded}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Link" }));
    await user.type(screen.getByRole("textbox"), "https://example.com/file.pdf");
    await user.click(screen.getByRole("button", { name: "Add link" }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/tasks/task-1/attachments/link");
  });
});
