/**
 * Values shared by the server-only Test Lab service and its client UI.
 * Keep this module free of server-only imports so it can be bundled safely.
 */
export const COMMUNITY_TEST_LAB_CHANNELS = [
  "facebook_comments",
  "facebook_private_messages",
  "instagram_comments",
  "instagram_private_messages",
] as const;

export type CommunityTestLabChannel = (typeof COMMUNITY_TEST_LAB_CHANNELS)[number];
