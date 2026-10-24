"use client";

import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AdvertisingFilterDrawer({
  action,
  buttonLabel,
  title,
  description,
  applyLabel,
  closeLabel,
  children,
}: {
  action: string;
  buttonLabel: string;
  title: string;
  description: string;
  applyLabel: string;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="sm:hidden">
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-between"
            data-testid="advertising-reporting-filter-drawer-trigger"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {buttonLabel}
            </span>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent
          closeAriaLabel={closeLabel}
          className="max-h-[min(90vh,720px)] max-w-[calc(100%-1.5rem)] overflow-y-auto p-4"
          data-testid="advertising-reporting-filter-drawer"
        >
          <DialogHeader className="pe-8">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form
            method="get"
            action={action}
            className="grid gap-4"
            onSubmit={(event) => {
              const submitter = event.nativeEvent as SubmitEvent;
              if (submitter.submitter) {
                submitter.submitter.setAttribute("aria-busy", "true");
              }
            }}
          >
            {children}
            <Button type="submit" className="w-full">
              {applyLabel}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
