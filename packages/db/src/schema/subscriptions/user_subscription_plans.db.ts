import { boolean, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { subscriptionsSchema } from "./index";
import { subscriptionPlansTable } from "./subscription_plans.db";
import { usersTable } from "../users/users.db";
import { enumToPgEnum } from "@repo/shared";

export enum UserSubscriptionPlanStatus {
  ACTIVE = "active",
  CANCELLED = "cancelled",
  EXPIRED = "expired",
}

export const userSubscriptionPlanStatusEnum = subscriptionsSchema.enum("user_subscription_plan_status", enumToPgEnum(UserSubscriptionPlanStatus));

export const userSubscriptionPlansTable = subscriptionsSchema.table("user_subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  subscriptionPlanId: uuid("subscription_plan_id").notNull().references(() => subscriptionPlansTable.id),
  status: userSubscriptionPlanStatusEnum("status").notNull().default(UserSubscriptionPlanStatus.ACTIVE),
  dodoSubscriptionPlanId: text("dodo_subscription_plan_id").notNull().unique(),
  dodoCustomerId: text("dodo_customer_id").notNull().unique(),
  currentPeriodStartDate: timestamp("current_period_start_date").notNull().defaultNow(),
  currentPeriodEndDate: timestamp("current_period_end_date").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  metadata: jsonb("metadata").notNull().default({}),
}, (table) => [
  index("idx_user_subscription_plans_user_id").on(table.userId),
  index("idx_user_subscription_plans_subscription_plan_id").on(table.subscriptionPlanId),
  index("idx_user_subscription_plans_status").on(table.status),
  index("idx_user_subscription_plans_dodo_customer_id").on(table.dodoCustomerId),
  index("idx_user_subscription_plans_period_end_date").on(table.currentPeriodEndDate),
])