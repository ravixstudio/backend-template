import { enumToPgEnum } from "@repo/shared";
import { subscriptionsSchema } from "./index";
import { boolean, index, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

export enum Currency {
  USD = "usd",
}

export enum SubscriptionInterval {
  MONTHLY = "monthly",
  YEARLY = "yearly",
}

export const currencyEnum = subscriptionsSchema.enum("currency", enumToPgEnum(Currency))
export const subscriptionIntervalEnum = subscriptionsSchema.enum("subscription_interval", enumToPgEnum(SubscriptionInterval))

export const subscriptionPlansTable = subscriptionsSchema.table("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  dodoProductId: text("dodo_product_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  price: integer("price").notNull(), // in cents
  currency: currencyEnum("currency").notNull().default(Currency.USD),
  interval: subscriptionIntervalEnum("interval").notNull().default(SubscriptionInterval.MONTHLY),
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_subscription_plans_is_active").on(table.isActive),
  index("idx_subscription_plans_created_at").on(table.createdAt),
  index("idx_subscription_plans_updated_at").on(table.updatedAt),
  index("idx_subscription_plans_deleted_at").on(table.deletedAt),
])

export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlansTable.$inferInsert;
export type UpdateSubscriptionPlan = Partial<typeof subscriptionPlansTable.$inferInsert>;