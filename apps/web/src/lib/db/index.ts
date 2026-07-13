import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

/** Lazy proxy so importing this module does not require DATABASE_URL at build time. */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
