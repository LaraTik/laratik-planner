import { permanentRedirect } from "next/navigation";

export const metadata = { title: "Platform · Access" };

export default function PlatformAdminsRedirectPage() {
  permanentRedirect("/app/platform/access");
}
