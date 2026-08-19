"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createChannelAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add channel"}
    </Button>
  );
}
export function ChannelForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(
    createChannelAction.bind(null, slug),
    {} as { error?: string; success?: boolean },
  );
  return (
    <form
      action={action}
      className="border-border bg-surface grid gap-3 rounded-[var(--radius-card)] border p-4 md:grid-cols-2 xl:grid-cols-5"
    >
      <label className="text-label font-semibold">
        Platform
        <select
          name="platform"
          className="border-border bg-surface text-body mt-1 h-10 w-full rounded-[var(--radius-control)] border px-3"
        >
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="tiktok">TikTok</option>
          <option value="linkedin">LinkedIn</option>
          <option value="youtube">YouTube</option>
          <option value="x">X</option>
          <option value="pinterest">Pinterest</option>
          <option value="threads">Threads</option>
          <option value="other">Custom</option>
        </select>
      </label>
      <label className="text-label font-semibold">
        Account name
        <Input className="mt-1" name="accountName" required placeholder="Brand Instagram" />
      </label>
      <label className="text-label font-semibold">
        Handle
        <Input className="mt-1" name="handle" placeholder="@brand" />
      </label>
      <label className="text-label font-semibold">
        Account link
        <Input className="mt-1" name="url" type="url" placeholder="https://…" />
      </label>
      <div className="flex items-end">
        <Submit />
      </div>
      {state?.error ? (
        <p role="alert" className="text-label text-danger md:col-span-2 xl:col-span-5">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
