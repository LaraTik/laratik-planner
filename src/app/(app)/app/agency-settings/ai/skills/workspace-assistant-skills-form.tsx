"use client";

import * as React from "react";
import { useActionState, useState } from "react";
import { Archive, Check, Clock3, RotateCcw, Save, Send, Sparkles } from "lucide-react";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import {
  archiveWorkspaceAssistantSkillAction,
  reviewWorkspaceAssistantSkillAction,
  rollbackWorkspaceAssistantSkillAction,
  saveWorkspaceAssistantSkillAction,
  submitWorkspaceAssistantSkillAction,
  type SkillActionState,
} from "./actions";

type SkillDraft = {
  slug: string;
  category: "strategy" | "planning" | "creation" | "quality";
  name: string;
  description: string;
  tags: string[];
  triggers: string[];
  examples: string[];
  requiredInputs: string[];
  optionalInputs: string[];
  supportedFormats: string[];
  requiredKnowledgeSources: string[];
  instructions: string;
  workflow: string[];
  outputContract: string[];
  qualityChecklist: string[];
  relatedSkills: string[];
};

type SkillRecord = {
  id: string;
  slug: string;
  status: string;
  latestRevision: number;
  activeRevision: number | null;
  revisions: { revision: number; state: string; snapshot: SkillDraft; createdBy: string }[];
};

const EMPTY_DRAFT: SkillDraft = {
  slug: "",
  category: "planning",
  name: "",
  description: "",
  tags: [],
  triggers: [],
  examples: [],
  requiredInputs: [],
  optionalInputs: [],
  supportedFormats: [],
  requiredKnowledgeSources: [],
  instructions: "",
  workflow: [],
  outputContract: [],
  qualityChecklist: [],
  relatedSkills: [],
};

function errorText(state: SkillActionState, t: ReturnType<typeof useLocaleT>) {
  return state.errorCode ? t(`agencyAi.skills.errors.${state.errorCode}`) : null;
}

function LifecycleForm({
  action,
  fields,
  label,
  tone = "outline",
  t,
  children,
}: {
  action: (previous: SkillActionState, formData: FormData) => Promise<SkillActionState>;
  fields: Record<string, string | number>;
  label: string;
  tone?: "outline" | "default" | "destructive";
  t: ReturnType<typeof useLocaleT>;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" variant={tone} disabled={pending} className="min-h-11">
        {children}
        {label}
      </Button>
      {state.done ? (
        <span className="text-label text-success" role="status">
          {t("agencyAi.skills.actionComplete")}
        </span>
      ) : null}
      {errorText(state, t) ? (
        <span className="text-label text-danger" role="alert">
          {errorText(state, t)}
        </span>
      ) : null}
    </form>
  );
}

