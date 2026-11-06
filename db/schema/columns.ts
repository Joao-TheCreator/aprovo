import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

/** Case-insensitive text (requires the `citext` extension, enabled in the first migration). */
export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
