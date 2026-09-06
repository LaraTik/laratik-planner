import { randomUUID } from "node:crypto";

function assertSegment(name: string, value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value) || value === "." || value === "..") {
    throw new Error(`Invalid storage key ${name}`);
  }
  return value;
}

export function normalizeStoragePrefix(prefix: string): string {
  const normalized = prefix.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.split("/").some((part) => part === "." || part === ".." || !part)) {
    throw new Error("Invalid storage prefix");
  }
  return normalized;
}

export function createAgencyObjectKey(input: {
  agencyId: string;
  workspaceId: string;
  assetId?: string;
  extension: string;
  prefix?: string;
}): string {
  const prefix = normalizeStoragePrefix(input.prefix ?? `agencies/${input.agencyId}`);
  const agencyId = assertSegment("agencyId", input.agencyId);
  const workspaceId = assertSegment("workspaceId", input.workspaceId);
  const assetId = assertSegment("assetId", input.assetId ?? randomUUID());
  const extension = input.extension.replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]{1,12}$/.test(extension)) throw new Error("Invalid storage extension");
  const agencyRoot = `agencies/${agencyId}`;
  if (prefix !== agencyRoot && !prefix.startsWith(`${agencyRoot}/`))
    throw new Error("Storage prefix crosses agency boundary");
  return `${prefix}/workspaces/${workspaceId}/assets/${assetId}.${extension}`;
}

export function isObjectKeyInAgencyPrefix(key: string, agencyId: string, prefix?: string): boolean {
  const expected = normalizeStoragePrefix(
    prefix ?? `agencies/${assertSegment("agencyId", agencyId)}`,
  );
  return key.startsWith(`${expected}/`) && !key.includes("..") && !key.startsWith("/");
}
