import type { MetaReadClient } from "./providers/meta";
import { META_DEFAULT_GRAPH_VERSION } from "@/lib/meta/version";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;

export class MetaHttpError extends Error {
  readonly status: number;
  readonly code: number | undefined;

  constructor(status: number, code?: number) {
    super("Meta advertising request failed");
    this.name = "MetaHttpError";
    this.status = status;
    this.code = code;
  }
}

/** Read-only Meta Graph adapter with bounded timeout and retry behavior. */
export function createMetaReadClient(
  graphApiVersion?: string | null,
  credential?: { accessToken: string; appSecretProof?: string },
): MetaReadClient {
  const version = graphApiVersion?.match(/^v\d+\.\d+$/)?.[0] ?? META_DEFAULT_GRAPH_VERSION;
  return {
    async get(path, params) {
      const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      let lastError: unknown;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const response = await fetch(url, {
            method: "GET",
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${credential?.accessToken ?? ""}`,
              ...(credential?.appSecretProof
                ? { "X-FB-APPSECRET-PROOF": credential.appSecretProof }
                : {}),
            },
            signal: controller.signal,
          });
          const body = (await response.json().catch(() => null)) as {
            error?: { code?: unknown };
          } | null;
          if (response.ok) return body;
          const providerCode = typeof body?.error?.code === "number" ? body.error.code : undefined;
          const retryable = response.status === 429 || response.status >= 500;
          lastError = new MetaHttpError(response.status, providerCode);
          if (!retryable || attempt === MAX_ATTEMPTS - 1) throw lastError;
        } catch (error) {
          lastError = error;
          if (error instanceof MetaHttpError && error.status < 500 && error.status !== 429)
            throw error;
          if (attempt === MAX_ATTEMPTS - 1) throw error;
        } finally {
          clearTimeout(timeout);
        }
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
      throw lastError instanceof Error ? lastError : new MetaHttpError(503);
    },
  };
}
