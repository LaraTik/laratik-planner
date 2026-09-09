import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { listInstructionPacks } from "@/lib/ai/instruction-packs";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanningPackForm } from "./planning-pack-form";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("planningPacks.title") };
}

export default async function PlanningPacksPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) redirect("/signin");
  const context = await resolveActiveAgencyContext({ actor });
  if (!context || !(await isAgencyAdmin(actor, context.agencyId))) redirect("/app/agency-settings");
  const { t } = await tForActive();
  const packs = await listInstructionPacks(context.agencyId);
  const editId = (await searchParams).edit;
  const editingPack = editId ? packs.find((pack) => pack.id === editId) : undefined;
  return (
    <div className="space-y-6">
      <PageHeader title={t("planningPacks.title")} description={t("planningPacks.description")} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
        <PlanningPackForm {...(editingPack ? { initial: editingPack } : {})} />
        <Card>
          <CardHeader>
            <CardTitle>{t("planningPacks.existingTitle")}</CardTitle>
            <CardDescription>{t("planningPacks.existingDescription")}</CardDescription>
          </CardHeader>
          <div className="space-y-3 p-5">
            {packs.length ? (
              packs.map((pack) => (
                <div
                  key={pack.id}
                  className="border-border rounded-[var(--radius-control)] border p-3"
                >
                  <p className="text-body font-semibold">{pack.name}</p>
                  <p className="text-label text-fg-muted">
                    {t("planningPacks.revision", { revision: pack.revision })} ·{" "}
                    {t(`planningPacks.status.${pack.status}`)}
                  </p>
                  <div className="mt-2 flex gap-3">
                    <Link
                      className="text-label text-primary focus-visible:ring-focus-ring cursor-pointer rounded underline focus:outline-none focus-visible:ring-2"
                      href={`/app/agency-settings/planning-packs?edit=${pack.id}`}
                    >
                      {t("planningPacks.edit")}
                    </Link>
                    <Link
                      className="text-label text-primary focus-visible:ring-focus-ring cursor-pointer rounded underline focus:outline-none focus-visible:ring-2"
                      href={`/api/agency/planning-packs/export?id=${pack.id}`}
                    >
                      {t("planningPacks.export")}
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-body text-fg-muted">{t("planningPacks.empty")}</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
