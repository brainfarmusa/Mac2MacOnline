CREATE TABLE `business_company_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`billing_address1` text DEFAULT '' NOT NULL,
	`billing_address2` text DEFAULT '' NOT NULL,
	`billing_city` text DEFAULT '' NOT NULL,
	`billing_region` text DEFAULT '' NOT NULL,
	`billing_postal_code` text DEFAULT '' NOT NULL,
	`billing_country` text DEFAULT 'United States' NOT NULL,
	`shipping_same_as_billing` integer DEFAULT true NOT NULL,
	`shipping_address1` text DEFAULT '' NOT NULL,
	`shipping_address2` text DEFAULT '' NOT NULL,
	`shipping_city` text DEFAULT '' NOT NULL,
	`shipping_region` text DEFAULT '' NOT NULL,
	`shipping_postal_code` text DEFAULT '' NOT NULL,
	`shipping_country` text DEFAULT 'United States' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_company_addresses_record_unique` ON `business_company_addresses` (`record_type`,`record_id`);--> statement-breakpoint
CREATE TABLE `business_company_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`contact_name` text NOT NULL,
	`job_title` text DEFAULT '' NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_company_contacts_record_email_unique` ON `business_company_contacts` (`record_type`,`record_id`,`email`);