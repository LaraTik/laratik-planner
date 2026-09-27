/**
 * Shared activity log components.
 *
 * Public surface — what consumers should import:
 *
 *   import { ActivityEntry, ActivityDiff, ActivityFeed, ActivityTimeline } from "@/components/activity";
 *
 * The shared renderer is server-renderable. The formatter that
 * produces the `ActivityRenderSpec` consumed by `<ActivityEntry>`
 * lives in `@/lib/activity/format`. The resolver that hydrates
 * IDs → names lives in `@/lib/activity/resolve`.
 */

export { ActivityEntry, type ActivityEntryProps } from "./activity-entry";
export { ActivityDiff, type ActivityDiffProps } from "./activity-diff";
export {
  ActivityFeed,
  ActivityFeedCard,
  type ActivityFeedProps,
  type ActivityFeedCardProps,
} from "./activity-feed";
export { ActivityTimeline, type ActivityTimelineProps } from "./activity-timeline";
