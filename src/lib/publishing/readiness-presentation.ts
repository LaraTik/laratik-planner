import type { ReadinessIssue } from "@/lib/publishing/readiness";

/**
 * Translate a readiness report into user-friendly issues
 * with optional in-page anchors.
 *
 * The readiness service emits issues with paths like
 * `channels[0].payload.caption` — internal identifiers the
 * planner should never see. The presentation layer turns
 * these into:
 *  - A short human title (e.g. "Instagram needs a caption")
 *  - The original service message (already user-friendly)
 *  - An anchor href that points at the section in the
 *    planning detail page that can fix the issue
 *
 * The anchor is the URL fragment the planning detail page
 * uses for in-page navigation. The Fix link in the
 * `<ReadinessPanel>` jumps to that anchor; the page
 * provides a matching `id` on the relevant section.
 */

export interface PresentationIssue {
  path: string;
  code: string;
  severity: "blocker" | "recommendation";
  message: string;
  /** Human-readable title; falls back to the original message. */
  title: string;
  /** In-page anchor; `undefined` when there's no obvious
   *  section the user can jump to. */
  href?: string;
}

const CODE_TO_TITLE: Record<string, string> = {
  missing_caption: "Add a caption",
  missing_destination: "Select a destination profile",
  final_copy_not_approved: "Approve the final copy",
  missing_alt_text: "Add alt text for accessibility",
  missing_audio_rights: "Confirm audio rights",
  transcript_not_reviewed: "Review the transcript",
  missing_first_comment: "Add the first comment",
  missing_hashtags: "Add the required hashtags",
  rights_not_confirmed: "Confirm content rights",
  synthetic_media_not_marked: "Mark synthetic media",
  delivery_not_approved: "Approve a delivery version",
  approvals_open: "Re-review approvals",
  ai_suggestion: "AI suggestion",
  // Per-platform required fields. Without these entries
  // `humanizeCode` produced "Missing Title" / "Missing Board" in the
  // aggregate Overview panel, which reads as a UI bug rather than a
  // field the operator has to fill in.
  missing_title: "Add the video title",
  missing_pin_title: "Add the pin title",
  missing_board: "Choose a Pinterest board",
  missing_privacy: "Set the privacy level",
  missing_thumbnail: "Set a thumbnail",
  missing_cover: "Choose a cover frame",
  missing_music_rights: "Confirm music rights",
  missing_post_text: "Add the post text",
  missing_payload: "Save a publish package",
  missing_platform: "Set the package platform",
  invalid_payload: "Fix the stored publish package",
  no_approved_delivery: "Approve a delivery asset version",
  delivery_version_missing: "Re-approve the delivery version",
  synthetic_media_disclosure_recommended: "Declare synthetic media",
};

const PATH_PATTERNS: Array<{ test: RegExp; href: string }> = [
  // Per-channel issues jump to the channel card.
  { test: /^channels\[\d+\]\.payload\./, href: "publishing" },
  { test: /^channels\[\d+\]\.approvedDeliveryVersion/, href: "delivery" },
  // Approval issues jump to the workflow / approvals area.
  { test: /^approvals\./, href: "workflow" },
  // Delivery issues jump to the delivery section.
  { test: /^delivery\./, href: "delivery" },
];

function anchorFor(path: string): string | undefined {
  for (const { test, href } of PATH_PATTERNS) {
    if (test.test(path)) return href;
  }
  return undefined;
}

export function presentReadinessIssues(issues: ReadinessIssue[]): PresentationIssue[] {
  return issues.map((issue) => {
    const code = issue.code;
    const title = CODE_TO_TITLE[code] ?? humanizeCode(code);
    // Strip the `channels[N].` prefix from the path. The
    // `<ChannelPublishingCard>` renders the per-channel
    // issues, not the planning-level panel — the panel
    // summarises the *aggregate* (e.g. "any channel needs a
    // caption") so the anchor points to the publishing
    // section.
    const normalised = issue.path.replace(/^channels\[\d+\]\./, "");
    const href = anchorFor(issue.path) ?? anchorFor(normalised);
    return {
      path: issue.path,
      code,
      severity: issue.severity,
      message: issue.message,
      title,
      ...(href ? { href } : {}),
    };
  });
}

function humanizeCode(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
