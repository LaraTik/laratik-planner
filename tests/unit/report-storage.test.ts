import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
let temporaryDirectory: string | undefined;

afterEach(async () => {
  process.chdir(originalCwd);
  vi.resetModules();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("report storage retention", () => {
  // This contract performs 101 filesystem writes; allow extra time when the
  // full suite is running alongside other I/O tests.
  it("deletes PDF files when entries fall outside the 100-report history", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "planner-report-storage-"));
    process.chdir(temporaryDirectory);
    vi.resetModules();
    const { loadIndex, saveReport } = await import("@/lib/reports/storage");

    const first = await saveReport(reportRow(), Buffer.from("old report"));
    for (let index = 0; index < 100; index += 1) {
      await saveReport(reportRow(), Buffer.from(`report ${index}`));
    }

    const reportFiles = (await readdir(join(temporaryDirectory, "data/reports"))).filter((name) =>
      name.endsWith(".pdf"),
    );
    const history = await loadIndex();

    expect(history).toHaveLength(100);
    expect(history.some((row) => row.id === first.id)).toBe(false);
    expect(reportFiles).toHaveLength(100);
    await expect(
      readFile(join(temporaryDirectory, "data/reports", `${first.id}.pdf`)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }, 15_000);
});

function reportRow() {
  return {
    templateId: "analytics",
    agencyId: "agency-test",
    workspaceIds: ["workspace-test"],
    channelIds: ["channel-test"],
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-31T23:59:59.999Z",
    preset: "30d" as const,
    preparedFor: "",
  };
}
