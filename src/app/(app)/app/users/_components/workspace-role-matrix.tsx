"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { workspaceRoleSchema, type WorkspaceRole } from "@/lib/auth/invitation-command";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { roleLabel } from "@/lib/auth/role-labels";

/**
 * Shared per-workspace role multi-selector used by the "Send invitation",
 * "Add directly", and "Edit member" forms on /app/users.
 *
 * Multi-role contract:
 *  - Each workspace can hold ANY number of roles from the 7-value enum
 *    (including zero, which means "no access"). A user can hold
 *    `workspace_manager` + `designer` in the same workspace, for
 *    example — a planner who also designs for the workspace.
 *  - The hidden `workspaceRoles` input is JSON of
 *    `[{ workspaceId, roles: string[] }]`. The roles array is the full
 *    set assigned to that workspace (no duplicates — the UI filters
 *    them out before serialising).
 *  - Internal state is local to this component (one map of
 *    `workspaceId -> string[]`); it remounts when the parent form
 *    remounts (each form is `key`ed on its success id, so a successful
 *    submit naturally resets the selection). For the Edit drawer, the
 *    `defaultSelectedRoles` prop seeds the initial value from the
 *    member's existing assignments.
 *  - The matrix is the source of truth for which roles are
 *    user-selectable. Centralising the enum values here means a new
 *    role added to the schema flows to all three forms automatically
 *    (the chip set is derived from `workspaceRoleSchema.options`).
 *
 * Backward compatibility:
 *  - The previous shape was `[{ workspaceId, role }]` (one role per
 *    workspace). The action now accepts both shapes — a single
 *    `{ workspaceId, role }` entry is treated as a one-role grant.
 *    See `parseWorkspaceRolesJson` in `actions.ts`.
 */
