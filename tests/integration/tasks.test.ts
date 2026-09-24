import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencies,
  agencyMemberships,
  agencyTasks,
  taskActivityEvents,
  users,
  workspaces,
} from "@/lib/db/schema";
import { createTask, listTasks, updateTask } from "@/lib/tasks/service";
import { getAgencyCalendarView } from "@/lib/planning/calendar";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
});

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE
      task_attachment, task_activity_event, agency_task,
      workspace_membership_role, workspace_membership, workspace_settings,
      workspace, agency_membership, bootstrap_lock, agency, "user"
    RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  await pool.end();
});

async function fixture() {
  const [agency] = await db.insert(agencies).values({ name: "Acme", slug: "acme" }).returning();
  const [creator] = await db
    .insert(users)
    .values({ email: "creator@example.com", displayName: "Creator" })
    .returning();
  const [other] = await db
    .insert(users)
    .values({ email: "other@example.com", displayName: "Other" })
    .returning();
  if (!agency || !creator || !other) throw new Error("fixture failed");
  await db.insert(agencyMemberships).values([
    { agencyId: agency.id, userId: creator.id, status: "active" },
    { agencyId: agency.id, userId: other.id, status: "active" },
  ]);
  const [workspace] = await db
    .insert(workspaces)
    .values({
      agencyId: agency.id,
      name: "Main",
      slug: "main",
      createdBy: creator.id,
    })
    .returning();
  if (!workspace) throw new Error("workspace fixture failed");
  return { agency, creator, other, workspace };
}

describe("agency tasks", () => {
  it("creates an agency task, records activity, and paginates it", async () => {
    const { agency, creator, workspace } = await fixture();
    const task = await createTask(
      { id: creator.id },
      {
        agencyId: agency.id,
        title: "Prepare launch checklist",
        workspaceId: workspace.id,
        dueAt: new Date("2026-09-24T12:00:00.000Z"),
      },
    );

    const [activity] = await db
      .select()
      .from(taskActivityEvents)
      .where(eq(taskActivityEvents.taskId, task.id));
    expect(activity?.kind).toBe("created");
    const result = await listTasks(
      { id: creator.id },
      { agencyId: agency.id, page: 1, pageSize: 1 },
    );
    expect(result.total).toBe(1);
    expect(result.rows[0]?.title).toBe("Prepare launch checklist");
  });

  it("rejects a workspace from another agency before writing the task", async () => {
    const { agency, creator } = await fixture();
    const [otherAgency] = await db
      .insert(agencies)
      .values({ name: "Other Agency", slug: "other-agency" })
      .returning();
    if (!otherAgency) throw new Error("other agency fixture failed");
    const [otherWorkspace] = await db
      .insert(workspaces)
      .values({
        agencyId: otherAgency.id,
        name: "Other Workspace",
        slug: "other",
        createdBy: creator.id,
      })
      .returning();
    if (!otherWorkspace) throw new Error("other workspace fixture failed");

    await expect(
      createTask(
        { id: creator.id },
        {
          agencyId: agency.id,
          title: "Must not cross tenant",
          workspaceId: otherWorkspace.id,
        },
      ),
    ).rejects.toThrow("task.workspace_invalid");
    const rows = await db.select().from(agencyTasks).where(eq(agencyTasks.agencyId, agency.id));
    expect(rows).toHaveLength(0);
  });

  it("co-commits status changes and activity, including completion time", async () => {
    const { agency, creator } = await fixture();
    const task = await createTask(
      { id: creator.id },
      { agencyId: agency.id, title: "Review copy" },
    );
    const updated = await updateTask({ id: creator.id }, task.id, { status: "in_progress" });
    expect(updated.status).toBe("in_progress");
    expect(updated.startedAt).toBeInstanceOf(Date);
    const completed = await updateTask({ id: creator.id }, task.id, { status: "in_review" });
    expect(completed.completedAt).toBeNull();
    const done = await updateTask({ id: creator.id }, task.id, { status: "done" });
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(done.startedAt).toBeInstanceOf(Date);
    expect(done.completedAt!.getTime()).toBeGreaterThanOrEqual(done.startedAt!.getTime());
    const activity = await db
      .select()
      .from(taskActivityEvents)
      .where(eq(taskActivityEvents.taskId, task.id));
    expect(activity.filter((event) => event.kind === "status_changed")).toHaveLength(3);
  });

  it("filters the global calendar by workspace and task assignee", async () => {
    const { agency, creator, other, workspace } = await fixture();
    const [secondWorkspace] = await db
      .insert(workspaces)
      .values({
        agencyId: agency.id,
        name: "Second",
        slug: "second",
        createdBy: creator.id,
      })
      .returning();
    if (!secondWorkspace) throw new Error("second workspace fixture failed");
    await createTask(
      { id: creator.id },
      {
        agencyId: agency.id,
        title: "Creator task",
        workspaceId: workspace.id,
        dueAt: new Date("2026-09-24T12:00:00.000Z"),
      },
    );
    const assignedTask = await createTask(
      { id: creator.id },
      {
        agencyId: agency.id,
        title: "Other task",
        workspaceId: secondWorkspace.id,
        assigneeId: other.id,
        dueAt: new Date("2026-09-24T13:00:00.000Z"),
      },
    );

    const calendar = await getAgencyCalendarView(
      { id: creator.id },
      agency.id,
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-10-01T00:00:00.000Z"),
      { workspaceId: secondWorkspace.id, assigneeId: other.id },
    );
    expect(calendar.events).toEqual([
      expect.objectContaining({ id: assignedTask.id, kind: "task", title: "Other task" }),
    ]);
  });
});
