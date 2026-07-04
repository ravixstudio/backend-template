import { enumToPgEnum } from "@repo/shared";
import { usersSchema } from "./index";
import { pgEnum, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export enum UserRole {
  ADMIN = "admin",
  USER = "user",
}

export const userRoleEnum = pgEnum("user_role", enumToPgEnum(UserRole));

export const usersTable = usersSchema.table(
  "users",
  {
    id: uuid("id").notNull().primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    avatar: text("avatar"),
    providerAccountId: text("provider_account_id").notNull().unique(),
    role: userRoleEnum("role").notNull().default(UserRole.USER),
    dodoCustomerId: text("dodo_customer_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type UpdateUser = Partial<NewUser>;
