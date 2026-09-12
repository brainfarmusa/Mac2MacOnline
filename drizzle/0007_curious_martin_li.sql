CREATE TABLE `deal_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_number` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deal_photos_object_key_unique` ON `deal_photos` (`object_key`);