export function WorkspaceAssistantSkillsForm({ skills }: { skills: SkillRecord[] }) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const [selected, setSelected] = useState<{ skillId?: string; draft: SkillDraft } | null>(null);
  const [state, formAction] = useActionState<SkillActionState, FormData>(
    saveWorkspaceAssistantSkillAction,
    {},
  );
  const editing = selected !== null;
  const draft = selected?.draft ?? EMPTY_DRAFT;
  const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) =>
    setSelected((current) => ({
      ...(current?.skillId ? { skillId: current.skillId } : {}),
      draft: { ...(current?.draft ?? EMPTY_DRAFT), [key]: value },
    }));
  const lineList = (
    key: Exclude<keyof SkillDraft, "slug" | "category" | "name" | "description" | "instructions">,
  ) => draft[key].join("\n");
  const input = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    helper?: string,
  ) => (
    <FormField id={id} label={label} {...(helper ? { hint: helper } : {})}>
      <DirAwareInput
        id={id}
        name={id}
        value={value}
        locale={locale}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
  const textarea = (id: string, label: string, value: string, rows: number, helper?: string) => (
    <FormField id={id} label={label} {...(helper ? { hint: helper } : {})}>
      <DirAwareTextarea
        id={id}
        name={id}
        value={value}
        locale={locale}
        rows={rows}
        onChange={(event) => {
          const key = id as keyof SkillDraft;
          if (key !== "instructions") {
            const values = event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            set(
              key as Exclude<
                keyof SkillDraft,
                "slug" | "category" | "name" | "description" | "instructions"
              >,
              values,
            );
          } else set("instructions", event.target.value);
        }}
      />
    </FormField>
  );

  return (
    <div className="space-y-6" data-testid="workspace-assistant-skills-library">
      <Card>
        <CardHeader>
          <CardTitle>{t("agencyAi.skills.editorTitle")}</CardTitle>
          <CardDescription>{t("agencyAi.skills.editorDescription")}</CardDescription>
        </CardHeader>
        <form action={formAction} className="space-y-4 p-5" data-testid="assistant-skill-form">
          {selected?.skillId ? (
            <input type="hidden" name="skillId" value={selected.skillId} />
          ) : null}
          {state.errorCode ? (
            <p className="bg-danger-subtle text-body text-danger rounded p-3" role="alert">
              {errorText(state, t)}
            </p>
          ) : null}
          {state.savedRevision ? (
            <p className="bg-success-subtle text-body text-success rounded p-3" role="status">
              {t("agencyAi.skills.savedRevision", { revision: state.savedRevision })}
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {input("slug", t("agencyAi.skills.slug"), draft.slug, (value) => set("slug", value))}
            <FormField id="category" label={t("agencyAi.skills.category")}>
              <select
                id="category"
                name="category"
                value={draft.category}
                onChange={(event) => set("category", event.target.value as SkillDraft["category"])}
                className="border-border bg-surface text-body h-10 w-full rounded-[var(--radius-control)] border px-3"
              >
                {(["strategy", "planning", "creation", "quality"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`agencyAi.skills.categories.${value}`)}
                  </option>
                ))}
              </select>
            </FormField>
            {input("name", t("agencyAi.skills.name"), draft.name, (value) => set("name", value))}
            {input("description", t("agencyAi.skills.description"), draft.description, (value) =>
              set("description", value),
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {textarea("tags", t("agencyAi.skills.tags"), lineList("tags"), 3)}
            {textarea("triggers", t("agencyAi.skills.triggers"), lineList("triggers"), 3)}
            {textarea("examples", t("agencyAi.skills.examples"), lineList("examples"), 3)}
            {textarea(
              "requiredInputs",
              t("agencyAi.skills.requiredInputs"),
              lineList("requiredInputs"),
              3,
            )}
            {textarea(
              "optionalInputs",
              t("agencyAi.skills.optionalInputs"),
              lineList("optionalInputs"),
              3,
            )}
            {textarea(
              "supportedFormats",
              t("agencyAi.skills.supportedFormats"),
              lineList("supportedFormats"),
              3,
            )}
            {textarea(
              "requiredKnowledgeSources",
              t("agencyAi.skills.knowledgeSources"),
              lineList("requiredKnowledgeSources"),
              3,
            )}
            {textarea("workflow", t("agencyAi.skills.workflow"), lineList("workflow"), 5)}
            {textarea(
              "outputContract",
              t("agencyAi.skills.outputContract"),
              lineList("outputContract"),
              4,
            )}
            {textarea(
              "qualityChecklist",
              t("agencyAi.skills.qualityChecklist"),
              lineList("qualityChecklist"),
              5,
            )}
            {textarea(
              "relatedSkills",
              t("agencyAi.skills.relatedSkills"),
              lineList("relatedSkills"),
              3,
            )}
          </div>
          {textarea(
            "instructions",
            t("agencyAi.skills.instructions"),
            draft.instructions,
            8,
            t("agencyAi.skills.instructionsHelper"),
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-label text-fg-muted">{t("agencyAi.skills.immutableNote")}</p>
            <div className="flex gap-2">
              {editing ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected(null)}
                  className="min-h-11"
                >
                  {t("agencyAi.skills.cancelEdit")}
                </Button>
              ) : null}
              <FormSubmitButton
                label={
                  <>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {editing ? t("agencyAi.skills.saveRevision") : t("agencyAi.skills.create")}
                  </>
                }
                pendingLabel={t("agencyAi.skills.saving")}
              />
            </div>
          </div>
        </form>
      </Card>

      <section className="space-y-3" aria-label={t("agencyAi.skills.libraryTitle")}>
        <h2 className="text-title-section text-fg-primary font-semibold">
          {t("agencyAi.skills.libraryTitle")}
        </h2>
        {skills.length ? (
          skills.map((entry) => {
            const latest = entry.revisions.find(
              (revision) => revision.revision === entry.latestRevision,
            );
            const active = entry.revisions.find(
              (revision) => revision.revision === entry.activeRevision,
            );
            const pending = entry.revisions.find((revision) => revision.state === "pending_review");
            return (
              <Card key={entry.id} data-testid={`assistant-skill-${entry.slug}`}>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{latest?.snapshot.name ?? entry.slug}</CardTitle>
                    <Badge variant={entry.status === "active" ? "success" : "outline"}>
                      {t(`agencyAi.skills.status.${entry.status}`)}
                    </Badge>
                    {active ? (
                      <Badge variant="outline">
                        {t("agencyAi.skills.activeRevision", { revision: active.revision })}
                      </Badge>
                    ) : null}
                  </div>
                  <CardDescription>{latest?.snapshot.description ?? ""}</CardDescription>
                </CardHeader>
                <div className="space-y-3 p-5">
                  {latest ? (
                    <p className="text-label text-fg-muted">
                      {t("agencyAi.skills.latestRevision", {
                        revision: latest.revision,
                        state: t(`agencyAi.skills.revisionState.${latest.state}`),
                      })}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {latest && latest.state !== "pending_review" && entry.status !== "archived" ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSelected({ skillId: entry.id, draft: latest.snapshot })}
                        className="min-h-11"
                      >
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        {t("agencyAi.skills.edit")}
                      </Button>
                    ) : null}
                    {latest && latest.state === "draft" ? (
                      <LifecycleForm
                        action={submitWorkspaceAssistantSkillAction}
                        fields={{ skillId: entry.id, revision: latest.revision }}
                        label={t("agencyAi.skills.submitReview")}
                        t={t}
                      >
                        <Send className="h-4 w-4" aria-hidden="true" />
                      </LifecycleForm>
                    ) : null}
                    {pending ? (
                      <LifecycleForm
                        action={reviewWorkspaceAssistantSkillAction}
                        fields={{ skillId: entry.id, revision: pending.revision }}
                        label={t("agencyAi.skills.reviewActivate")}
                        t={t}
                      >
                        <select
                          name="decision"
                          defaultValue="approve"
                          aria-label={t("agencyAi.skills.reviewDecision")}
                          className="border-border bg-surface text-body h-11 rounded-[var(--radius-control)] border px-3"
                        >
                          <option value="approve">{t("agencyAi.skills.approve")}</option>
                          <option value="reject">{t("agencyAi.skills.reject")}</option>
                        </select>
                        <input
                          name="reviewNote"
                          maxLength={500}
                          placeholder={t("agencyAi.skills.reviewNote")}
                          className="border-border bg-surface text-body h-11 rounded-[var(--radius-control)] border px-3"
                        />
                      </LifecycleForm>
                    ) : null}
                    {active && entry.status !== "archived"
                      ? entry.revisions
                          .filter(
                            (revision) =>
                              revision.state === "approved" &&
                              revision.revision !== active.revision,
                          )
                          .map((revision) => (
                            <LifecycleForm
                              key={revision.revision}
                              action={rollbackWorkspaceAssistantSkillAction}
                              fields={{ skillId: entry.id, targetRevision: revision.revision }}
                              label={t("agencyAi.skills.rollback", { revision: revision.revision })}
                              t={t}
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            </LifecycleForm>
                          ))
                      : null}
                    {entry.status !== "archived" ? (
                      <LifecycleForm
                        action={archiveWorkspaceAssistantSkillAction}
                        fields={{ skillId: entry.id }}
                        label={t("agencyAi.skills.archive")}
                        tone="destructive"
                        t={t}
                      >
                        <Archive className="h-4 w-4" aria-hidden="true" />
                      </LifecycleForm>
                    ) : null}
                  </div>
                  {entry.revisions.length > 0 ? (
                    <ul className="border-border divide-border divide-y rounded border">
                      {entry.revisions.map((revision) => (
                        <li
                          key={revision.revision}
                          className="text-label text-fg-secondary flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <span>
                            {t("agencyAi.skills.historyRow", {
                              revision: revision.revision,
                              state: t(`agencyAi.skills.revisionState.${revision.state}`),
                            })}
                          </span>
                          {revision.revision === entry.activeRevision ? (
                            <Check
                              className="text-success h-4 w-4"
                              aria-label={t("agencyAi.skills.activeMark")}
                            />
                          ) : revision.state === "pending_review" ? (
                            <Clock3 className="text-warning h-4 w-4" aria-hidden="true" />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </Card>
            );
          })
        ) : (
          <Card>
            <p className="text-body text-fg-muted p-5">{t("agencyAi.skills.empty")}</p>
          </Card>
        )}
      </section>
    </div>
  );
}
