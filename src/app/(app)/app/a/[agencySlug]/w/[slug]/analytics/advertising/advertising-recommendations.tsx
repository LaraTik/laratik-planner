"use client";

import { useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

type Recommendation = {
  title: string;
  action: string;
  rationale: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
};

export type AdvertisingRecommendationsLabels = {
  title: string;
  description: string;
  generate: string;
  generating: string;
  confidence: string;
  evidence: string;
  limitations: string;
  error: string;
  unavailable: string;
};

export function AdvertisingRecommendations({
  accountId,
  workspaceId,
  since,
  until,
  labels,
}: {
  accountId: string;
  workspaceId: string;
  since: string;
  until: string;
  labels: AdvertisingRecommendationsLabels;
}) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [limitations, setLimitations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/advertising/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, workspaceId, since, until }),
      });
      const data = (await response.json().catch(() => null)) as {
        recommendations?: Recommendation[];
        limitations?: string[];
        error?: string;
      } | null;
      if (!response.ok || !data?.recommendations) {
        throw new Error(data?.error ?? labels.unavailable);
      }
      setRecommendations(data.recommendations);
      setLimitations(data.limitations ?? []);
    } catch {
      setError(labels.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card padding="md" data-testid="advertising-ai-recommendations">
      <CardHeader className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="inline-flex items-center gap-2">
              <Lightbulb className="text-primary h-4 w-4" aria-hidden="true" />
              {labels.title}
            </CardTitle>
            <p className="text-label text-fg-muted mt-1 max-w-2xl">{labels.description}</p>
          </div>
          <Button type="button" onClick={generate} disabled={loading} className="min-h-11">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {loading ? labels.generating : labels.generate}
          </Button>
        </div>
      </CardHeader>

      {error ? (
        <p className="text-label text-danger mt-4" role="alert">
          {error}
        </p>
      ) : null}

      {recommendations.length > 0 ? (
        <div className="mt-5 space-y-4">
          {recommendations.map((recommendation, index) => (
            <article
              key={`${recommendation.title}-${index}`}
              className="border-border rounded-[var(--radius-control)] border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-body text-fg-primary font-semibold">{recommendation.title}</h3>
                <Badge variant="outline">
                  {labels.confidence}: {recommendation.confidence}
                </Badge>
              </div>
              <p className="text-label text-fg-secondary mt-2">{recommendation.action}</p>
              <p className="text-label text-fg-muted mt-2">{recommendation.rationale}</p>
              {recommendation.evidence.length > 0 ? (
                <div className="mt-3">
                  <p className="text-label text-fg-muted font-semibold">{labels.evidence}</p>
                  <ul className="text-label text-fg-muted mt-1 list-disc space-y-1 ps-5">
                    {recommendation.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
          {limitations.length > 0 ? (
            <div className="border-warning/30 bg-warning-subtle rounded-[var(--radius-control)] border p-3">
              <p className="text-label text-fg-primary font-semibold">{labels.limitations}</p>
              <ul className="text-label text-fg-secondary mt-1 list-disc space-y-1 ps-5">
                {limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
