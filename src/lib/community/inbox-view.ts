type InboxItem = { id: string; visibility: string | null; body: string; authorName: string | null };
export function latestInboxConversations<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .slice(0, 25);
}
export type CommunityInboxQuery = {
  conversation?: string | undefined;
  filter?: string | undefined;
  q?: string | undefined;
};
export function communityInboxView<T extends InboxItem>(items: T[], query: CommunityInboxQuery) {
  const search = query.q?.trim().toLocaleLowerCase() ?? "";
  const filtered = items.filter(
    (item) =>
      ((query.filter !== "private" && query.filter !== "public") ||
        item.visibility === query.filter) &&
      (!search || `${item.body} ${item.authorName ?? ""}`.toLocaleLowerCase().includes(search)),
  );
  return {
    items: filtered,
    selected: filtered.find((item) => item.id === query.conversation) ?? filtered[0] ?? null,
  };
}
