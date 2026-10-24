import { beforeEach, describe, expect, it, vi } from "vitest";
import canonicalManifest from "../../../docs/ai-planning/defaults/manifest.json";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
const actorMock = vi.hoisted(() => ({ currentActor: vi.fn() }));
const agencyContextMock = vi.hoisted(() => ({ resolveActiveAgencyContext: vi.fn() }));
const policyMock = vi.hoisted(() => ({ isAgencyAdmin: vi.fn() }));
const savePackMock = vi.hoisted(() => ({ saveInstructionPackDraft: vi.fn() }));
const loggerMock = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/config", () => authMock);
vi.mock("@/lib/auth/current-actor", () => actorMock);
vi.mock("@/lib/auth/agency-context", () => agencyContextMock);
vi.mock("@/lib/auth/policy", () => policyMock);
vi.mock("@/lib/ai/instruction-packs", () => savePackMock);
vi.mock("@/lib/observability/logger", () => loggerMock);

const { savePlanningPackAction } =
  await import("@/app/(app)/app/agency-settings/planning-packs/actions");

function validFormData() {
  const formData = new FormData();
  formData.set("name", "Quarterly plan");
  formData.set("sourceMarkdown", "Create a quarterly plan.");
  formData.set("manifest", JSON.stringify(canonicalManifest));
  return formData;
}

beforeEach(() => {
  authMock.auth.mockReset().mockResolvedValue({ user: { id: "user-1" } });
  actorMock.currentActor.mockReset().mockResolvedValue({ id: "user-1" });
  agencyContextMock.resolveActiveAgencyContext
    .mockReset()
    .mockResolvedValue({ agencyId: "agency-1" });
  policyMock.isAgencyAdmin.mockReset().mockResolvedValue(true);
  savePackMock.saveInstructionPackDraft.mockReset();
  loggerMock.logError.mockReset();
});

describe("savePlanningPackAction error boundary", () => {
  it("returns translated validation state instead of serializing malformed JSON errors", async () => {
    const formData = validFormData();
    formData.set("manifest", "{");

    const result = await savePlanningPackAction({}, formData);

    expect(result).toEqual({ errorCode: "invalid" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });

  it("logs unexpected persistence failures and returns stable safe state", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    savePackMock.saveInstructionPackDraft.mockRejectedValue(error);

    const result = await savePlanningPackAction({}, validFormData());

    expect(result).toEqual({ errorCode: "saveFailed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning_packs.save_failed", { err: error });
  });

  it("keeps the established not-found case as a stable error code", async () => {
    savePackMock.saveInstructionPackDraft.mockRejectedValue(
      new Error("Instruction pack not found."),
    );

    const result = await savePlanningPackAction({}, validFormData());

    expect(result).toEqual({ errorCode: "notFound" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });
});
