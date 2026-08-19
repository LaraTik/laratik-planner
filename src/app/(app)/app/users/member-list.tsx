"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserCheck, UserX } from "lucide-react";
import { toggleDeactivationAction } from "./actions";

export function MemberList({
  members,
}: {
  members: {
    id: string;
    name: string;
    email: string;
    isAgencyAdmin: boolean;
    status: string;
    role: string;
    joinedAt: string;
  }[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (members.length === 0) {
    return <p className="text-body text-fg-muted">No members yet.</p>;
  }

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="bg-danger-subtle text-label text-danger mb-3 rounded-[var(--radius-control)] p-3 font-semibold"
        >
          {error}
        </p>
      ) : null}
      <ul className="divide-border divide-y">
        {members.map((m) => {
          const active = m.status === "active";
          return (
            <li key={m.id} className="text-body flex items-center gap-3 py-3">
              <div className="bg-surface-subtle text-fg-primary text-label flex h-8 w-8 items-center justify-center rounded-full font-semibold">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-fg-primary truncate font-semibold">{m.name}</p>
                <p className="text-label text-fg-muted truncate">
                  {m.email} · joined {m.joinedAt}
                </p>
              </div>
              {m.isAgencyAdmin ? <Badge variant="primary">Admin</Badge> : null}
              <Badge variant={active ? "success" : "default"}>
                {active ? "Active" : "Deactivated"}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  start(async () => {
                    setError(null);
                    const result = await toggleDeactivationAction(m.id, active);
                    if ("error" in result && result.error) setError(result.error);
                  });
                }}
                aria-label={active ? `Deactivate ${m.name}` : `Reactivate ${m.name}`}
              >
                {active ? (
                  <>
                    <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Reactivate
                  </>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
