"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, Settings, Users, Share2, Copy, Archive } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

/**
 * Workspace row actions — a Radix dropdown that surfaces the
 * secondary actions available for a workspace in the
 * `/app/workspaces` list.
 *
 * The row itself is clickable (it links to the workspace
 * overview), so the kebab is the only place secondary actions
 * live. Each item is shown only if the product actually supports
 * it; the §13 spec calls this out explicitly:
 *
 *   "Only expose actions currently supported by the product.
 *    Do not invent unsupported destructive operations."
 *
 * Today the only supported destructive action is `archive`. The
 * "Duplicate workspace" entry is a placeholder; once the
 * service lands it becomes a real action.
 */
export function WorkspaceRowActions({
  slug,
  name,
  canArchive = false,
  canDuplicate = false,
  canManageTeam = true,
  canEditSettings = true,
}: {
  slug: string;
  name: string;
  canArchive?: boolean;
  canDuplicate?: boolean;
  canManageTeam?: boolean;
  canEditSettings?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Actions for ${name}`}
          data-testid={`workspaces-row-actions-${slug}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/app/w/${slug}`} data-testid={`workspaces-row-open-${slug}`}>
            <span className="me-2 inline-flex w-4 justify-center">↗</span>
            Open workspace
          </Link>
        </DropdownMenuItem>
        {canEditSettings ? (
          <DropdownMenuItem asChild>
            <Link href={`/app/w/${slug}/settings`} data-testid={`workspaces-row-settings-${slug}`}>
              <Settings className="me-2 h-4 w-4" aria-hidden="true" />
              Workspace settings
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canManageTeam ? (
          <DropdownMenuItem asChild>
            <Link href={`/app/w/${slug}/team`} data-testid={`workspaces-row-team-${slug}`}>
              <Users className="me-2 h-4 w-4" aria-hidden="true" />
              Manage team
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={`/app/w/${slug}/channels`} data-testid={`workspaces-row-channels-${slug}`}>
            <Share2 className="me-2 h-4 w-4" aria-hidden="true" />
            Social channels
          </Link>
        </DropdownMenuItem>
        {canDuplicate ? (
          <DropdownMenuItem disabled aria-disabled>
            <Copy className="me-2 h-4 w-4" aria-hidden="true" />
            Duplicate workspace
          </DropdownMenuItem>
        ) : null}
        {canArchive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled
              aria-disabled
              data-testid={`workspaces-row-archive-${slug}`}
            >
              <Archive className="me-2 h-4 w-4" aria-hidden="true" />
              Archive
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
