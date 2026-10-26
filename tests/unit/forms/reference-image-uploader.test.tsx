import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import {
  ReferenceImageUploader,
  type ReferenceImage,
} from "@/components/forms/reference-image-uploader";

/**
 * The "Required image / design reference" field's upload half.
 *
 * The contract these tests lock:
 *   1. the field offers an upload affordance next to the URL list
 *   2. a chosen file is uploaded through the shared media contract and the
 *      registered asset id is handed back to the payload
 *   3. a file the field does not accept is refused in place, with a message
 *   4. a reference can be removed again
 */

/** Minimal XHR that reports success so the PUT hop resolves offline. */
class OkXhr {
  status = 200;
  upload = { addEventListener: () => undefined };
  listeners: Record<string, (() => void)[]> = {};
  addEventListener(type: string, handler: () => void) {
    (this.listeners[type] ??= []).push(handler);
  }
  setRequestHeader() {}
  open() {}
  send() {
    queueMicrotask(() => (this.listeners.load ?? []).forEach((h) => h()));
  }
  abort() {}
}

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as Response;

/** One recorded request, so a test can assert on what was actually sent. */
type RecordedRequest = { url: string; body: Record<string, unknown> | undefined };

function stubFetch(recorded: RecordedRequest[] = []) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    recorded.push({
      url,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    });
    if (url.includes("/api/uploads/sign")) {
      return jsonResponse({
        uploadUrl: "https://storage.example.test/put",
        uploadIntentId: "intent-1",
        requiredHeaders: { "Content-Type": "image/png" },
      });
    }
    if (url.includes("/api/uploads/complete")) return jsonResponse({ objectId: "obj-1" });
    if (url.includes("/api/media/assets")) {
      return jsonResponse({ asset: { id: "asset-1", status: "ready" } });
    }
    return jsonResponse({});
  });
}

function renderUploader(value: ReferenceImage[] = [], onChange = vi.fn()) {
  render(
    <LocaleProvider locale="en">
      <ReferenceImageUploader
        workspaceId="ws-1"
        contentItemId="ci-1"
        value={value}
        onChange={onChange}
      />
    </LocaleProvider>,
  );
  return onChange;
}

function heroPng() {
  return new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    "hero-reference.png",
    { type: "image/png" },
  );
}

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", OkXhr);
  // jsdom does not implement object URLs; the in-flight preview needs one.
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:preview",
    revokeObjectURL: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReferenceImageUploader", () => {
  it("offers an upload affordance alongside the uploaded references and the link list", () => {
    renderUploader();

    expect(screen.getByText("Choose files")).toBeInTheDocument();
    expect(screen.getByText("Uploaded images")).toBeInTheDocument();
    expect(screen.getByText("No images uploaded yet.")).toBeInTheDocument();
    // The file input only accepts images — the field is a reference-image
    // field, not a general media drop.
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    expect(input.getAttribute("accept")).toContain("image/png");
  });

  it("uploads a chosen image and reports the registered asset back to the payload", async () => {
    const user = userEvent.setup();
    const recorded: RecordedRequest[] = [];
    vi.stubGlobal("fetch", stubFetch(recorded));
    const onChange = renderUploader();

    await user.upload(screen.getByLabelText(/choose files/i), heroPng());

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([{ id: "asset-1", title: "hero-reference" }]),
    );

    // The asset is linked to the post, so it lands in that post's folder.
    const register = recorded.find((call) => call.url.includes("/api/media/assets"));
    expect(register?.body?.contentItemId).toBe("ci-1");
    expect(register?.body?.workspaceId).toBe("ws-1");

    // The sign step declares the file as an image so the storage contract
    // applies the image size limit.
    const sign = recorded.find((call) => call.url.includes("/api/uploads/sign"));
    expect(sign?.body?.kind).toBe("image");
    expect(sign?.body?.contentType).toBe("image/png");
  });

  it("refuses a dropped file that is not an image, in place", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const onChange = renderUploader();

    // A drag-and-drop bypasses the file picker's `accept` filter, so the
    // field has to refuse a non-image itself.
    const pdf = new File([new Uint8Array([1, 2, 3])], "brief.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByTestId("reference-image-dropzone"), {
      dataTransfer: { files: [pdf] },
    });

    expect(await screen.findByText(/not supported/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a reference that is already on the payload", async () => {
    const user = userEvent.setup();
    const onChange = renderUploader([{ id: "asset-1", title: "hero-reference" }]);

    expect(screen.getByAltText("hero-reference")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove hero-reference/i }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
