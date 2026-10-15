import { Infinity as InfinityIcon } from "lucide-react";

export function AdvertisingProviderMark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      className={
        size === "lg"
          ? "bg-info-subtle text-info inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          : "bg-info-subtle text-info inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
      }
      aria-hidden="true"
    >
      <InfinityIcon className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} strokeWidth={2.5} />
    </span>
  );
}
