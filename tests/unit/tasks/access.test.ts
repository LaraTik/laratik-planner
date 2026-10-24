import { beforeEach, describe, expect, it, vi } from "vitest";

const authPolicy = vi.hoisted(() => ({
  isAgencyAdmin: vi.fn(),
  isAgencyMember: vi.fn(),
}));

vi.mock("@/lib/auth/policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/policy")>();
  return {
    ...actual,
    isAgencyAdmin: authPolicy.isAgencyAdmin,
    isAgencyMember: authPolicy.isAgencyMember,
  };
});

const { getTaskAccess } = await import("@/lib/tasks/access");

const task = {
  agencyId: "agency-1",
  createdBy: "creator-1",
  assigneeId: "assignee-1",
};

describe("getTaskAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authPolicy.isAgencyMember.mockResolvedValue(true);
    authPolicy.isAgencyAdmin.mockResolvedValue(false);
  });

  it("allows active agency members to view without granting task management", async () => {
    await expect(getTaskAccess({ id: "viewer-1" }, task)).resolves.toEqual({
      canView: true,
      canManage: false,
      isAgencyAdmin: false,
    });
  });

  it.each(["creator-1", "assignee-1"])("allows %s to manage the task", async (id) => {
    await expect(getTaskAccess({ id }, task)).resolves.toMatchObject({
      canView: true,
      canManage: true,
      isAgencyAdmin: false,
    });
  });

  it("allows an agency admin to manage and administer any task", async () => {
    authPolicy.isAgencyAdmin.mockResolvedValue(true);

    await expect(getTaskAccess({ id: "admin-1" }, task)).resolves.toEqual({
      canView: true,
      canManage: true,
      isAgencyAdmin: true,
    });
  });

  it("denies all access to non-members before checking admin status", async () => {
    authPolicy.isAgencyMember.mockResolvedValue(false);
    authPolicy.isAgencyAdmin.mockResolvedValue(true);

    await expect(getTaskAccess({ id: "outsider-1" }, task)).resolves.toEqual({
      canView: false,
      canManage: false,
      isAgencyAdmin: false,
    });
    expect(authPolicy.isAgencyAdmin).not.toHaveBeenCalled();
  });
});
