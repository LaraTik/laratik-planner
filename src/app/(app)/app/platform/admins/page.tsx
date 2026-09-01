import { permanentRedirect } from "next/navigation";
import { tForActive } from "@/lib/i18n/t-for-active";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("platform.accessTitle") };
}

export default function PlatformAdminsRedirectPage() {
  permanentRedirect("/app/platform/access");
}
