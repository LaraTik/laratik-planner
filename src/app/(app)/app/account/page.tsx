import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { Building2, Mail, ShieldCheck, User as UserIcon, Bell } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { agencyMemberships, agencies, users, workspaceMemberships } from "@/lib/db/schema";
import { getPasswordState } from "@/lib/auth/profile";
import { tForActive } from "@/lib/i18n/t-for-active";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
import { SignOutForm } from "./sign-out-form";
import { NotificationPreferencesForm } from "./notification-preferences-form";
import { ApplicationInfoCard } from "@/components/build-info/application-info-card";
import { createBuildInfo } from "@/lib/build-info";
import { serverEnv } from "@/lib/validation/env";
import { getNotificationPreferencesForUser } from "@/lib/notifications/service";

/**
 * Account page — own profile, password, agency membership, sign out.
 *
 * Five cards in this order:
 *  1. Profile (editable) — display name, name, avatar URL, locale.
 *  2. Password (editable, adaptive) — set or change password.
 *  3. Agency (read-only) — cross-tenant membership context.
 *  4. Application information (read-only) — build SHA + environment.
 *  5. Sign out (destructive) — one-click sign out via shared action.
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("account.title") };
}
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?error=AccessDenied");
  const userId = session.user.id;

  // Read the user row + agency + workspace count + password state
  // in parallel. `getPasswordState` is a small helper that returns
  // { hasPassword } so the Password card can pick the right copy.
  const [[profile], agencyRows, hasPassword, notificationPrefs] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        displayName: users.displayName,
        image: users.image,
        locale: users.locale,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        agencyId: agencies.id,
        agencyName: agencies.name,
        isAgencyAdmin: agencyMemberships.isAgencyAdmin,
        membershipStatus: agencyMemberships.status,
        workspaceCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${workspaceMemberships} wm
          WHERE wm.user_id = ${agencyMemberships.userId}
            AND wm.status = 'active'
        )`,
      })
      .from(agencyMemberships)
      .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
      .where(and(eq(agencyMemberships.userId, userId), eq(agencyMemberships.status, "active")))
      .limit(1),
    getPasswordState(userId),
    getNotificationPreferencesForUser(userId),
  ]);

  // `getPasswordState` returns null when the user row has vanished
  // (session is valid but the user was deleted between the JWT
  // issue and this render). Force a re-sign-in in that case.
  if (!profile || hasPassword === null) {
    redirect("/signin?error=AccessDenied");
  }
  const { t } = await tForActive();
  const agency = agencyRows[0];
  const buildInfo = createBuildInfo({
    version: serverEnv.APP_VERSION,
    environment: serverEnv.NODE_ENV,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="account-page">
      <PageHeader title={t("account.title")} description={t("account.description")} />

      <Card aria-labelledby="profile-heading" data-testid="profile-card">
        <CardTitle id="profile-heading" className="mb-1 flex items-center gap-2">
          <UserIcon className="h-4 w-4" aria-hidden="true" />
          {t("account.profile")}
        </CardTitle>
        <p className="text-body text-fg-muted mb-5">{t("account.profileBlurb")}</p>
        <div className="border-border bg-surface-subtle text-body text-fg-secondary mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-control)] border px-3 py-2">
          <span className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            {profile.email}
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <Badge variant={profile.role === "agency_admin" ? "primary" : "default"}>
              {profile.role === "agency_admin" ? t("account.agencyAdmin") : t("account.member")}
            </Badge>
          </span>
        </div>
        <ProfileForm
          values={{
            displayName: profile.displayName ?? profile.name ?? "",
            name: profile.name ?? "",
            image: profile.image ?? "",
            locale: profile.locale,
          }}
        />
      </Card>

      <Card aria-labelledby="password-heading" data-testid="password-card">
        <CardTitle id="password-heading" className="mb-1">
          {t("account.password")}
        </CardTitle>
        <p className="text-body text-fg-muted mb-5">
          {hasPassword.hasPassword ? t("account.passwordChange") : t("account.passwordSet")}
        </p>
        <PasswordForm hasPassword={hasPassword.hasPassword} />
      </Card>

      <Card
        aria-labelledby="notification-preferences-heading"
        data-testid="notification-preferences-card"
      >
        <CardTitle id="notification-preferences-heading" className="mb-1 flex items-center gap-2">
          <Bell className="h-4 w-4" aria-hidden="true" />
          {t("account.notifications")}
        </CardTitle>
        <p className="text-body text-fg-muted mb-5">{t("account.notificationsBlurb")}</p>
        <NotificationPreferencesForm initialPrefs={notificationPrefs} />
      </Card>

      <Card aria-labelledby="agency-heading" data-testid="agency-card">
        <CardTitle id="agency-heading" className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4" aria-hidden="true" />
          {t("account.agency")}
        </CardTitle>
        {agency ? (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr]">
            <dt className="text-body text-fg-muted">{t("account.agencyNameLabel")}</dt>
            <dd className="text-body text-fg-primary font-semibold">{agency.agencyName}</dd>
            <dt className="text-body text-fg-muted">{t("account.agencyAdminLabel")}</dt>
            <dd>
              <Badge variant={agency.isAgencyAdmin ? "success" : "default"}>
                {agency.isAgencyAdmin ? t("common.yes") : t("common.no")}
              </Badge>
            </dd>
            <dt className="text-body text-fg-muted">{t("account.workspaceCount")}</dt>
            <dd className="text-body text-fg-primary font-semibold">{agency.workspaceCount}</dd>
          </dl>
        ) : (
          <p className="text-body text-fg-muted mt-2">{t("account.noAgencyYet")}</p>
        )}
      </Card>

      <ApplicationInfoCard buildInfo={buildInfo} t={t} />

      <Card
        aria-labelledby="signout-heading"
        data-testid="sign-out-card"
        className="border-danger/20"
      >
        <CardTitle id="signout-heading" className="mb-1">
          {t("account.signOut")}
        </CardTitle>
        <p className="text-body text-fg-muted mb-4">{t("account.signOutBlurb")}</p>
        <SignOutForm variant="button" />
      </Card>
    </div>
  );
}
