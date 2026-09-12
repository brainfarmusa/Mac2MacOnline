CREATE TABLE `business_record_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`comments` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
