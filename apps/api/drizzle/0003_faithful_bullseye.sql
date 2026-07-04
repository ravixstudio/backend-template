CREATE SCHEMA "subscriptions";
--> statement-breakpoint
CREATE TYPE "subscriptions"."currency" AS ENUM('usd');--> statement-breakpoint
CREATE TYPE "subscriptions"."subscription_interval" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "subscriptions"."subscription_plan_permission" AS ENUM('analytics_read', 'exports_unlimited', 'api_advanced');--> statement-breakpoint
CREATE TYPE "subscriptions"."user_subscription_plan_status" AS ENUM('active', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "subscriptions"."subscription_plan_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_plan_id" uuid,
	"permission" "subscriptions"."subscription_plan_permission" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriptions"."subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dodo_product_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"price" integer NOT NULL,
	"currency" "subscriptions"."currency" DEFAULT 'usd' NOT NULL,
	"interval" "subscriptions"."subscription_interval" DEFAULT 'monthly' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "subscription_plans_dodo_product_id_unique" UNIQUE("dodo_product_id"),
	CONSTRAINT "subscription_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriptions"."user_subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_plan_id" uuid NOT NULL,
	"status" "subscriptions"."user_subscription_plan_status" DEFAULT 'active' NOT NULL,
	"dodo_subscription_plan_id" text NOT NULL,
	"dodo_customer_id" text NOT NULL,
	"current_period_start_date" timestamp DEFAULT now() NOT NULL,
	"current_period_end_date" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "user_subscription_plans_dodo_subscription_plan_id_unique" UNIQUE("dodo_subscription_plan_id"),
	CONSTRAINT "user_subscription_plans_dodo_customer_id_unique" UNIQUE("dodo_customer_id")
);
--> statement-breakpoint
ALTER TABLE "users"."users" ADD COLUMN "dodo_customer_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions"."subscription_plan_permissions" ADD CONSTRAINT "subscription_plan_permissions_subscription_plan_id_subscription_plans_id_fk" FOREIGN KEY ("subscription_plan_id") REFERENCES "subscriptions"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions"."user_subscription_plans" ADD CONSTRAINT "user_subscription_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions"."user_subscription_plans" ADD CONSTRAINT "user_subscription_plans_subscription_plan_id_subscription_plans_id_fk" FOREIGN KEY ("subscription_plan_id") REFERENCES "subscriptions"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subscription_plan_permissions_subscription_plan_id" ON "subscriptions"."subscription_plan_permissions" USING btree ("subscription_plan_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_plan_permissions_created_at" ON "subscriptions"."subscription_plan_permissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_subscription_plan_permissions_updated_at" ON "subscriptions"."subscription_plan_permissions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_subscription_plan_permissions_deleted_at" ON "subscriptions"."subscription_plan_permissions" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_subscription_plans_is_active" ON "subscriptions"."subscription_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_subscription_plans_created_at" ON "subscriptions"."subscription_plans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_subscription_plans_updated_at" ON "subscriptions"."subscription_plans" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_subscription_plans_deleted_at" ON "subscriptions"."subscription_plans" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_user_subscription_plans_user_id" ON "subscriptions"."user_subscription_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_subscription_plans_subscription_plan_id" ON "subscriptions"."user_subscription_plans" USING btree ("subscription_plan_id");--> statement-breakpoint
CREATE INDEX "idx_user_subscription_plans_status" ON "subscriptions"."user_subscription_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_user_subscription_plans_dodo_customer_id" ON "subscriptions"."user_subscription_plans" USING btree ("dodo_customer_id");--> statement-breakpoint
CREATE INDEX "idx_user_subscription_plans_period_end_date" ON "subscriptions"."user_subscription_plans" USING btree ("current_period_end_date");--> statement-breakpoint
ALTER TABLE "users"."users" ADD CONSTRAINT "users_dodo_customer_id_unique" UNIQUE("dodo_customer_id");