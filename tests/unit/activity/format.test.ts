import { describe, expect, it } from "vitest";
import { formatActivityEvent } from "@/lib/activity/format";
import type { ActivityContext, RawActivityEvent } from "@/lib/activity/types";
import { tFor } from "@/messages";

const t = tFor("en");
const arT = tFor("ar");

const FIXED_DATE = (value: string | Date): string =>
  typeof value === "string" ? value : value.toISOString();

function emptyContext(): ActivityContext {
  return {
    workspaceId: "ws-1",
    statusLabels: new Map([
      ["draft", "Draft"],
      ["content_review", "Content review"],
      ["in_design", "In design"],
      ["ready_to_publish", "Ready to publish"],
      ["published", "Published"],
      ["blocked", "Blocked"],
    ]),
    formatLabels: new Map(),
    userById: new Map(),
    channelByContentItemChannelId: new Map(),
    designerByContentItemId: new Map(),
    ownerByContentItemId: new Map(),
  };
}

function ctxWithUsers(...entries: Array<[string, string]>): ActivityContext {
  const ctx = emptyContext();
  for (const [id, name] of entries) {
    ctx.userById.set(id, { name, email: null });
  }
  return ctx;
}

function ctxWithChannel(id: string, label: string): ActivityContext {
  const ctx = emptyContext();
  ctx.channelByContentItemChannelId.set(id, { label, platform: "instagram" });
  return ctx;
}

function opts() {
  return {
    formatDate: FIXED_DATE,
    systemActorFallback: "System",
  };
}

function makeEvent(partial: Partial<RawActivityEvent>): RawActivityEvent {
  return {
    id: "ev-1",
    kind: "status_transition",
    summary: "",
    actorId: "user-1",
    occurredAt: "2026-09-27T10:00:00.000Z",
    targetLabel: "Spring drop",
    href: null,
    metadata: null,
    beforeData: null,
    afterData: null,
    targetId: null,
    ...partial,
  };
}

