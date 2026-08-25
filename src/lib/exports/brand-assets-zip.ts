import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandAssets } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { buildZip, type ZipEntry } from "@/lib/utils/zip";
import { readFile, StorageNotFoundError } from "@/lib/storage";

/**
 * FEAT-15 (GAP-FULL-REVIEW-2026-08-25) — brand-asset ZIP export.
 *
 * Bundles every active brand asset in the workspace into a single
 * ZIP the planner can hand to a designer or upload to a third-party
 * DAM. Logos / fonts / guidelines / references that live in the
 * local volume (`storage_path` set) are read from disk and added
 * to the archive under their original extension. External links
 * (no `storage_path`) are emitted as a `links.txt` manifest so the
 * archive is still self-describing.
 */

interface BrandAssetExportSummary {
  includedFiles: number;
  externalLinks: number;
  missingFiles: number;
}

export async function exportBrandAssetsZip(
  actor: Actor,
  workspaceId: string,
): Promise<{ buffer: Buffer; filename: string; summary: BrandAssetExportSummary }> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "publisher",
    ]),
    "export_brand_assets_zip",
  );

  const rows = await db
    .select()
    .from(brandAssets)
    .where(and(eq(brandAssets.workspaceId, workspaceId), isNull(brandAssets.archivedAt)));

  const entries: ZipEntry[] = [];
  const manifestLines: string[] = ["# Brand asset manifest", `# workspace: ${workspaceId}`, ""];
  let includedFiles = 0;
  let externalLinks = 0;
  let missingFiles = 0;

  for (const asset of rows) {
    if (asset.storagePath) {
      try {
        const buf = await readFile(asset.storagePath);
        const ext = extFromPath(asset.storagePath);
        const safeName = safeFilename(asset.name);
        entries.push({
          name: `${asset.kind}/${safeName}.${ext || "bin"}`,
          data: buf,
        });
        includedFiles += 1;
        manifestLines.push(
          `${asset.kind}\t${safeName}.${ext || "bin"}\t(local)\t${asset.storagePath}`,
        );
      } catch (err) {
        if (err instanceof StorageNotFoundError) {
          missingFiles += 1;
          manifestLines.push(`${asset.kind}\t${asset.name}\tMISSING\t${asset.storagePath}`);
        } else {
          throw err;
        }
      }
    } else if (asset.externalUrl) {
      externalLinks += 1;
      manifestLines.push(`${asset.kind}\t${asset.name}\texternal\t${asset.externalUrl}`);
    } else {
      // Value-only asset (e.g. color swatch). Skip from the binary
      // zip but record in the manifest so the planner can re-create.
      manifestLines.push(
        `${asset.kind}\t${asset.name}\tvalue-only\t${JSON.stringify(asset.value ?? null)}`,
      );
    }
  }

  entries.push({
    name: "MANIFEST.txt",
    data: Buffer.from(manifestLines.join("\n") + "\n", "utf8"),
  });

  const buffer = buildZip(entries);
  const filename = `brand-assets-${new Date().toISOString().slice(0, 10)}.zip`;
  return {
    buffer,
    filename,
    summary: { includedFiles, externalLinks, missingFiles },
  };
}

function extFromPath(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

function safeFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 80) || "asset"
  );
}
