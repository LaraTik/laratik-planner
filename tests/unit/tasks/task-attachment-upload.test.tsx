import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
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

    const { container } = render(
      <TaskAttachmentUpload
        taskId="task-1"
        label="Add attachment"
        uploadingLabel="Uploading"
        errorLabel="Upload failed"
        onUploaded={onUploaded}
      />,
    );

    await userEvent
      .setup()
      .upload(
        container.querySelector('input[type="file"]')!,
        new File(["hello"], "notes.txt", { type: "text/plain" }),
      );

    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/tasks/task-1/attachments/proxy?attachmentId=attachment-1",
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe("/api/tasks/task-1/attachments/complete");
  });
});
