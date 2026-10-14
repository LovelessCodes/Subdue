CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`due_date` integer NOT NULL,
	`read_at` integer,
	`subscription_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscription`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_userId_subscriptionId_type_dueDate_uidx` ON `notification` (`user_id`,`subscription_id`,`type`,`due_date`);--> statement-breakpoint
CREATE INDEX `notification_userId_idx` ON `notification` (`user_id`);--> statement-breakpoint
ALTER TABLE `subscription` ADD `remind_days_before` integer;--> statement-breakpoint
ALTER TABLE `user_setting` ADD `remind_days_before` integer;