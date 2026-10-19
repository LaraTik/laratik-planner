import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeTargeting, type TargetingGroupKey } from "@/lib/advertising/targeting";

export type AdvertisingTargetingCardLabels = {
  title: string;
  description: string;
  empty: string;
  age: string;
  gender: string;
  locations: string;
  languages: string;
  placements: string;
  audience: string;
  exclusions: string;
  unknown: string;
  rawDetails: string;
  rawDescription: string;
  moreValues: string;
};

type TargetingRow = {
  adSetId: string;
  name: string | null;
  targeting: unknown;
};

export function AdvertisingTargetingCards({
  rows,
  labels,
}: {
  rows: readonly TargetingRow[];
  labels: AdvertisingTargetingCardLabels;
}) {
  const availableRows = rows
    .map((row) => ({ row, targeting: normalizeTargeting(row.targeting) }))
    .filter(({ targeting }) => targeting.raw !== null);

  return (
    <Card data-testid="advertising-reporting-targeting">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="text-primary h-4 w-4" aria-hidden="true" />
          {labels.title}
        </CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      {availableRows.length === 0 ? (
        <p className="text-label text-fg-secondary px-4 pb-4 sm:px-5">{labels.empty}</p>
      ) : (
        <div className="grid gap-3 px-4 pb-4 sm:px-5 lg:grid-cols-2">
          {availableRows.map(({ row, targeting }) => (
            <article
              key={row.adSetId}
              className="border-border-subtle bg-surface-subtle rounded-[var(--radius-control)] border p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-body text-fg-primary truncate font-semibold">
                    {row.name ?? row.adSetId}
                  </h3>
                  <bdi className="text-label text-fg-muted" dir="ltr">
                    {row.adSetId}
                  </bdi>
                </div>
                <Badge variant="outline">{labels.title}</Badge>
              </div>
              <div className="space-y-3">
                {targeting.groups.map((group) => (
                  <TargetingGroup key={group.key} group={group} labels={labels} />
                ))}
                {targeting.unknown.length > 0 ? (
                  <div>
                    <p className="text-label text-fg-muted mb-1 font-semibold">{labels.unknown}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {targeting.unknown.map((item) => (
                        <Badge key={item} variant="outline" className="max-w-full truncate">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <details className="border-border-subtle mt-4 border-t pt-3">
                <summary className="text-label text-fg-primary focus-visible:ring-focus-ring flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold focus:outline-none focus-visible:ring-2">
                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {labels.rawDetails}
                </summary>
                <p className="text-label text-fg-muted mt-1">{labels.rawDescription}</p>
                <pre
                  className="bg-surface mt-2 max-h-64 overflow-auto rounded-[var(--radius-control)] p-3 text-xs"
                  dir="ltr"
                >
                  {JSON.stringify(targeting.raw, null, 2)}
                </pre>
              </details>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function TargetingGroup({
  group,
  labels,
}: {
  group: { key: TargetingGroupKey; values: string[]; truncated: boolean };
  labels: AdvertisingTargetingCardLabels;
}) {
  return (
    <div>
      <p className="text-label text-fg-muted mb-1 font-semibold">{labels[group.key]}</p>
      <div className="flex flex-wrap gap-1.5">
        {group.values.map((value) => (
          <Badge key={value} variant="default" className="max-w-full truncate">
            {value}
          </Badge>
        ))}
        {group.truncated ? <Badge variant="outline">{labels.moreValues}</Badge> : null}
      </div>
    </div>
  );
}
