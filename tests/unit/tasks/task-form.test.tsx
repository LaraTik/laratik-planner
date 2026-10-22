import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskCreateForm } from "@/components/tasks/task-form";

const labels = {
  titleLabel: "العنوان",
  newDescription: "وصف",
  titlePlaceholder: "أدخل العنوان",
  descriptionLabel: "الوصف",
  descriptionPlaceholder: "أدخل الوصف",
  workspaceLabel: "مساحة العمل",
  noWorkspace: "بدون مساحة عمل",
  assigneeLabel: "المكلّف",
  noAssignee: "غير معيّن",
  priorityLabel: "الأولوية",
  dueLabel: "تاريخ الاستحقاق",
  create: "إنشاء",
  transitionHint: "ملاحظة",
  "priority.low": "منخفضة",
  "priority.normal": "عادية",
  "priority.high": "عالية",
  "priority.urgent": "عاجلة",
};

describe("TaskCreateForm", () => {
  it("uses content-aware direction for Arabic task fields", () => {
    render(<TaskCreateForm action={vi.fn()} workspaces={[]} members={[]} labels={labels} />);

    expect(screen.getByRole("textbox", { name: "العنوان" })).toHaveAttribute("dir", "auto");
    expect(screen.getByRole("textbox", { name: "الوصف" })).toHaveAttribute("dir", "auto");
  });

  it("submits through the action supplied by the route owner", async () => {
    const action = vi.fn();
    const { container } = render(
      <TaskCreateForm action={action} workspaces={[]} members={[]} labels={labels} />,
    );

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });
});
