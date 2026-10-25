"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Archive, Clock3, Copy, FilePlus2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { useLocaleT } from "@/components/i18n/locale-provider";

type KnowledgeScope = "workspace" | "agency" | "default";
type KnowledgeCategory =
  "brand" | "audience" | "strategy" | "operations" | "performance" | "reference";
type VerificationStatus = "unverified" | "verified" | "outdated";
type KnowledgeEntry = {
  id: string;
  scope: KnowledgeScope;
  category: KnowledgeCategory;
  title: string;
  content: string;
  tags: string[];
  sourceUrl: string | null;
  verificationStatus: VerificationStatus;
  verifiedAt: string | null;
  revision: number;
  updatedAt: string;
  isBuiltIn: boolean;
};
type KnowledgeSnapshot = Pick<
  KnowledgeEntry,
  "scope" | "category" | "title" | "content" | "tags" | "sourceUrl" | "verificationStatus"
>;
type KnowledgeRevision = {
  revision: number;
  snapshot: KnowledgeSnapshot;
  createdBy: string;
  createdAt: string;
};

const CATEGORIES: KnowledgeCategory[] = [
  "brand",
  "audience",
  "strategy",
  "operations",
  "performance",
  "reference",
];
const STATUSES: VerificationStatus[] = ["unverified", "verified", "outdated"];

