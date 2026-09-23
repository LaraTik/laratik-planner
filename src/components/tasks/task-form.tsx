import { createTaskAction } from "@/app/(app)/app/tasks/actions";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { TASK_PRIORITIES } from "@/lib/tasks/service";

export function TaskCreateForm({
  workspaces,
  members,
  labels,
}: {
  workspaces: { id: string; name: string }[];
  members: { id: string; name: string; email: string }[];
  labels: Record<string, string>;
}) {
  const label = (key: string) => labels[key] ?? "";
  return (
    <form action={createTaskAction} className="max-w-3xl space-y-5">
      <Card padding="lg">
        <CardTitle>{label("titleLabel")}</CardTitle>
        <CardDescription>{label("newDescription")}</CardDescription>
        <div className="mt-6 space-y-5">
          <FormField id="task-title" label={label("titleLabel")} required>
            <input
              name="title"
              required
              maxLength={200}
              placeholder={label("titlePlaceholder")}
              className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
            />
          </FormField>
          <FormField id="task-description" label={label("descriptionLabel")}>
            <textarea
              name="description"
              rows={5}
              maxLength={10000}
              placeholder={label("descriptionPlaceholder")}
              className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block w-full rounded-[var(--radius-control)] border px-3 py-2 font-normal focus-visible:ring-2"
            />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="task-workspace" label={label("workspaceLabel")}>
              <select
                name="workspaceId"
                defaultValue=""
                className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
              >
                <option value="">{label("noWorkspace")}</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="task-assignee" label={label("assigneeLabel")}>
              <select
                name="assigneeId"
                defaultValue=""
                className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
              >
                <option value="">{label("noAssignee")}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="task-priority" label={label("priorityLabel")}>
              <select
                name="priority"
                defaultValue="normal"
                className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
              >
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {label(`priority.${priority}`)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="task-due-date" label={label("dueLabel")}>
              <input
                name="dueDate"
                type="date"
                className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2"
              />
            </FormField>
          </div>
          <p className="text-label text-fg-muted">{label("transitionHint")}</p>
          <Button type="submit">{label("create")}</Button>
        </div>
      </Card>
    </form>
  );
}
