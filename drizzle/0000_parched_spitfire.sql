CREATE TABLE `internal_bids` (
	`id` text PRIMARY KEY NOT NULL,
	`internal_bid_number` text NOT NULL,
	`deal_number` text NOT NULL,
	`company` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`customer_notes` text DEFAULT '' NOT NULL,
	`line_items_json` text NOT NULL,
	`line_count` integer NOT NULL,
	`total_quantity` integer NOT NULL,
	`total_bid` real NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`submitted_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `internal_bids_internal_bid_number_unique` ON `internal_bids` (`internal_bid_number`);