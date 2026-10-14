CREATE TABLE `user_setting` (
	`id` text PRIMARY KEY NOT NULL,
	`currency` text,
	`locale` text,
	`week_start` text,
	`theme` text,
	`user_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_setting_user_id_unique` ON `user_setting` (`user_id`);