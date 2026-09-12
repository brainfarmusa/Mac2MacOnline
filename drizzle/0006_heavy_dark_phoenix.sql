CREATE TABLE `deal_summary_estimates` (
	`deal_id` text PRIMARY KEY NOT NULL,
	`deal_number` text NOT NULL,
	`proposed_amount` real DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
