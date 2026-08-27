CREATE TABLE `marketing_conversions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_name` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`referrer` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `marketing_conversions_event_name_idx` ON `marketing_conversions` (`event_name`);
--> statement-breakpoint
CREATE INDEX `marketing_conversions_created_at_idx` ON `marketing_conversions` (`created_at`);
