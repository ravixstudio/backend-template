# Database Guide

PostgreSQL database with **Drizzle ORM** for type-safe queries and migrations.

## Overview

The database layer provides:

- **Drizzle ORM** for type-safe queries
- **Connection pooling** with pg Pool
- **Transaction support** with rollback
- **Service namespaces** for CRUD operations
- **Metrics tracking** for all queries
- **Soft deletes** with `deletedAt` timestamps

## Quick Start

### Initialize Connection

```typescript
// apps/api/src/index.ts
import { initializeDB, connectDB } from "@repo/db";

// Initialize with config
initializeDB({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === "development" ? false : { rejectUnauthorized: false },
});

// Connect on startup
await connectDB();
```

### Use Services

```typescript
import { UsersService, SessionService } from "@repo/db";

// Create user
const user = await UsersService.create({
  email: "user@example.com",
  firstName: "John",
  lastName: "Doe",
  providerAccountId: "google-123",
});

// Find by email
const existingUser = await UsersService.findByEmail("user@example.com");
```

## Project Structure

```
packages/db/
├── src/
│   ├── index.ts              # Public exports
│   ├── connection.ts         # Pool management & types
│   ├── schema/
│   │   ├── index.ts          # Schema re-exports
│   │   └── users/
│   │       ├── index.ts      # Domain exports
│   │       ├── users.db.ts   # Users table
│   │       └── sessions.db.ts # Sessions table
│   ├── services/
│   │   ├── users.service.ts  # User operations
│   │   └── session.service.ts # Session operations
│   └── utils/
│       └── metrics-wrapper.ts # Query metrics
├── package.json
└── README.md
```

## Schema Definitions

### Users Table

```typescript
// packages/db/src/schema/users/users.db.ts
import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    avatar: text("avatar"),
    providerAccountId: text("provider_account_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

// Type exports
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type UpdateUser = Partial<NewUser>;
```

### Sessions Table

```typescript
// packages/db/src/schema/users/sessions.db.ts
export const sessionProviderEnum = pgEnum("session_provider", ["google", "apple"]);
export const sessionStatusEnum = pgEnum("session_status", ["active", "expired", "revoked"]);

export const sessionsTable = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id),
  status: sessionStatusEnum("status").notNull().default("active"),
  provider: sessionProviderEnum("provider").notNull(),

  // Encrypted OAuth tokens
  providerAccessToken: varchar("provider_access_token", { length: 2048 }).notNull(),
  providerAccessTokenIv: varchar("provider_access_token_iv", { length: 32 }).notNull(),
  providerAccessTokenTag: varchar("provider_access_token_tag", { length: 32 }).notNull(),
  providerAccessTokenExpiresAt: timestamp("provider_access_token_expires_at", {
    withTimezone: true,
  }),

  providerRefreshToken: varchar("provider_refresh_token", { length: 2048 }),
  providerRefreshTokenIv: varchar("provider_refresh_token_iv", { length: 32 }),
  providerRefreshTokenTag: varchar("provider_refresh_token_tag", { length: 32 }),
  providerRefreshTokenExpiresAt: timestamp("provider_refresh_token_expires_at", {
    withTimezone: true,
  }),

  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  providerScope: text("provider_scope"),

  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  metadata: jsonb("metadata").default({}),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
```

## Service Pattern

Services use namespaces with optional logger and transaction support:

