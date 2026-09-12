CREATE TABLE `business_record_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`record_name` text DEFAULT '' NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_record_attachments_object_key_unique` ON `business_record_attachments` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `business_record_attachments_record_file_unique` ON `business_record_attachments` (`record_type`,`record_id`,`object_key`);