describe("formatActivityEvent — verb templates", () => {
  it("status_transition renders the localised from → to diff", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "status_transition",
        beforeData: { status: "draft" },
        afterData: { status: "content_review" },
      }),
      ctxWithUsers(["user-1", "Ada Lovelace"]),
      t,
      opts(),
    );
    expect(spec.verb).toBe("moved Spring drop from Draft to Content review");
    expect(spec.actor.name).toBe("Ada Lovelace");
    expect(spec.diff?.field).toBe("status");
    expect(spec.diff?.before.label).toBe("Draft");
    expect(spec.diff?.after.label).toBe("Content review");
  });

  it("brief_updated renders the text-shaped diff", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "brief_updated",
        beforeData: { brief: "old brief" },
        afterData: { brief: "new brief" },
      }),
      ctxWithUsers(["user-1", "Grace Hopper"]),
      t,
      opts(),
    );
    expect(spec.verb).toBe("updated the brief on Spring drop");
    expect(spec.diff?.shape).toBe("text");
    expect(spec.diff?.before.label).toBe("old brief");
    expect(spec.diff?.after.label).toBe("new brief");
  });

  it("title_updated renders the renamed verb", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "title_updated",
        beforeData: { title: "old" },
        afterData: { title: "new" },
      }),
      ctxWithUsers(["user-1", "Grace Hopper"]),
      t,
      opts(),
    );
    expect(spec.verb).toBe("renamed Spring drop");
    expect(spec.diff?.shape).toBe("text");
  });

  it("date_updated renders the rescheduled verb with locale-formatted dates", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "date_updated",
        beforeData: { plannedPublishAt: "2026-09-01T00:00:00.000Z" },
        afterData: { plannedPublishAt: "2026-09-15T00:00:00.000Z" },
      }),
      ctxWithUsers(["user-1", "Grace Hopper"]),
      t,
      opts(),
    );
    expect(spec.verb).toBe("rescheduled Spring drop");
    expect(spec.diff?.shape).toBe("chip");
  });

  it("schedule_change renders the rescheduled verb (alias)", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "schedule_change",
        beforeData: { plannedPublishAt: "2026-09-01T00:00:00.000Z" },
        afterData: { plannedPublishAt: "2026-09-15T00:00:00.000Z" },
      }),
      ctxWithUsers(["user-1", "Grace Hopper"]),
      t,
      opts(),
    );
    expect(spec.verb).toBe("rescheduled Spring drop");
  });

  it("assignment (designer) resolves the designerId to a name", () => {
    const ctx = ctxWithUsers(["user-1", "Ghaleb"], ["designer-1", "Maya Cohen"]);
    const spec = formatActivityEvent(
      makeEvent({
        kind: "assignment",
        beforeData: { designerId: null },
        afterData: { designerId: "designer-1" },
      }),
      ctx,
      t,
      opts(),
    );
    expect(spec.verb).toBe("assigned Spring drop to Maya Cohen");
    expect(spec.diff?.field).toBe("designer");
  });

  it("assignment (owner change) picks the assignment_owner verb", () => {
    const ctx = ctxWithUsers(["user-1", "Ghaleb"], ["owner-old", "Maya"], ["owner-new", "Hasan"]);
    const spec = formatActivityEvent(
      makeEvent({
        kind: "assignment",
        beforeData: { contentOwnerId: "owner-old" },
        afterData: { contentOwnerId: "owner-new" },
      }),
      ctx,
      t,
      opts(),
    );
    expect(spec.verb).toBe("changed the owner of Spring drop to Hasan");
  });

  it("assignment (designer release) picks the released verb", () => {
    const ctx = ctxWithUsers(["user-1", "Ghaleb"], ["designer-1", "Maya Cohen"]);
    const spec = formatActivityEvent(
      makeEvent({
        kind: "assignment",
        beforeData: { designerId: "designer-1" },
        afterData: { designerId: null },
      }),
      ctx,
      t,
      opts(),
    );
    expect(spec.verb).toBe("released the designer hold on Spring drop");
  });

  it("publication renders the channel label via metadataLabel", () => {
    const ctx = ctxWithChannel("chan-1", "Instagram · LaraTik Main");
    const spec = formatActivityEvent(
      makeEvent({
        kind: "publication",
        metadata: { contentItemChannelId: "chan-1" },
        beforeData: { status: "ready_to_publish" },
        afterData: { channelStatus: "published" },
      }),
      ctx,
      t,
      opts(),
    );
    expect(spec.metadataLabel).toBe("Instagram · LaraTik Main");
    expect(spec.verb).toContain("Instagram · LaraTik Main");
  });

  it("publication subkind picks the meta_* verb", () => {
    const ctx = ctxWithUsers(["user-1", "Ghaleb"]);
    const spec = formatActivityEvent(
      makeEvent({
        kind: "publication",
        metadata: { subkind: "meta_linked" },
      }),
      ctx,
      t,
      opts(),
    );
    expect(spec.verb).toBe("linked the Meta publication for Spring drop");
  });

  it("delivery renders the V{n} version metadata", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "delivery",
        metadata: { version: 2 },
      }),
      ctxWithUsers(["user-1", "Hasan"]),
      t,
      opts(),
    );
    expect(spec.metadataLabel).toBe("V2");
    expect(spec.verb).toContain("V2");
  });

  it("bulk_archive counts events via metadata.count", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "bulk_archive",
        metadata: { count: 12 },
      }),
      ctxWithUsers(["user-1", "Ghaleb"]),
      t,
      opts(),
    );
    expect(spec.verb).toBe("bulk-archived 12 items");
  });

  it("brand.<x> routes to the brand_update verb", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "brand.logo",
        summary: "Updated the LaraTik primary logo",
        targetLabel: null,
      }),
      ctxWithUsers(["user-1", "Ghaleb"]),
      t,
      opts(),
    );
    expect(spec.verb).toBe("updated the brand kit");
    expect(spec.iconKind).toBe("brand");
  });
});

