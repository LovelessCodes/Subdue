CREATE TABLE `cost_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `costSnapshot_userId_year_month_uidx` ON `cost_snapshot` (`user_id`,`year`,`month`);--> statement-breakpoint
CREATE INDEX `costSnapshot_userId_idx` ON `cost_snapshot` (`user_id`);