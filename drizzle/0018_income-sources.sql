CREATE TABLE `income_source` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`cycle_unit` text NOT NULL,
	`cycle_count` integer NOT NULL,
	`next_arrival` integer NOT NULL,
	`archived_at` integer,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `incomeSource_userId_idx` ON `income_source` (`user_id`);