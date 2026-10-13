import { env } from "@/lib/runtime-env";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Database binding `DB` is unavailable. Check the database configuration."
    );
  }

  return drizzle(env.DB, { schema });
}
