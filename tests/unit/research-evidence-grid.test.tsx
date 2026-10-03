/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ResearchEvidenceGrid,
  type ResearchEvidenceRow,
} from "@/components/workspace/research-evidence-grid";

const labels = {
  title: "Saved research evidence",
  description: "Search and compare saved observations.",
  emptyTitle: "Nothing saved yet",
  emptyDescription: "Save a promising post.",
  search: "Search evidence",
  searchPlaceholder: "Search account, platform, or source URL",
  platform: "Platform",
  allPlatforms: "All platforms",
  sort: "Sort by",
  newest: "Newest saved",
  recentlyPublished: "Recently published",
  mostViews: "Most views",
  mostLikes: "Most likes",
  mostComments: "Most comments",
  sortEngagement: "Highest engagement",
  sortOutlier: "Top outliers",
  engagementRate: "Engagement",
  outlierScore: "Outlier",
  derivedMetric: "Planner-derived",
  peerSample: "{count} peer observations",
  compare: "Compare",
  compareSelected: "{count}/3 selected for comparison",
  compareTitle: "Selected comparison",
  compareDescription: "Compare the selected observations using the same transparent metrics.",
  clearComparison: "Clear comparison",
  results: "{count} saved items",
  filteredEmptyTitle: "No evidence matches these filters",
  filteredEmptyDescription: "Try a different search term.",
  openSource: "Open source",
  createBrief: "Create brief",
  savedAt: "Saved {date}",
  collectionLabel: "Collection",
  collectionNone: "No collection",
  collectionError: "Could not update the collection.",
  views: "views",
  likes: "likes",
  comments: "comments",
};

const rows: ResearchEvidenceRow[] = [
  {
    bookmarkId: "bookmark-1",
    observationId: "observation-1",
    accountName: "Halal Market",
    platform: "instagram",
    mediaType: "reel",
    permalink: "https://instagram.com/p/one",
    publishedAt: "2026-09-01T00:00:00.000Z",
    savedAt: "2026-09-02T00:00:00.000Z",
    publishedLabel: "Sep 1, 2026",
    savedLabel: "Sep 2, 2026",
    views: 1200,
    likes: 40,
    comments: 5,
    viewsLabel: "1,200",
    likesLabel: "40",
    commentsLabel: "5",
    collectionId: null,
  },
  {
    bookmarkId: "bookmark-2",
    observationId: "observation-2",
    accountName: "Reem Psychology",
    platform: "youtube",
    mediaType: "short",
    permalink: "https://youtube.com/watch/two",
    publishedAt: "2026-09-03T00:00:00.000Z",
    savedAt: "2026-09-04T00:00:00.000Z",
    publishedLabel: "Sep 3, 2026",
    savedLabel: "Sep 4, 2026",
    views: 4000,
    likes: 90,
    comments: 12,
    viewsLabel: "4,000",
    likesLabel: "90",
    commentsLabel: "12",
    collectionId: null,
  },
];

describe("ResearchEvidenceGrid", () => {
  it("filters saved evidence by search and platform without a reload", async () => {
    const user = userEvent.setup();
    render(
      <ResearchEvidenceGrid
        workspaceSlug="acme"
        slug="acme"
        rows={rows}
        canManage={false}
        collections={[]}
        labels={labels}
      />,
    );

    await user.type(screen.getByRole("searchbox", { name: "Search evidence" }), "Halal");
    expect(screen.getByText("Halal Market")).toBeInTheDocument();
    expect(screen.queryByText("Reem Psychology")).not.toBeInTheDocument();
    expect(screen.getByText("1 saved items")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search evidence" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Platform" }), "youtube");
    expect(screen.getByText("Reem Psychology")).toBeInTheDocument();
    expect(screen.queryByText("Halal Market")).not.toBeInTheDocument();
  });

  it("sorts by a transparent metric and exposes a filtered empty state", async () => {
    const user = userEvent.setup();
    render(
      <ResearchEvidenceGrid
        workspaceSlug="acme"
        slug="acme"
        rows={rows}
        canManage={false}
        collections={[]}
        labels={labels}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "views");
    const cards = screen.getAllByRole("heading", { level: 3 });
    expect(cards[0]).toHaveTextContent("Reem Psychology");

    await user.type(screen.getByRole("searchbox", { name: "Search evidence" }), "missing");
    expect(screen.getByText("No evidence matches these filters")).toBeInTheDocument();
  });

  it("compares up to three selected observations and clears the comparison", async () => {
    const user = userEvent.setup();
    render(
      <ResearchEvidenceGrid
        workspaceSlug="acme"
        slug="acme"
        rows={rows}
        canManage={false}
        collections={[]}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Compare: Halal Market" }));
    await user.click(screen.getByRole("checkbox", { name: "Compare: Reem Psychology" }));

    expect(screen.getByRole("heading", { name: "Selected comparison" })).toBeInTheDocument();
    expect(screen.getByText("2/3 selected for comparison")).toBeInTheDocument();
    expect(
      screen.getByText("Compare the selected observations using the same transparent metrics."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear comparison" }));
    expect(screen.queryByRole("heading", { name: "Selected comparison" })).not.toBeInTheDocument();
  });
});
