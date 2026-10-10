CREATE TYPE "public"."charge_channel" AS ENUM('UPI', 'card', 'NEFT', 'IMPS', 'auto-debit', 'other');--> statement-breakpoint
CREATE TYPE "public"."charge_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."charge_source" AS ENUM('hdfc_alert', 'vendor_receipt', 'manual');--> statement-breakpoint
CREATE TYPE "public"."subscription_cycle" AS ENUM('monthly', 'yearly', 'one-off');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'cancelled', 'paused');--> statement-breakpoint
CREATE TYPE "public"."upcoming_kind" AS ENUM('mandate_upcoming', 'manual');--> statement-breakpoint
CREATE TYPE "public"."upcoming_status" AS ENUM('pending', 'paid', 'declined', 'cancelled');--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor" text,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"charged_at" timestamp with time zone NOT NULL,
	"source" charge_source NOT NULL,
	"hdfc_message_id" text,
	"receipt_message_id" text,
	"invoice_number" text,
	"pdf_url" text,
	"channel" charge_channel,
	"payee_raw" text,
	"card_last4" char(4),
	"reference" text,
	"category" text,
	"direction" charge_direction DEFAULT 'debit' NOT NULL,
	"is_refunded" boolean DEFAULT false NOT NULL,
	"refund_of_charge_id" uuid,
	"subscription_id" uuid,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"notes" text,
	"merged_from" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charges_amount_positive" CHECK ("charges"."amount" > 0),
	CONSTRAINT "charges_currency_iso" CHECK ("charges"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "charges_card_last4_digits" CHECK ("charges"."card_last4" IS NULL OR "charges"."card_last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "charges_refund_not_self" CHECK ("charges"."refund_of_charge_id" IS NULL OR "charges"."refund_of_charge_id" <> "charges"."id")
);
--> statement-breakpoint
CREATE TABLE "month_notes" (
	"month" text PRIMARY KEY NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_notes_month_format" CHECK ("month_notes"."month" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor" text NOT NULL,
	"plan" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"cycle" "subscription_cycle" NOT NULL,
	"next_charge_date" date,
	"billing_url" text,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"started_at" date NOT NULL,
	"ended_at" date,
	"cancelled_on" date,
	"mandate_info" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_amount_nonnegative" CHECK ("subscriptions"."amount" >= 0),
	CONSTRAINT "subscriptions_currency_iso" CHECK ("subscriptions"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "upcoming_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"vendor" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"expected_date" date NOT NULL,
	"kind" "upcoming_kind" NOT NULL,
	"source_message_id" text,
	"status" "upcoming_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upcoming_events_amount_nonnegative" CHECK ("upcoming_events"."amount" >= 0),
	CONSTRAINT "upcoming_events_currency_iso" CHECK ("upcoming_events"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "vendor_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_pattern" text NOT NULL,
	"canonical_vendor" text NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_refund_of_charge_id_charges_id_fk" FOREIGN KEY ("refund_of_charge_id") REFERENCES "public"."charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upcoming_events" ADD CONSTRAINT "upcoming_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_hdfc_message_id_key" ON "charges" USING btree ("hdfc_message_id") WHERE "charges"."hdfc_message_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_receipt_message_id_key" ON "charges" USING btree ("receipt_message_id") WHERE "charges"."receipt_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "charges_charged_at_idx" ON "charges" USING btree ("charged_at");--> statement-breakpoint
CREATE INDEX "charges_vendor_idx" ON "charges" USING btree ("vendor");--> statement-breakpoint
CREATE INDEX "charges_needs_review_idx" ON "charges" USING btree ("needs_review") WHERE "charges"."needs_review";--> statement-breakpoint
CREATE INDEX "charges_dedup_idx" ON "charges" USING btree ("amount","currency","charged_at");--> statement-breakpoint
CREATE INDEX "charges_refund_of_idx" ON "charges" USING btree ("refund_of_charge_id");--> statement-breakpoint
CREATE INDEX "charges_subscription_idx" ON "charges" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_active_per_vendor_plan" ON "subscriptions" USING btree (lower("vendor"),lower("plan")) WHERE "subscriptions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "subscriptions_vendor_idx" ON "subscriptions" USING btree ("vendor");--> statement-breakpoint
CREATE INDEX "subscriptions_next_charge_idx" ON "subscriptions" USING btree ("next_charge_date");--> statement-breakpoint
CREATE UNIQUE INDEX "upcoming_events_source_message_id_key" ON "upcoming_events" USING btree ("source_message_id") WHERE "upcoming_events"."source_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "upcoming_events_expected_date_idx" ON "upcoming_events" USING btree ("expected_date");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_aliases_pattern_key" ON "vendor_aliases" USING btree (lower("raw_pattern"));