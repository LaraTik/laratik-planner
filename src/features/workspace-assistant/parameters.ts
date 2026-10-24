import { z } from "zod";

export const AssistantPromptParameterSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    type: z.enum(["text", "month", "content_reference"]),
    label: z.string().trim().min(1).max(80),
    required: z.boolean().default(false),
    defaultValue: z.string().max(500).optional(),
  })
  .strict();

export const AssistantPromptParametersSchema = z
  .array(AssistantPromptParameterSchema)
  .max(8)
  .superRefine((parameters, context) => {
    const keys = new Set<string>();
    for (const [index, parameter] of parameters.entries()) {
      if (keys.has(parameter.key)) {
        context.addIssue({
          code: "custom",
          path: [index, "key"],
          message: "Prompt parameter keys must be unique.",
        });
      }
      keys.add(parameter.key);
      if (parameter.required && parameter.defaultValue?.trim() === "") {
        context.addIssue({
          code: "custom",
          path: [index, "defaultValue"],
          message: "A required parameter default cannot be empty.",
        });
      }
      if (
        parameter.type === "month" &&
        parameter.defaultValue &&
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(parameter.defaultValue)
      ) {
        context.addIssue({
          code: "custom",
          path: [index, "defaultValue"],
          message: "Month defaults must use YYYY-MM.",
        });
      }
    }
  });

export type AssistantPromptParameter = z.infer<typeof AssistantPromptParameterSchema>;

export function resolveAssistantPromptParameters(definitionsInput: unknown, valuesInput: unknown) {
  const definitions = AssistantPromptParametersSchema.safeParse(
    Array.isArray(definitionsInput) ? definitionsInput : [],
  );
  const values = z.record(z.string(), z.string().max(1_000)).safeParse(valuesInput ?? {});
  if (!definitions.success || !values.success) return { ok: false as const };
  const allowed = new Set(definitions.data.map((parameter) => parameter.key));
  if (Object.keys(values.data).some((key) => !allowed.has(key))) return { ok: false as const };

  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  for (const parameter of definitions.data) {
    const value = (values.data[parameter.key] ?? parameter.defaultValue ?? "").trim();
    if (parameter.required && !value) missing.push(parameter.key);
    if (parameter.type === "month" && value && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
      return { ok: false as const };
    }
    if (value) resolved[parameter.key] = value;
  }
  if (missing.length) return { ok: false as const, missing };
  return { ok: true as const, definitions: definitions.data, values: resolved };
}

export function expandAssistantPromptTemplate(template: string, values: Record<string, string>) {
  let invalid = false;
  const text = template.replace(/\{\{([a-z][a-z0-9_]{0,39})\}\}/g, (_, key: string) => {
    if (!(key in values)) {
      invalid = true;
      return "";
    }
    return values[key] ?? "";
  });
  if (/\{\{|\}\}/.test(text)) invalid = true;
  return invalid ? null : text;
}
