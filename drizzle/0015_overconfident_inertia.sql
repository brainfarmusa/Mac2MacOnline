CREATE TABLE `r2_processing_deals` (
	`id` text PRIMARY KEY NOT NULL,
	`po_number` text NOT NULL,
	`customer` text NOT NULL,
	`location_status` text DEFAULT 'inbound' NOT NULL,
	`status` text DEFAULT 'in_process' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `r2_processing_items` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`serial_number` text NOT NULL,
	`technician` text NOT NULL,
	`model_sku` text DEFAULT '' NOT NULL,
	`tech_data_json` text DEFAULT '{}' NOT NULL,
	`bitraser_report_id` text DEFAULT '' NOT NULL,
	`bitraser_data_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'testing' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `r2_processing_items_serial_number_unique` ON `r2_processing_items` (`serial_number`);