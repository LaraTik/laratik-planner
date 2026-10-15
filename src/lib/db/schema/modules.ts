import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_helpers";
import { agencies, users } from "./identity";

/** Agency-level switches for product modules that are plan-entitled but opt-in. */
export const agencyModuleSettings = pgTable(
  "agency_module_setting",
  {
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("agency_module_setting_unique").on(t.agencyId, t.module),
    index("agency_module_setting_module_idx").on(t.module, t.enabled),
  ],
);

export type AgencyModuleSetting = typeof agencyModuleSettings.$inferSelect;
