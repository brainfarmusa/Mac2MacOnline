CREATE TABLE `deal_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`deal_number` text NOT NULL,
	`author_user_id` text NOT NULL,
	`author_email` text NOT NULL,
	`author_name` text NOT NULL,
	`author_initials` text NOT NULL,
	`comment` text NOT NULL,
	`created_at` text NOT NULL
);
