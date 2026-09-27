import { z } from "zod";

/**
 * Workspace rename command.
 *
 * Scope is deliberately the **display name only**. `workspace.slug`
 * is the URL identity (`/app/w/[slug]/…`) and the lookup key used by
 * `findWorkspaceBySlug` (see `src/lib/workspaces/context.ts`), which
 * is the anti-IDOR gate for the whole tenant. Mutating it would
 * invalidate every bookmark, notification deep link, and browser
 * history entry for the workspace, and it would need a redirect
 * table to keep the old URL resolving without weakening that gate.
 * Renaming is therefore non-destructive; changing the URL is a
 * separate, deliberate migration.
 *
 * Normalisation happens before the length check so the stored value
 * is what was validated: trim the ends, collapse internal runs of
 * whitespace to a single space, then enforce bounds. A name of
 * `"  Lara   Tik  "` therefore stores as `"Lara Tik"` and cannot
 * smuggle 80 characters past the limit by hiding them in spaces.
 */
export const WORKSPACE_NAME_MIN_LENGTH = 1;
export const WORKSPACE_NAME_MAX_LENGTH = 80;

export const workspaceRenameCommandSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(WORKSPACE_NAME_MIN_LENGTH, "Workspace name is required")
        .max(WORKSPACE_NAME_MAX_LENGTH, "Workspace name is too long"),
    ),
});

export type WorkspaceRenameCommand = z.infer<typeof workspaceRenameCommandSchema>;

/**
 * Read + normalise the `name` field out of a settings form. Kept next
 * to the schema (rather than in the route) so the service and the
 * action layer share one definition of "a valid workspace name".
 */
export function nameFromForm(value: FormDataEntryValue | null): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
