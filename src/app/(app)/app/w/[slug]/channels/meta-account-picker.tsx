"use client";

import { useState, useTransition } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import { finalizeMetaSelectionAction, type FinalizeSelectionInput } from "./actions";

/**
 * M4 — Meta account picker.
 *
 * The picker is rendered inline on the channels page when a
 * workspace has a `pending_selection` connection. It is NOT a new
 * route — it is a section of the channels page that the server
 * component conditionally renders based on the connection state.
 *
 * Each managed Page is a `<fieldset>` with a nested checkbox for
 * its linked Instagram account. For every discovered profile, the
 * picker offers:
 *
 *   - Create a new channel
 *   - Link to existing channel: <name>
 *   - Already connected
 *   - Unavailable: missing analytics permission
 *
 * The submit button reports pending state, errors through
 * `role="alert"`, and success through `role="status"`. Tokens never
 * appear in this component — the discover call already produced a
 * token-free `ConnectedProfile[]` on the server.
 */

export type PickerProfile = FinalizeSelectionInput["profiles"][number];

export type PickerCandidate = {
  providerAccountId: string;
  channelId: string;
  accountName: string;
  alreadyConnected: boolean;
};

export function MetaAccountPicker({
  connectionId,
  profiles,
  candidates,
  slug,
  onSuccess,
}: {
  connectionId: string;
  profiles: PickerProfile[];
  candidates: PickerCandidate[];
  slug: string;
  onSuccess?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(profiles.map((p) => p.providerAccountId)),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    const payload: FinalizeSelectionInput = {
      connectionId,
      profiles: profiles.filter((p) => selected.has(p.providerAccountId)),
    };
    if (payload.profiles.length === 0) {
      setError("Pick at least one profile to continue.");
      return;
    }
    startTransition(async () => {
      const result = await finalizeMetaSelectionAction(slug, null, payload);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    });
  }

  return (
    <Card padding="lg" data-testid="meta-account-picker">
      <div className="space-y-4">
        <div>
          <h2 className="text-title-section text-fg-primary font-semibold">
            Connect Meta accounts
          </h2>
          <p className="text-body text-fg-muted mt-1">
            We found {profiles.length} profile{profiles.length === 1 ? "" : "s"} on the Pages you
            manage. Pick the ones you want to track.
          </p>
        </div>

        <ul className="space-y-3" role="list">
          {profiles.map((p) => {
            const candidate = candidates.find((c) => c.providerAccountId === p.providerAccountId);
            const isSelected = selected.has(p.providerAccountId);
            return (
              <li key={p.providerAccountId}>
                <label
                  className="border-border bg-surface hover:bg-surface-subtle focus-within:ring-primary flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition focus-within:ring-2 focus-within:ring-offset-2"
                  data-testid={`picker-row-${p.providerAccountId}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(p.providerAccountId)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggle(p.providerAccountId);
                      }
                    }}
                    className="mt-1 h-4 w-4 cursor-pointer"
                    aria-label={`Select ${p.accountName}`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlatformIcon platform={p.platform} />
                      <span className="text-body text-fg-primary truncate font-medium">
                        {p.accountName}
                      </span>
                      {p.handle ? (
                        <span className="text-label text-fg-muted truncate">@{p.handle}</span>
                      ) : null}
                    </div>
                    <div className="text-label text-fg-muted flex items-center gap-2">
                      {platformLabel(p.platform)}
                      {candidate ? (
                        candidate.alreadyConnected ? (
                          <span className="text-success-fg inline-flex items-center gap-1">
                            <Check className="h-3 w-3" aria-hidden={true} /> Already connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <ChevronRight className="h-3 w-3" aria-hidden={true} /> Will link to{" "}
                            {candidate.accountName}
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          Will create a new channel
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        {error ? (
          <div role="alert" className="text-body text-danger" data-testid="picker-error">
            <X className="mr-1 inline h-4 w-4" aria-hidden={true} /> {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <span className="text-label text-fg-muted" aria-live="polite" data-testid="picker-count">
            {selected.size} selected
          </span>
          <Button
            type="button"
            disabled={pending}
            onClick={submit}
            data-testid="picker-submit"
            aria-busy={pending}
          >
            {pending ? "Linking…" : "Link selected profiles"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
