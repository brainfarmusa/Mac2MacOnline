CREATE TABLE `bid_notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`bid_number` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`address1` text DEFAULT '' NOT NULL,
	`address2` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`country` text DEFAULT 'United States' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `internal_bid_customers` (
	`bid_id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text,
	`address1` text DEFAULT '' NOT NULL,
	`address2` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL
);
