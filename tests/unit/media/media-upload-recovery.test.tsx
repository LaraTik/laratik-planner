import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { MediaUploadForm, type MediaUploadResult } from "@/components/media/media-upload-form";

/**
 * Regression tests for the upload queue's recovery behaviour.
 *
 * `processing` is a legitimate outcome of `POST /api/media/assets`: the bytes
 * are stored and catalogued, only content validation is outstanding. Before
 * this fix the row sat at "processing" forever with no in-session recovery,
 * so the user's file never entered the delivery picker and the upload read as
 * a failure. Registering is idempotent, so the client now re-posts to poll.
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => refresh() }),
}));

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

let registerCalls: Array<{ status: string; id: string }> = [];
let ready: MediaUploadResult | undefined;

function stubFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/uploads/sign")) {
      return jsonResponse({
        uploadUrl: "https://storage.example.test/put",
        uploadIntentId: "intent-1",
        requiredHeaders: { "Content-Type": "image/png" },
      });
    }
    if (url.includes("/api/uploads/complete")) return jsonResponse({ objectId: "obj-1" });
    if (url.includes("/api/media/assets")) {
      const next = registerCalls.shift() ?? { status: "ready", id: "asset-1" };
      if (next.status === "ready")
        ready = { id: next.id, title: "hero.png", kind: "image", byteSize: 8 };
      return jsonResponse({ asset: { id: next.id, status: next.status } });
    }
    return jsonResponse({});
  });
}

function renderForm() {
  const onAssetReady = vi.fn();
  render(
    <LocaleProvider locale="en">
      <MediaUploadForm
        workspaceOptions={[{ id: "ws-1", name: "Northstar" }]}
        contentItemId="ci-1"
        onAssetReady={onAssetReady}
      />
    </LocaleProvider>,
  );
  return onAssetReady;
}

async function uploadHeroPng() {
  const user = userEvent.setup();
  const file = new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    "hero.png",
    {
      type: "image/png",
    },
  );
  await user.upload(screen.getByLabelText(/drop files|choose files/i), file);
  const button = await screen.findByRole("button", { name: /upload selected/i });
  await user.click(button);
}

beforeEach(() => {
  registerCalls = [];
  ready = undefined;
  refresh.mockReset();
  vi.stubGlobal("XMLHttpRequest", OkXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MediaUploadForm recovery", () => {
  it("promotes an asset that is still processing into the picker", async () => {
    registerCalls = [
      { status: "processing", id: "asset-1" },
      { status: "ready", id: "asset-1" },
    ];
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    const onAssetReady = renderForm();

    await uploadHeroPng();

    // The queue row must reach `ready` on its own, without a page reload.
    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument(), { timeout: 4000 });
    expect(onAssetReady).toHaveBeenCalledWith(
      expect.objectContaining({ id: "asset-1", kind: "image" }),
    );

    // One initial register plus one re-probe.
    const registerRequests = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/media/assets"),
    );
    expect(registerRequests).toHaveLength(2);
  });

  it("surfaces a permanently failed asset instead of leaving it in processing", async () => {
    registerCalls = [{ status: "failed", id: "asset-2" }];
    vi.stubGlobal("fetch", stubFetch());
    const onAssetReady = renderForm();

    await uploadHeroPng();

    await waitFor(
      () => expect(screen.getByText(/did not pass storage verification/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(onAssetReady).not.toHaveBeenCalled();
    // A definitive verdict must not be polled.
    expect(ready).toBeUndefined();
  });
});
