import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { tForActive } from "@/lib/i18n/t-for-active";

export default async function AgencyUnavailablePage() {
  const { t } = await tForActive();
  return (
    <main className="bg-canvas grid min-h-screen place-items-center p-6">
      <Card padding="lg" className="max-w-lg space-y-3">
        <CardTitle>{t("operational.agencyUnavailableTitle")}</CardTitle>
        <CardDescription>{t("operational.agencyUnavailableBody")}</CardDescription>
        <Link
          href="/signin"
          className="text-primary text-body font-semibold underline-offset-4 hover:underline"
        >
          {t("operational.agencyUnavailableCta")}
        </Link>
      </Card>
    </main>
  );
}
