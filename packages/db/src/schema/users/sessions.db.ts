import { index, jsonb, pgEnum, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersSchema } from "./index";
import { usersTable } from "./users.db";
import { relations } from "drizzle-orm";
import { enumToPgEnum } from "@repo/shared";

export interface SessionMetadata {
  userAgent?: string;
  device?: string;
  os?: string;
  browser?: string;
}

export enum SessionProvider {
  GOOGLE = "google",
  APPLE = "apple",
}

export enum SessionStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
  EXPIRED = "expired",
}

export const sessionProviderEnum = pgEnum("session_provider", enumToPgEnum(SessionProvider));
export const sessionStatusEnum = pgEnum("session_status", enumToPgEnum(SessionStatus));

export const sessionsTable = usersSchema.table(
  "sessions",
  {
    id: uuid("id").notNull().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    status: sessionStatusEnum("status").notNull(),
    userIp: text("user_ip").notNull().default(""),

    provider: sessionProviderEnum("provider").notNull(),
    providerAccessToken: text("provider_access_token").notNull(),
    providerAccessTokenIv: text("provider_access_token_iv").notNull(),
    providerAccessTokenTag: text("provider_access_token_tag").notNull(),
    providerAccessTokenExpiresAt: timestamp("provider_access_token_expires_at", {
      withTimezone: true,
    }).notNull(),
    providerRefreshToken: text("provider_refresh_token").notNull(),
    providerRefreshTokenIv: text("provider_refresh_token_iv").notNull(),
    providerRefreshTokenTag: text("provider_refresh_token_tag").notNull(),
    providerScope: text("provider_scope").notNull(),
    providerRefreshTokenExpiresAt: timestamp("provider_refresh_token_expires_at", {
      withTimezone: true,
    }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),

    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<SessionMetadata>().default({}),
  },
  (table) => [
    uniqueIndex("sessions_provider_refresh_token_idx").on(table.providerRefreshToken),
    index("sessions_provider_account_id_idx").on(table.providerAccountId),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_status_idx").on(table.status),
    index("sessions_last_accessed_at_idx").on(table.lastAccessedAt),
    index("sessions_revoked_at_idx").on(table.revokedAt),
    index("sessions_expires_at_idx").on(table.expiresAt),
    index("sessions_provider_idx").on(table.provider),
  ],
);

export const sessionsRelations = relations(sessionsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [sessionsTable.userId],
    references: [usersTable.id],
  }),
}));

export type Session = typeof sessionsTable.$inferSelect;
export type NewSession = typeof sessionsTable.$inferInsert;
export type UpdateSession = Partial<NewSession>;
