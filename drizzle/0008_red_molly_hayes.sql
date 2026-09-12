CREATE TABLE `deal_box_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_number` text NOT NULL,
	`box_number` text NOT NULL,
	`control_number` text DEFAULT '' NOT NULL,
	`quantity` integer NOT NULL,
	`internal_bid_number` text NOT NULL,
	`company` text NOT NULL,
	`award_amount` real NOT NULL,
	`line_numbers_json` text DEFAULT '[]' NOT NULL,
	`awarded_by` text NOT NULL,
	`awarded_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deal_box_awards_deal_box_unique` ON `deal_box_awards` (`deal_number`,`box_number`);