```typescript
// packages/db/src/services/users.service.ts
import { db, type DBTransaction } from "../connection";
import { usersTable, type NewUser, type UpdateUser } from "../schema";
import { withMetrics } from "../utils/metrics-wrapper";
import { eq } from "drizzle-orm";

export namespace UsersService {
  export async function create(
    payload: NewUser,
    logger?: {
      audit: (msg: string, meta: any) => void;
      error: (msg: string, meta: any) => void;
    },
    options?: { tx?: DBTransaction },
  ) {
    const queryClient = options?.tx || db;

    try {
      const result = await withMetrics("insert", "users", async () =>
        queryClient.insert(usersTable).values(payload).returning(),
      );
      const [createdUser] = result;

      logger?.audit("User created", {
        module: "db",
        action: "service:create",
        userId: createdUser.id,
      });

      return createdUser;
    } catch (err) {
      logger?.error("Failed to create user", {
        module: "db",
        action: "service:create",
        error: err,
      });
      throw err;
    }
  }

  export async function findByEmail(
    email: string,
    logger?: { error: (msg: string, meta: any) => void },
    options?: { tx?: DBTransaction; includeDeleted?: boolean },
  ) {
    const queryClient = options?.tx || db;

    try {
      return await withMetrics("select", "users", async () =>
        queryClient.query.usersTable.findFirst({
          where: (table, { eq, and, isNull }) =>
            options?.includeDeleted
              ? eq(table.email, email)
              : and(eq(table.email, email), isNull(table.deletedAt)),
        }),
      );
    } catch (err) {
      logger?.error("Failed to find user", {
        module: "db",
        action: "service:findByEmail",
        error: err,
      });
      throw err;
    }
  }

  export async function update(
    id: string,
    payload: UpdateUser,
    logger?: { audit: (msg: string, meta: any) => void; error: (msg: string, meta: any) => void },
    options?: { tx?: DBTransaction },
  ) {
    const queryClient = options?.tx || db;

    try {
      const result = await withMetrics("update", "users", async () =>
        queryClient
          .update(usersTable)
          .set({ ...payload, updatedAt: new Date() })
          .where(eq(usersTable.id, id))
          .returning(),
      );

      logger?.audit("User updated", {
        module: "db",
        action: "service:update",
        userId: id,
      });

      return result[0];
    } catch (err) {
      logger?.error("Failed to update user", {
        module: "db",
        action: "service:update",
        error: err,
      });
      throw err;
    }
  }

  // Soft delete
  export async function softDelete(
    id: string,
    logger?: { audit: (msg: string, meta: any) => void; error: (msg: string, meta: any) => void },
    options?: { tx?: DBTransaction },
  ) {
    return update(id, { deletedAt: new Date() }, logger, options);
  }
}
```

## Transactions

Use transactions for multi-table operations:

```typescript
import { db } from "@repo/db";

async function createUserWithSession(userData: NewUser, sessionData: NewSession) {
  return db.transaction(async (tx) => {
    // Create user
    const user = await UsersService.create(userData, { tx });

    // Create session
    const session = await SessionService.create({ ...sessionData, userId: user.id }, { tx });

    // If any operation fails, entire transaction rolls back
    return { user, session };
  });
}
```

### Transaction Type

```typescript
import type { DBTransaction } from "@repo/db";

function myServiceMethod(payload: Data, options?: { tx?: DBTransaction }) {
  const queryClient = options?.tx || db;
  // Use queryClient for queries
}
```

## Migrations

### Generate Migration

After modifying schema files:

```bash
bun run db:generate
```

This creates SQL migration files in `apps/api/drizzle/`.

### Apply Migrations

```bash
bun run db:migrate
```

### Drizzle Configuration

```typescript
// apps/api/drizzle.config.ts
import { defineConfig } from "drizzle-kit";
import { env } from "./src/env";

export default defineConfig({
  schema: "../../packages/db/src/schema/**/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  casing: "snake_case",
});
```

## Query Examples

### Basic CRUD

```typescript
import { db } from "@repo/db";
import { usersTable } from "@repo/db/schema";
import { eq, and, isNull, desc, like } from "drizzle-orm";

// Select all
const users = await db.select().from(usersTable);

// Select with conditions
const activeUsers = await db.select().from(usersTable).where(isNull(usersTable.deletedAt));

// Select specific columns
const emails = await db.select({ email: usersTable.email }).from(usersTable);

// Insert
const [newUser] = await db
  .insert(usersTable)
  .values({ email: "test@example.com", firstName: "Test" })
  .returning();

// Update
await db.update(usersTable).set({ firstName: "Updated" }).where(eq(usersTable.id, userId));

// Soft delete
await db.update(usersTable).set({ deletedAt: new Date() }).where(eq(usersTable.id, userId));
```

### Query Builder

```typescript
// Using query API
const user = await db.query.usersTable.findFirst({
  where: (table, { eq }) => eq(table.email, email),
});

// With relations (if defined)
const userWithSessions = await db.query.usersTable.findFirst({
  where: (table, { eq }) => eq(table.id, userId),
  with: {
    sessions: true,
  },
});
```

### Complex Queries

```typescript
// Search with LIKE
const results = await db
  .select()
  .from(usersTable)
  .where(like(usersTable.email, `%${search}%`));

// Multiple conditions
const filteredUsers = await db
  .select()
  .from(usersTable)
  .where(and(isNull(usersTable.deletedAt), eq(usersTable.firstName, "John")));

// Ordering and pagination
const pagedUsers = await db
  .select()
  .from(usersTable)
  .where(isNull(usersTable.deletedAt))
  .orderBy(desc(usersTable.createdAt))
  .limit(10)
  .offset(20);
```