describe("formatActivityEvent — Arabic locale", () => {
  it("status_transition renders Arabic verbs and status labels", () => {
    const ctx = emptyContext();
    ctx.statusLabels.set("draft", "مسودة");
    ctx.statusLabels.set("content_review", "مراجعة المحتوى");
    ctx.userById.set("user-1", { name: "غالب كرمنشاهي", email: null });
    const spec = formatActivityEvent(
      makeEvent({
        kind: "status_transition",
        beforeData: { status: "draft" },
        afterData: { status: "content_review" },
      }),
      ctx,
      arT,
      opts(),
    );
    expect(spec.verb).toBe("نقل Spring drop من مسودة إلى مراجعة المحتوى");
  });
});

describe("formatActivityEvent — icon + tone", () => {
  it("publication emits success tone + publication icon", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "publication",
        afterData: { channelStatus: "published" },
      }),
      emptyContext(),
      t,
      opts(),
    );
    expect(spec.iconKind).toBe("publication");
    expect(spec.toneClass).toContain("bg-success-subtle");
  });

  it("status_transition emits primary tone + arrow icon", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "status_transition",
        beforeData: { status: "draft" },
        afterData: { status: "in_design" },
      }),
      emptyContext(),
      t,
      opts(),
    );
    expect(spec.iconKind).toBe("status_transition");
    expect(spec.toneClass).toContain("bg-primary-subtle");
  });
});

describe("formatActivityEvent — defensive behaviour", () => {
  it("missing actorId falls back to systemActorFallback", () => {
    const spec = formatActivityEvent(makeEvent({ actorId: null }), emptyContext(), t, {
      ...opts(),
      systemActorFallback: "System actor",
    });
    expect(spec.actor.name).toBe("System actor");
  });

  it("missing targetLabel renders the localised (deleted item)", () => {
    const spec = formatActivityEvent(makeEvent({ targetLabel: null }), emptyContext(), t, opts());
    expect(spec.target?.label).toBe("(deleted item)");
  });

  it("unknown designer id falls back to (empty) instead of crashing", () => {
    const spec = formatActivityEvent(
      makeEvent({
        kind: "assignment",
        beforeData: { designerId: "missing-user" },
        afterData: { designerId: "also-missing" },
      }),
      ctxWithUsers(["user-1", "Ghaleb"]),
      t,
      opts(),
    );
    expect(spec.diff?.before.label).toBe("(empty)");
    expect(spec.diff?.after.label).toBe("(empty)");
  });

  it("unknown kind falls back to a snake-to-space kind label", () => {
    const spec = formatActivityEvent(
      makeEvent({ kind: "totally_new_kind" }),
      emptyContext(),
      t,
      opts(),
    );
    expect(spec.verb).toBe("totally new kind");
    expect(spec.iconKind).toBe("system");
  });
});

