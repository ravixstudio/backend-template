import { enumToPgEnum } from "@repo/shared";
import { subscriptionsSchema } from "./index";
import { subscriptionPlansTable } from "./subscription_plans.db";
import { uuid, timestamp, index } from "drizzle-orm/pg-core";

export enum SubscriptionPlanPermissions {
  ANALYTICS_READ = "analytics_read",
  EXPORTS_UNLIMITED = "exports_unlimited",
  API_ADVANCED = "api_advanced",
}

export const subscriptionPlanPermissionsEnum = subscriptionsSchema.enum("subscription_plan_permission", enumToPgEnum(SubscriptionPlanPermissions));

export const subscriptionPlanPermissionsTable = subscriptionsSchema.table("subscription_plan_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionPlanId: uuid("subscription_plan_id").references(() => subscriptionPlansTable.id),
  permission: subscriptionPlanPermissionsEnum("permission").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_subscription_plan_permissions_subscription_plan_id").on(table.subscriptionPlanId),
  index("idx_subscription_plan_permissions_created_at").on(table.createdAt),
  index("idx_subscription_plan_permissions_updated_at").on(table.updatedAt),
  index("idx_subscription_plan_permissions_deleted_at").on(table.deletedAt),
])

export type SubscriptionPlanPermission = typeof subscriptionPlanPermissionsTable.$inferSelect;
export type NewSubscriptionPlanPermission = typeof subscriptionPlanPermissionsTable.$inferInsert;
export type UpdateSubscriptionPlanPermission = Partial<typeof subscriptionPlanPermissionsTable.$inferInsert>;