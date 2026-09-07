import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  classifyMediaKind,
  extensionForContentType,
  inspectExternalMediaUrl,
  MEDIA_SIZE_LIMITS,
  validateMediaSignature,
  type MediaKind,
} from "./contract";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 30_000;

export class MediaSourceError extends Error {
  constructor(
    public readonly code:
      | "provider_connection_required"
      | "invalid_url"
      | "unsafe_host"
      | "fetch_failed"
      | "unsupported_type"
      | "missing_length"
      | "too_large",
    message: string,
  ) {
    super(message);
    this.name = "MediaSourceError";
  }
}

type Lookup = typeof lookup;

function isPrivateIp(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && b !== undefined && b >= 18 && b <= 19) ||
      (a !== undefined && a >= 224)
    );
  }
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true;
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIp(mapped[1]!) : false;
}

async function assertSafeRemoteUrl(raw: string, dnsLookup: Lookup = lookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MediaSourceError("invalid_url", "The media link is not a valid URL.");
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443")) {
    throw new MediaSourceError("invalid_url", "Only HTTPS media links are supported.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new MediaSourceError("unsafe_host", "This host is not safe to fetch.");
  }
  if (isIP(host)) {
    if (isPrivateIp(host))
      throw new MediaSourceError("unsafe_host", "This host is not safe to fetch.");
    return url;
  }
  const addresses = await dnsLookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new MediaSourceError("unsafe_host", "This host is not safe to fetch.");
  }
  return url;
}

export async function fetchPublicMedia(input: {
  url: string;
  fetchImpl?: typeof fetch;
  dnsLookup?: Lookup;
}): Promise<{
  response: Response;
  finalUrl: string;
  provider: "google_drive" | "onedrive" | "external_url";
  kind: MediaKind;
  contentType: string;
  byteSize: number;
  extension: string;
}> {
  const inspected = inspectExternalMediaUrl(input.url);
  if (!inspected.ok) throw new MediaSourceError("invalid_url", "This media link is invalid.");

  const fetcher = input.fetchImpl ?? fetch;
  let current = await assertSafeRemoteUrl(
    publicDownloadUrl(inspected.provider, inspected.url),
    input.dnsLookup,
  );
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    let response: Response;
    try {
      response = await fetcher(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept:
            "image/*,video/*,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new MediaSourceError("fetch_failed", "The link could not be reached securely.");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new MediaSourceError("fetch_failed", "The link redirected too many times.");
      }
      current = await assertSafeRemoteUrl(new URL(location, current).toString(), input.dnsLookup);
      continue;
    }
    if (!response.ok || !response.body) {
      if (inspected.provider !== "external_url" && [401, 403].includes(response.status)) {
        throw new MediaSourceError(
          "provider_connection_required",
          "Connect the provider or make the file publicly downloadable.",
        );
      }
      throw new MediaSourceError("fetch_failed", "The link did not return a downloadable file.");
    }
    const contentType = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]!
      .trim()
      .toLowerCase();
    const kind = classifyMediaKind(contentType);
    if (!kind) {
      if (inspected.provider !== "external_url") {
        throw new MediaSourceError(
          "provider_connection_required",
          "Connect the provider or make the file publicly downloadable.",
        );
      }
      throw new MediaSourceError("unsupported_type", "The linked file type is not supported.");
    }
    const length = Number(response.headers.get("content-length"));
    if (!Number.isSafeInteger(length) || length < 1) {
      throw new MediaSourceError("missing_length", "The source did not provide a safe file size.");
    }
    if (length > MEDIA_SIZE_LIMITS[kind]) {
      throw new MediaSourceError("too_large", "The linked file exceeds the media size limit.");
    }
    const verified = await verifyResponseSignature(response, contentType);
    const extension = extensionForContentType(contentType);
    return {
      response: verified,
      finalUrl: current.toString(),
      provider: inspected.provider,
      kind,
      contentType,
      byteSize: length,
      extension,
    };
  }
  throw new MediaSourceError("fetch_failed", "The link could not be resolved.");
}

function publicDownloadUrl(
  provider: "google_drive" | "onedrive" | "external_url",
  rawUrl: string,
): string {
  if (provider === "google_drive") {
    const parsed = new URL(rawUrl);
    const pathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = pathMatch?.[1] ?? parsed.searchParams.get("id");
    if (!fileId) {
      throw new MediaSourceError(
        "provider_connection_required",
        "Connect Google Drive or provide a public direct-download link.",
      );
    }
    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download`;
  }
  if (provider === "onedrive") {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set("download", "1");
    return parsed.toString();
  }
  return rawUrl;
}

async function verifyResponseSignature(response: Response, contentType: string): Promise<Response> {
  if (!response.body) {
    throw new MediaSourceError("fetch_failed", "The linked file body could not be read safely.");
  }
  const reader = response.body.getReader();
  const buffered: Uint8Array[] = [];
  let bufferedLength = 0;
  try {
    while (bufferedLength < 512) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value) {
        buffered.push(next.value);
        bufferedLength += next.value.byteLength;
      }
    }
    const prefix = new Uint8Array(Math.min(bufferedLength, 512));
    let offset = 0;
    for (const chunk of buffered) {
      const copyLength = Math.min(chunk.byteLength, prefix.byteLength - offset);
      prefix.set(chunk.subarray(0, copyLength), offset);
      offset += copyLength;
      if (offset >= prefix.byteLength) break;
    }
    if (!validateMediaSignature(contentType, prefix).ok) {
      await reader.cancel();
      throw new MediaSourceError("unsupported_type", "The file content does not match its type.");
    }
  } catch (error) {
    if (error instanceof MediaSourceError) throw error;
    await reader.cancel();
    throw new MediaSourceError("fetch_failed", "The linked file body could not be read safely.");
  }

  let bufferedIndex = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (bufferedIndex < buffered.length) {
        controller.enqueue(buffered[bufferedIndex++]);
        return;
      }
      try {
        const next = await reader.read();
        if (next.done) controller.close();
        else if (next.value) controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
