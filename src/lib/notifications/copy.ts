import type { NotificationKind } from "@/lib/notifications/types";

export function defaultTitleFor(kind: NotificationKind): string {
  switch (kind) {
    case "assignment":
      return "You were assigned a task";
    case "review_request":
      return "Your review is requested";
    case "approval":
      return "Content approved";
    case "changes_requested":
      return "Changes requested";
    case "reply":
      return "New reply on a comment";
    case "unresolved_question":
      return "Unresolved question needs attention";
    case "deadline":
      return "A deadline is approaching";
    case "delivery":
      return "A delivery was submitted";
    case "ready_to_publish":
      return "A piece is ready to publish";
    case "mention":
      return "You were mentioned in a comment";
    case "system":
      return "System update";
  }
}

export function defaultBodyFor(kind: NotificationKind): string {
  switch (kind) {
    case "assignment":
      return "You were assigned a content item. Open it to start work.";
    case "review_request":
      return "An approval request is waiting on you.";
    case "approval":
      return "An approval was recorded on a content item you follow.";
    case "changes_requested":
      return "Reviewer requested changes. Open the item to see the notes.";
    case "reply":
      return "Someone replied to a comment you're part of.";
    case "unresolved_question":
      return "A comment is still marked as an unresolved question.";
    case "deadline":
      return "A planned publish date is approaching. Confirm the package is on track.";
    case "delivery":
      return "A new delivery version was submitted for review.";
    case "ready_to_publish":
      return "A content item moved into the ready-to-publish lane.";
    case "mention":
      return "Someone @mentioned you in a comment on a content item.";
    case "system":
      return "The workspace has a new system update.";
  }
}
