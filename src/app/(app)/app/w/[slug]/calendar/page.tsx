import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { listWorkspaceContent } from "@/lib/content/service";
import { StatusBadge } from "@/components/content/status-badge";
import { PageHeader } from "@/components/workspace/page-header";
import { MonthNav } from "@/components/workspace/month-nav";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export default async function EditorialCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const requested = (await searchParams).month;
  const valid = requested?.match(/^(\d{4})-(\d{2})$/);
  const reference = valid ? new Date(Number(valid[1]), Number(valid[2]) - 1, 1) : new Date();
  const monthStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const monthEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  const items = await listWorkspaceContent({ id: session.user.id }, workspace.id, {
    monthStart,
    monthEnd,
  });
  const firstWeekday = monthStart.getDay();
  const days = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((firstWeekday + days) / 7) * 7 },
    (_, index) => index - firstWeekday + 1,
  );
  const monthParam = (offset: number) => {
    const d = new Date(reference.getFullYear(), reference.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Editorial calendar"
        description="Planned publish dates in the workspace timezone."
        action={
          <MonthNav month={reference} buildHref={(offset) => `?month=${monthParam(offset)}`} />
        }
      />
      <div className="border-border bg-surface overflow-x-auto rounded-[var(--radius-card)] border">
        <div className="grid min-w-[760px] grid-cols-7">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="border-border text-label text-fg-muted border-b p-3 font-semibold"
            >
              {day}
            </div>
          ))}
          {cells.map((day, index) => (
            <div key={index} className="border-border min-h-32 border-r border-b p-2">
              <span className={day < 1 || day > days ? "invisible" : "text-label text-fg-muted"}>
                {day}
              </span>
              <div className="mt-2 space-y-1">
                {day >= 1 && day <= days
                  ? items
                      .filter((item) => item.plannedPublishAt.getDate() === day)
                      .map((item) => (
                        <Link
                          key={item.id}
                          href={`/app/w/${slug}/planning/${item.id}`}
                          className="border-border bg-surface-subtle block rounded border p-2"
                        >
                          <p className="text-label text-fg-primary truncate font-semibold">
                            {item.title}
                          </p>
                          <div className="mt-1">
                            <StatusBadge status={item.status} />
                          </div>
                        </Link>
                      ))
                  : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
