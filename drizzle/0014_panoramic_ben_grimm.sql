CREATE TABLE `export_compliance_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`company` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`destination_country` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `export_compliance_submissions_reference_unique` ON `export_compliance_submissions` (`reference`);