describe("formatActivityEvent — happenedAt", () => {
  it("normalises a Date input to ISO", () => {
    const spec = formatActivityEvent(
      makeEvent({ occurredAt: new Date("2026-09-27T10:00:00.000Z") }),
      emptyContext(),
      t,
      opts(),
    );
    expect(spec.occurredAtIso).toBe("2026-09-27T10:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────
// Regression: 2026-09-27 production 500 on /app/w/[slug]/planning/[id]
//
// `recordMaterialityEvent` wrote bare scalars into the
// `activity_event.before_data` / `after_data` jsonb columns (an ISO
// date for `schedule`, caption text for `caption`, the literal
// `"(payload)"` for `platform_payload`). The formatter then ran
// `"status" in "2026-09-26T21:00:00.000Z"` and threw:
//
//   TypeError: Cannot use 'in' operator to search for 'status'
//   in 2026-09-26T21:00:00.000Z
//
// Because `buildVerb` computes before/after labels for EVERY event
// regardless of `kind`, one bad historical row took down the whole
// planning-detail route. 12 of 83 production items were affected.
//
// These tests pin the reader contract: any JSON value is acceptable
// input and must degrade to a rendered row, never a thrown error.
// ─────────────────────────────────────────────────────────────────
describe("formatActivityEvent — malformed jsonb payloads (2026-09-27 regression)", () => {
  const SCALARS: Array<[string, unknown]> = [
    ["ISO date string", "2026-09-26T21:00:00.000Z"],
    ["placeholder string", "(payload)"],
    ["arabic caption text", "يوجد صور للفكرة العامة وصور المنتجات"],
    ["empty string", ""],
    ["number", 42],
    ["boolean", true],
    ["array", ["a", "b"]],
    ["Date instance", new Date("2026-09-26T21:00:00.000Z")],
  ];

  for (const [label, value] of SCALARS) {
    it(`does not throw when beforeData/afterData is a ${label}`, () => {
      const run = () =>
        formatActivityEvent(
          makeEvent({ kind: "update", beforeData: value, afterData: value }),
          emptyContext(),
          t,
          opts(),
        );
      expect(run).not.toThrow();
      // The 'update' verb template is "updated {target}" and does
      // not interpolate before/after — so the labels are computed
      // and discarded. That discarded computation is what used to
      // take the page down.
      expect(run().verb).toBe("updated Spring drop");
    });
  }

  it("does not throw for a scalar payload on every kind that reads before/after", () => {
    const kinds = [
      "status_transition",
      "schedule_change",
      "date_updated",
      "assignment",
      "publication",
      "brief_updated",
      "title_updated",
      "content_updated",
      "content_copy_patched",
      "delivery",
      "update",
    ];
    for (const kind of kinds) {
      expect(() =>
        formatActivityEvent(
          makeEvent({
            kind,
            beforeData: "2026-09-26T21:00:00.000Z",
            afterData: "2026-09-27T21:00:00.000Z",
          }),
          emptyContext(),
          t,
          opts(),
        ),
      ).not.toThrow();
    }
  });

  it("does not throw when metadata is a scalar", () => {
    expect(() =>
      formatActivityEvent(
        makeEvent({ kind: "publication", metadata: "2026-09-26T21:00:00.000Z" }),
        emptyContext(),
        t,
        opts(),
      ),
    ).not.toThrow();
  });

  it("still renders a real object payload unchanged", () => {
    // The guard must not regress well-formed rows.
    const spec = formatActivityEvent(
      makeEvent({
        kind: "status_transition",
        beforeData: { status: "draft" },
        afterData: { status: "content_review" },
      }),
      emptyContext(),
      t,
      opts(),
    );
    expect(spec.diff?.before.label).toBe("Draft");
    expect(spec.diff?.after.label).toBe("Content review");
  });

  it("degrades a scalar status_transition to an empty-value diff instead of throwing", () => {
    const spec = formatActivityEvent(
      makeEvent({ kind: "status_transition", beforeData: "draft", afterData: "in_design" }),
      emptyContext(),
      t,
      opts(),
    );
    expect(spec.diff?.field).toBe("status");
    expect(spec.diff?.before.label).toBe("");
    expect(spec.diff?.after.label).toBe("");
  });

  it("reads an array payload as empty, not as index keys", () => {
    // `{ ..."ab" }` would produce {0:'a',1:'b'} — a subtle wrong
    // render rather than a throw. Pin the intended behaviour.
    const spec = formatActivityEvent(
      makeEvent({ kind: "status_transition", beforeData: ["draft"], afterData: ["in_design"] }),
      emptyContext(),
      t,
      opts(),
    );
    expect(spec.diff?.before.label).toBe("");
  });
});
