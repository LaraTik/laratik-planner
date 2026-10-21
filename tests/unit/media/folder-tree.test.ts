import { describe, expect, it } from "vitest";
import { buildMediaFolderTree, type MediaFolderTreeInput } from "@/lib/media/folder-tree";

const folders: MediaFolderTreeInput[] = [
  { id: "posts", name: "Posts", parentId: null, sortOrder: 0 },
  { id: "static", name: "Static Post", parentId: "posts", sortOrder: 0 },
  { id: "year", name: "2026", parentId: "static", sortOrder: 0 },
  { id: "month", name: "02", parentId: "year", sortOrder: 0 },
  { id: "notes", name: "Notes", parentId: "posts", sortOrder: 1 },
  { id: "notes-year", name: "2026", parentId: "notes", sortOrder: 0 },
  { id: "notes-month", name: "02", parentId: "notes-year", sortOrder: 0 },
  { id: "brand", name: "Brand Kit", parentId: null, sortOrder: 1 },
];

describe("buildMediaFolderTree", () => {
  it("marks only generated format, year, and month folders as system folders", () => {
    const tree = buildMediaFolderTree(folders, new Map());
    const byId = new Map(tree.map((folder) => [folder.id, folder]));

    expect(byId.get("posts")).toMatchObject({ kind: "system", isPostsRoot: true });
    expect(byId.get("static")).toMatchObject({ kind: "system", isYearFolder: false });
    expect(byId.get("year")).toMatchObject({ kind: "system", isYearFolder: true });
    expect(byId.get("month")).toMatchObject({ kind: "system", isMonthFolder: true });
    expect(byId.get("notes")).toMatchObject({ kind: "user", isYearFolder: false });
    expect(byId.get("notes-year")).toMatchObject({ kind: "user", isYearFolder: false });
    expect(byId.get("notes-month")).toMatchObject({ kind: "user", isMonthFolder: false });
    expect(byId.get("brand")).toMatchObject({ kind: "system", isBrandRoot: true });
  });

  it("counts each folder and its descendants", () => {
    const tree = buildMediaFolderTree(
      folders,
      new Map([
        ["posts", 1],
        ["static", 2],
        ["year", 3],
        ["month", 4],
        ["notes", 5],
        ["notes-year", 6],
        ["notes-month", 7],
      ]),
    );
    const byId = new Map(tree.map((folder) => [folder.id, folder]));

    expect(byId.get("posts")?.descendantAssetCount).toBe(28);
    expect(byId.get("static")?.descendantAssetCount).toBe(9);
    expect(byId.get("notes")?.descendantAssetCount).toBe(18);
  });

  it("terminates safely if stored folder rows contain a cycle", () => {
    const cyclicFolders: MediaFolderTreeInput[] = [
      { id: "a", name: "A", parentId: "b", sortOrder: 0 },
      { id: "b", name: "B", parentId: "a", sortOrder: 0 },
    ];

    expect(() => buildMediaFolderTree(cyclicFolders, new Map())).not.toThrow();
  });
});