export function KnowledgeLibrary({
  workspaceSlug,
  locale,
  canManageWorkspace,
  canManageAgency,
}: {
  workspaceSlug: string;
  locale: string;
  canManageWorkspace: boolean;
  canManageAgency: boolean;
}) {
  const t = useLocaleT();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [scope, setScope] = useState<KnowledgeScope>("workspace");
  const [category, setCategory] = useState<KnowledgeCategory>("brand");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("unverified");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, KnowledgeRevision[]>>({});

  async function loadEntries(query = search) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        workspaceSlug,
        locale: locale === "ar" ? "ar" : "en",
      });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/ai/workspace-assistant/knowledge?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("knowledge_load_failed");
      const data = (await response.json()) as { knowledge: KnowledgeEntry[] };
      setEntries(data.knowledge);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      workspaceSlug,
      locale: locale === "ar" ? "ar" : "en",
    });
    void fetch(`/api/ai/workspace-assistant/knowledge?${params}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("knowledge_load_failed");
        const data = (await response.json()) as { knowledge: KnowledgeEntry[] };
        if (!cancelled) setEntries(data.knowledge);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, locale]);

  function resetForm() {
    setFormOpen(false);
    setEditing(null);
    setScope("workspace");
    setCategory("brand");
    setTitle("");
    setContent("");
    setTags("");
    setSourceUrl("");
    setVerificationStatus("unverified");
    setError(false);
  }

  function beginEdit(entry: KnowledgeEntry) {
    setEditing(entry);
    setScope(entry.scope);
    setCategory(entry.category);
    setTitle(entry.title);
    setContent(entry.content);
    setTags(entry.tags.join(", "));
    setSourceUrl(entry.sourceUrl ?? "");
    setVerificationStatus(entry.verificationStatus);
    setFormOpen(true);
    setError(false);
  }

  function beginCustomize(entry: KnowledgeEntry) {
    resetForm();
    setScope("workspace");
    setCategory(entry.category);
    setTitle(entry.title);
    setContent(entry.content);
    setTags(entry.tags.join(", "));
    setSourceUrl(entry.sourceUrl ?? "");
    setVerificationStatus("unverified");
    setFormOpen(true);
    setError(false);
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(false);
    const knowledge = {
      scope,
      category,
      title,
      content,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
      verificationStatus,
    };
    try {
      const response = await fetch(
        editing
          ? `/api/ai/workspace-assistant/knowledge/${editing.id}`
          : "/api/ai/workspace-assistant/knowledge",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceSlug,
            ...(editing ? { expectedRevision: editing.revision } : {}),
            knowledge,
          }),
        },
      );
      if (!response.ok) throw new Error("knowledge_save_failed");
      resetForm();
      await loadEntries();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function archiveEntry(entry: KnowledgeEntry) {
    if (!window.confirm(t("workspaceAssistant.knowledge.confirmArchive"))) return;
    try {
      const response = await fetch(`/api/ai/workspace-assistant/knowledge/${entry.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceSlug }),
      });
      if (!response.ok) throw new Error("knowledge_archive_failed");
      await loadEntries();
    } catch {
      setError(true);
    }
  }

  async function toggleHistory(entry: KnowledgeEntry) {
    if (historyFor === entry.id) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor(entry.id);
    if (history[entry.id]) return;
    try {
      const params = new URLSearchParams({ workspaceSlug });
      const response = await fetch(
        `/api/ai/workspace-assistant/knowledge/${entry.id}/revisions?${params}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("knowledge_history_failed");
      const data = (await response.json()) as { revisions: KnowledgeRevision[] };
      setHistory((current) => ({ ...current, [entry.id]: data.revisions }));
    } catch {
      setError(true);
      setHistoryFor(null);
    }
  }

  function canEdit(entry: KnowledgeEntry) {
    if (entry.isBuiltIn) return false;
    return entry.scope === "agency" ? canManageAgency : canManageWorkspace;
  }

  const selectClass =
    "border-border bg-surface text-body min-h-11 w-full rounded-[var(--radius-control)] border px-3";

  return (
    <section
      className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
      aria-labelledby="assistant-knowledge-title"
      data-testid="assistant-knowledge-library"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="assistant-knowledge-title"
            className="text-title-card text-fg-primary font-semibold"
          >
            {t("workspaceAssistant.knowledge.title")}
          </h2>
          <p className="text-label text-fg-secondary mt-1">
            {t("workspaceAssistant.knowledge.description")}
          </p>
        </div>
        {canManageWorkspace || canManageAgency ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
          >
            <FilePlus2 className="me-2 h-4 w-4" aria-hidden="true" />
            {t("workspaceAssistant.knowledge.add")}
          </Button>
        ) : null}
      </div>

      <p className="text-label text-fg-muted mt-3" role="note">
        {t("workspaceAssistant.knowledge.defaultNotice")}
      </p>

      {formOpen ? (
        <form className="border-border mt-4 grid gap-3 border-t pt-4" onSubmit={saveEntry}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-label text-fg-secondary grid gap-1">
              {t("workspaceAssistant.knowledge.name")}
              <DirAwareInput
                locale={locale}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                required
              />
            </label>
            <label className="text-label text-fg-secondary grid gap-1">
              {t("workspaceAssistant.knowledge.category")}
              <select
                className={selectClass}
                value={category}
                onChange={(event) => setCategory(event.target.value as KnowledgeCategory)}
              >
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`workspaceAssistant.knowledge.categories.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-label text-fg-secondary grid gap-1">
              {t("workspaceAssistant.knowledge.scope")}
              <select
                className={selectClass}
                value={scope}
                onChange={(event) => setScope(event.target.value as KnowledgeScope)}
                disabled={Boolean(editing)}
              >
                <option value="workspace">
                  {t("workspaceAssistant.knowledge.workspaceScope")}
                </option>
                {canManageAgency ? (
                  <option value="agency">{t("workspaceAssistant.knowledge.agencyScope")}</option>
                ) : null}
              </select>
            </label>
            <label className="text-label text-fg-secondary grid gap-1">
              {t("workspaceAssistant.knowledge.verification")}
              <select
                className={selectClass}
                value={verificationStatus}
                onChange={(event) =>
                  setVerificationStatus(event.target.value as VerificationStatus)
                }
              >
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`workspaceAssistant.knowledge.statuses.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-label text-fg-secondary grid gap-1">
            {t("workspaceAssistant.knowledge.content")}
            <DirAwareTextarea
              locale={locale}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={5}
              maxLength={8_000}
              required
              className="border-border bg-surface text-body min-h-28 rounded-[var(--radius-control)] border px-3 py-2"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-label text-fg-secondary grid gap-1">
              {t("workspaceAssistant.knowledge.tags")}
              <DirAwareInput
                locale={locale}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                maxLength={500}
                aria-describedby="assistant-knowledge-tags-help"
              />
              <span id="assistant-knowledge-tags-help" className="text-fg-muted">
                {t("workspaceAssistant.knowledge.tagsHelp")}
              </span>
            </label>
            <label className="text-label text-fg-secondary grid gap-1">
              {t("workspaceAssistant.knowledge.sourceUrl")}
              <Input
                type="url"
                dir="ltr"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                maxLength={2_000}
              />
            </label>
          </div>
          {error ? (
            <p className="text-body text-danger" role="alert">
              {t("workspaceAssistant.knowledge.error")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving
                ? t("workspaceAssistant.knowledge.saving")
                : t("workspaceAssistant.knowledge.save")}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              {t("workspaceAssistant.knowledge.cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void loadEntries();
        }}
      >
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">{t("workspaceAssistant.knowledge.search")}</span>
          <Search
            className="text-fg-muted pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <DirAwareInput
            locale={locale}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("workspaceAssistant.knowledge.searchPlaceholder")}
            className="ps-9"
          />
        </label>
        <Button type="submit" variant="outline" disabled={loading}>
          {t("workspaceAssistant.knowledge.search")}
        </Button>
      </form>

      {error && !formOpen ? (
        <p className="text-body text-danger mt-3" role="alert">
          {t("workspaceAssistant.knowledge.error")}
        </p>
      ) : null}
      {loading ? (
        <p className="text-label text-fg-muted mt-3" role="status">
          {t("workspaceAssistant.knowledge.loading")}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-label text-fg-muted mt-3" role="status">
          {search.trim()
            ? t("workspaceAssistant.knowledge.noSearchResults")
            : t("workspaceAssistant.knowledge.empty")}
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
            >
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg-primary font-semibold">{entry.title}</p>
                  <p className="text-label text-fg-muted mt-1">
                    {t(`workspaceAssistant.knowledge.categories.${entry.category}`)} ·{" "}
                    {t(`workspaceAssistant.knowledge.scopes.${entry.scope}`)} ·{" "}
                    {t(`workspaceAssistant.knowledge.statuses.${entry.verificationStatus}`)} ·{" "}
                    {t("workspaceAssistant.knowledge.revision", { revision: entry.revision })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {entry.isBuiltIn ? (
                    canManageWorkspace ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => beginCustomize(entry)}
                      >
                        <Copy className="me-1 h-4 w-4" aria-hidden="true" />
                        {t("workspaceAssistant.knowledge.customize")}
                      </Button>
                    ) : null
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void toggleHistory(entry)}
                      >
                        <Clock3 className="me-1 h-4 w-4" aria-hidden="true" />
                        {t("workspaceAssistant.knowledge.history")}
                      </Button>
                      {canEdit(entry) ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => beginEdit(entry)}
                          >
                            <Pencil className="me-1 h-4 w-4" aria-hidden="true" />
                            {t("workspaceAssistant.knowledge.edit")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void archiveEntry(entry)}
                          >
                            <Archive className="me-1 h-4 w-4" aria-hidden="true" />
                            {t("workspaceAssistant.knowledge.archive")}
                          </Button>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
              <p className="text-body text-fg-secondary mt-2 whitespace-pre-wrap" dir="auto">
                {entry.content}
              </p>
              {entry.tags.length ? (
                <p className="text-label text-fg-muted mt-2">{entry.tags.join(" · ")}</p>
              ) : null}
              {entry.sourceUrl ? (
                <a
                  className="text-label text-primary mt-2 inline-block break-all underline"
                  href={entry.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {entry.sourceUrl}
                </a>
              ) : null}
              {historyFor === entry.id && history[entry.id] ? (
                <ol className="border-border mt-3 grid gap-2 border-t pt-3">
                  {history[entry.id]?.map((revision) => (
                    <li
                      key={revision.revision}
                      className="text-label text-fg-secondary bg-surface rounded-[var(--radius-control)] px-3 py-2"
                    >
                      <p className="font-semibold">
                        {t("workspaceAssistant.knowledge.revision", {
                          revision: revision.revision,
                        })}{" "}
                        ·{" "}
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(revision.createdAt))}
                      </p>
                      <p className="mt-1 font-medium">{revision.snapshot.title}</p>
                      <p className="mt-1 whitespace-pre-wrap" dir="auto">
                        {revision.snapshot.content}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
