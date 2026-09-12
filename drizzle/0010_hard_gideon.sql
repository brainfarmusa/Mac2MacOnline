CREATE TABLE `business_record_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
