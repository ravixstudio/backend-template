import { logger } from "@repo/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, PoolClient } from "pg";
import { env } from "@repo/config";
import * as schema from "./schema";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema, casing: "snake_case" });

export async function connectDB() {
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await client.query("SELECT 1");

    logger.info("Database connection established successfully", {
      module: "db",
      action: "connect",
    });

    return true;
  } catch (error) {
    logger.error("Database connection check failed", {
      module: "db",
      action: "connect",
      error,
    });
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}


export async function closeDB() {
  if (!pool) return;

  try {
    await pool.end();
    logger.info("Database connection closed successfully", {
      module: "db",
      action: "close",
    });
  } catch (error) {
    logger.error("Error while closing database connection", {
      module: "db",
      action: "close",
      error,
    });
  }
}

export type DBTransaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