## Metrics

All queries are automatically tracked:

```typescript
// packages/db/src/utils/metrics-wrapper.ts
import { dbQueriesCounter, dbQueryDuration } from "@repo/shared/metrics";

export async function withMetrics<T>(
  operation: string,
  table: string,
  fn: () => Promise<T>,
): Promise<T> {
  const timer = dbQueryDuration.startTimer({ operation, table });

  try {
    const result = await fn();
    dbQueriesCounter.inc({ operation, table });
    return result;
  } finally {
    timer();
  }
}
```

**Metrics tracked:**

| Metric                      | Labels               | Description          |
| --------------------------- | -------------------- | -------------------- |
| `db_queries_total`          | `operation`, `table` | Query count          |
| `db_query_duration_seconds` | `operation`, `table` | Query execution time |
| `db_connection_pool_size`   | -                    | Active connections   |

## Schema Conventions

### Naming

- **Tables**: `snake_case` plural (`users`, `sessions`)
- **Columns**: `snake_case` (`created_at`, `first_name`)
- **TypeScript**: `camelCase` in code, Drizzle maps automatically

### Standard Columns

Every table should include:

```typescript
{
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}
```

### Soft Deletes

Always use soft deletes:

```typescript
// Soft delete
await db.update(usersTable).set({ deletedAt: new Date() }).where(eq(usersTable.id, id));

// Query excluding deleted
const activeUsers = await db.query.usersTable.findMany({
  where: (table, { isNull }) => isNull(table.deletedAt),
});
```

### Timestamps

Always use `withTimezone: true`:

```typescript
createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
```

## Adding New Tables

### 1. Create Schema File

```typescript
// packages/db/src/schema/orders/orders.db.ts
import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "../users/users.db";

export const ordersTable = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id),
  status: text("status").notNull().default("pending"),
  total: integer("total").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type Order = typeof ordersTable.$inferSelect;
export type NewOrder = typeof ordersTable.$inferInsert;
```

### 2. Export from Schema Index

```typescript
// packages/db/src/schema/index.ts
export * from "./users";
export * from "./orders/orders.db";
```

### 3. Create Service

```typescript
// packages/db/src/services/orders.service.ts
import { db, type DBTransaction } from "../connection";
import { ordersTable, type NewOrder } from "../schema";
import { withMetrics } from "../utils/metrics-wrapper";

export namespace OrdersService {
  export async function create(
    payload: NewOrder,
    logger?: { audit: (msg: string, meta: any) => void; error: (msg: string, meta: any) => void },
    options?: { tx?: DBTransaction },
  ) {
    const queryClient = options?.tx || db;

    try {
      const result = await withMetrics("insert", "orders", async () =>
        queryClient.insert(ordersTable).values(payload).returning(),
      );

      logger?.audit("Order created", {
        module: "db",
        action: "service:create",
        orderId: result[0].id,
      });

      return result[0];
    } catch (err) {
      logger?.error("Failed to create order", {
        module: "db",
        action: "service:create",
        error: err,
      });
      throw err;
    }
  }
}
```

### 4. Export from Package

```typescript
// packages/db/src/index.ts
export * from "./services/orders.service";
```

### 5. Generate Migration

```bash
bun run db:generate
bun run db:migrate
```

## Local Development

### Start PostgreSQL

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

### Connection Details

```
Host: localhost
Port: 5432
Database: backend-template
User: postgres
Password: postgres
```

### Drizzle Studio

For visual database exploration:

```bash
bunx drizzle-kit studio
```

Opens at http://localhost:4983

## Troubleshooting

### Connection Refused

```
Error: Connection refused
```

**Solutions:**

1. Ensure PostgreSQL is running: `docker compose ps`
2. Check DATABASE_URL in `.env`
3. Verify port 5432 is not blocked

### Migration Conflicts

```
Error: relation already exists
```

**Solutions:**

1. Check existing migrations in `apps/api/drizzle/`
2. Drop and recreate database for fresh start:
   ```bash
   docker compose down -v
   docker compose up -d postgres
   bun run db:migrate
   ```

### Type Errors

```
Type 'X' is not assignable to type 'Y'
```

**Solutions:**

1. Re-run `bun run db:generate` to update types
2. Check schema file for proper type exports
3. Ensure `@repo/db` is rebuilt: `bun run build --filter=@repo/db`

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [AUTHENTICATION.md](./AUTHENTICATION.md) - Auth schema details
- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)
