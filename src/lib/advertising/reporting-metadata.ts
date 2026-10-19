import { z } from "zod";

export const advertisingEntityTypeSchema = z.enum(["campaign", "adset", "ad", "creative"]);
export const advertisingTaxonomyLabelTypeSchema = z.enum([
  "brand",
  "platform",
  "objective",
  "topic",
  "language",
  "month",
]);

export const advertisingTagInputSchema = z.object({
  workspace: z.string().min(1),
  accountId: z.string().uuid(),
  entityType: advertisingEntityTypeSchema,
  entityId: z.string().trim().min(1).max(255),
  labelType: advertisingTaxonomyLabelTypeSchema,
  tagValue: z.string().trim().min(1).max(80),
});

export type AdvertisingEntityType = z.infer<typeof advertisingEntityTypeSchema>;
export type AdvertisingTaxonomyLabelType = z.infer<typeof advertisingTaxonomyLabelTypeSchema>;
export type AdvertisingTagInput = z.infer<typeof advertisingTagInputSchema>;

export function normalizeAdvertisingTag(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

export function advertisingTagKey(entityType: string, entityId: string) {
  return `${entityType}:${entityId}`;
}
