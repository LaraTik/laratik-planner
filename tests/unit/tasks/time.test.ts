import { describe, expect, it } from "vitest";
import { formatTaskDuration, taskDurationMinutes } from "@/lib/tasks/time";

const t = (key: string, params?: Record<string, string | number>) => {
  if (key === "tasks.durationMinutes") return `${params?.count} min`;
  if (key === "tasks.durationHours") return `${params?.hours} hr`;
  return `${params?.hours} hr ${params?.minutes} min`;
};

describe("task time tracking", () => {
  it("calculates elapsed time until now and completion", () => {
    const started = new Date("2026-09-24T09:00:00.000Z");
    const completed = new Date("2026-09-24T10:45:00.000Z");
    expect(taskDurationMinutes(started, completed)).toBe(105);
    expect(taskDurationMinutes(started, null, completed)).toBe(105);
  });

  it("returns no duration before a task starts", () => {
    expect(taskDurationMinutes(null, null)).toBeNull();
  });

  it("formats compact hour and minute labels", () => {
    expect(formatTaskDuration(12, t)).toBe("12 min");
    expect(formatTaskDuration(60, t)).toBe("1 hr");
    expect(formatTaskDuration(105, t)).toBe("1 hr 45 min");
  });
});
