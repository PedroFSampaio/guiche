// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
export const unitState = sqliteTable("unit_state", { id: text("id").primaryKey(), version: integer("version").notNull().default(0), data: text("data").notNull() });