export function WorkspaceRoleMatrix({
  workspaces,
  testId,
  defaultSelectedRoles,
  /**
   * When true, the per-workspace section is rendered with a "No access"
   * affordance (a `Remove all` button). When false, the picker is
   * purely additive — used in the "Add user" / "Invite" flows where
   * the absence of any selection already means "no access". Both
   * modes produce the same on-submit shape, so the action is
   * unchanged.
   */
  showNoAccessAction = false,
}: {
  workspaces: { id: string; name: string }[];
  testId?: string;
  defaultSelectedRoles?: Record<string, string[]>;
  showNoAccessAction?: boolean;
}) {
  const t = useLocaleT();
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) => {
    const value = t(key, params);
    if (value !== key && !value.startsWith(`[${key}]`)) return value;
    return fallback.replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? `{${name}}`));
  };
  const localizedRoleLabel = (role: WorkspaceRole) =>
    tr(`users.memberEdit.roleLabels.${role}`, roleLabel(role));

  /**
   * Per-instance id prefix for the role checkboxes.
   *
   * BUG (2026-10-05) — "assigning permission does nothing on /app/users,
   * but works on the workspace Team page". The checkbox id used to be
   * `workspace-role-${workspaceId}-${role}`, which is a function of the
   * workspace and the role ONLY. `/app/users` mounts this matrix THREE
   * times on one screen — the "Send invitation" tab, the "Add directly"
   * tab, and the edit drawer — so all three emitted byte-identical ids
   * for the same (workspace, role) pair. `document.querySelectorAll` on
   * the document reported 2 elements with one drawer's checkbox id, and
   * `<label htmlFor>` resolves to the FIRST match in tree order, which is
   * the invite form's checkbox. Every click on a drawer's role chip
   * therefore toggled the *invite form's* hidden checkbox and left the
   * drawer's own state untouched: `data-state` stayed `unchecked` and the
   * drawer's serialised `workspaceRoles` never changed. The save
   * submitted the previous selection, so the assignment silently reverted.
   *
   * The workspace Team page mounts only the drawer's matrix, so no other
   * element claimed the id and the same click resolved correctly — which
   * is exactly why the bug looked screen-specific.
   *
   * `useId` is the fix: React guarantees the value is unique across every
   * mounted instance (and stable across SSR/hydration), so each matrix
   * addresses only its own checkboxes no matter how many forms share the
   * page. Keying on `testId` would also work but couples correctness to
   * callers remembering to pass a distinct `testId`, which is exactly the
   * assumption that just broke.
   */
  /**
   * How many workspace blocks we render before the name filter appears.
   * Below this a filter is pure noise; above it the list is unusable
   * without one. 8 keeps a small agency's single-screen layout untouched.
   */
  const FILTER_THRESHOLD = 8;

  const instanceId = React.useId();
  const roleControlId = (workspaceId: string, role: string) =>
    `workspace-role${instanceId}-${workspaceId}-${role}`;

  const seed = React.useMemo<Record<string, string[]>>(() => {
    const next: Record<string, string[]> = {};
    for (const w of workspaces) {
      const initial = defaultSelectedRoles?.[w.id] ?? [];
      next[w.id] = Array.from(new Set(initial)).filter((r) =>
        (workspaceRoleSchema.options as readonly string[]).includes(r),
      );
    }
    return next;
  }, [workspaces, defaultSelectedRoles]);
  const [selectedRoles, setSelectedRoles] = React.useState<Record<string, string[]>>(seed);

  const toggleRole = (workspaceId: string, role: string) => {
    setSelectedRoles((prev) => {
      const current = prev[workspaceId] ?? [];
      const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
      const nextRecord = { ...prev };
      if (next.length === 0) delete nextRecord[workspaceId];
      else nextRecord[workspaceId] = next;
      return nextRecord;
    });
  };

  const clearWorkspace = (workspaceId: string) => {
    setSelectedRoles((prev) => {
      const next = { ...prev };
      delete next[workspaceId];
      return next;
    });
  };

  // Serialise to the multi-role shape. The action accepts both the
  // old single-role and the new multi-role shape for backward
  // compatibility, but the multi-role shape is the canonical
  // form.
  //
  // Bug history (2026-09-03, /ui-ux-pro-max): this serialiser
  // used to emit ONE entry per role
  // (`roles.map((role) => ({ workspaceId, roles: [role] }))`).
  // The action groups roles per workspace with
  // `Map.set(workspaceId, roles)`, so when the user picked
  // `designer` + `publisher` for the same workspace the two
  // entries collided on the same key and only the LAST role
  // survived — the symptom the user reported. The fix is to
  // emit one entry per workspace with the full roles[] in it.
  const serialised = React.useMemo(
    () =>
      JSON.stringify(
        Object.entries(selectedRoles)
          .filter(([, roles]) => roles.length > 0)
          .map(([workspaceId, roles]) => ({ workspaceId, roles: Array.from(new Set(roles)) })),
      ),
    [selectedRoles],
  );

  /**
   * Workspace filter.
   *
   * An agency can hold dozens of workspaces (the dev agency this was
   * fixed against holds 35), and every one of them renders a 7-chip
   * block. That is ~245 controls in one scrolling column, which buries
   * the member's actual access and turns "give them access to Acme" into
   * a scroll-and-scan task. Above `FILTER_THRESHOLD` we show a name
   * filter, and blocks with existing access are pinned to the top of the
   * list so the member's real state is always visible without scrolling.
   *
   * The filter only narrows what is RENDERED — `selectedRoles` and the
   * serialised payload are untouched, so filtering and then saving
   * cannot silently drop roles assigned in a hidden block.
   */
  const [filter, setFilter] = React.useState("");
  const showFilter = workspaces.length > FILTER_THRESHOLD;

  const visibleWorkspaces = React.useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? workspaces.filter((w) => w.name.toLowerCase().includes(needle))
      : workspaces;
    // Access-holding workspaces first; `localeCompare` keeps the
    // rest in a stable, human-sorted order rather than DB order.
    return [...matching].sort((a, b) => {
      const aHas = (selectedRoles[a.id] ?? []).length > 0 ? 0 : 1;
      const bHas = (selectedRoles[b.id] ?? []).length > 0 ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return a.name.localeCompare(b.name);
    });
  }, [workspaces, filter, selectedRoles]);

  return (
    <div className="space-y-3" data-testid={testId ? `${testId}-role-matrix` : undefined}>
      {showFilter ? (
        <div className="flex items-center gap-2">
          <Search className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            placeholder={tr("users.memberEdit.filterWorkspaces", "Filter {count} workspaces", {
              count: workspaces.length,
            })}
            aria-label={tr("users.memberEdit.filterWorkspacesAria", "Filter workspaces by name")}
            className="border-border bg-surface text-body text-fg-primary placeholder:text-fg-muted focus-visible:ring-focus-ring w-full rounded-[var(--radius-control)] border px-3 py-2 focus:outline-none focus-visible:ring-2"
            data-testid={testId ? `${testId}-workspace-filter` : undefined}
          />
          <span className="text-label text-fg-muted shrink-0 tabular-nums">
            {visibleWorkspaces.length}/{workspaces.length}
          </span>
        </div>
      ) : null}
      {visibleWorkspaces.length === 0 ? (
        <p
          className="text-body text-fg-muted"
          data-testid={testId ? `${testId}-no-match` : undefined}
        >
          {tr("users.memberEdit.noWorkspaceMatches", "No workspace matches “{filter}”.", {
            filter,
          })}
        </p>
      ) : null}
      {visibleWorkspaces.map((w) => {
        const selected = selectedRoles[w.id] ?? [];
        return (
          <div
            key={w.id}
            className="border-border bg-surface-subtle space-y-2 rounded-[var(--radius-control)] border p-3"
            data-testid={testId ? `${testId}-workspace-${w.id}` : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-body text-fg-primary font-semibold">{w.name}</p>
              {showNoAccessAction && selected.length > 0 ? (
                <button
                  type="button"
                  onClick={() => clearWorkspace(w.id)}
                  className="text-fg-muted hover:text-fg-primary text-label focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
                  aria-label={tr(
                    "users.memberEdit.removeAllAccessAria",
                    "Remove all access from {name}",
                    {
                      name: w.name,
                    },
                  )}
                  data-testid={testId ? `${testId}-clear-${w.id}` : undefined}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  {tr("users.memberEdit.removeAll", "Remove all")}
                </button>
              ) : null}
            </div>
            <fieldset>
              <legend className="sr-only">
                {tr("users.memberEdit.rolesFor", "Roles for {name}", { name: w.name })}
              </legend>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={tr("users.memberEdit.rolesFor", "Roles for {name}", { name: w.name })}
              >
                {workspaceRoleSchema.options.map((role) => {
                  const isOn = selected.includes(role);
                  const controlId = roleControlId(w.id, role);
                  return (
                    <div
                      key={role}
                      className={`text-label inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold transition-colors ${
                        isOn
                          ? "border-primary bg-primary-subtle text-primary"
                          : "border-border bg-surface text-fg-secondary hover:border-fg-secondary"
                      }`}
                      data-testid={testId ? `${testId}-chip-${w.id}-${role}` : undefined}
                    >
                      <Checkbox
                        id={controlId}
                        className="sr-only"
                        checked={isOn}
                        onCheckedChange={() => toggleRole(w.id, role)}
                        aria-label={tr("users.memberEdit.roleForWorkspace", "{role} for {name}", {
                          role: localizedRoleLabel(role),
                          name: w.name,
                        })}
                      />
                      <label htmlFor={controlId} className="cursor-pointer">
                        {localizedRoleLabel(role)}
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
            {selected.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-label text-fg-muted">
                  {tr("users.memberEdit.activeRoles", "Active:")}
                </span>
                {selected.map((role) => (
                  <Badge
                    key={role}
                    variant="primary"
                    data-testid={`${testId ?? "role-matrix"}-active-${w.id}-${role}`}
                  >
                    {localizedRoleLabel(role as WorkspaceRole)}
                    <button
                      type="button"
                      onClick={() => toggleRole(w.id, role)}
                      className="hover:text-primary-foreground focus-visible:ring-focus-ring ms-1 inline-flex h-4 w-4 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2"
                      aria-label={tr(
                        "users.memberEdit.removeRoleAria",
                        "Remove {role} from {name}",
                        { role: localizedRoleLabel(role as WorkspaceRole), name: w.name },
                      )}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p
                className="text-label text-fg-muted"
                data-testid={`${testId ?? "role-matrix"}-empty-${w.id}`}
              >
                {tr(
                  "users.memberEdit.noAccessWorkspace",
                  "No access — pick a role to grant access to this workspace.",
                )}
              </p>
            )}
          </div>
        );
      })}
      <input type="hidden" name="workspaceRoles" value={serialised} />
    </div>
  );
}
