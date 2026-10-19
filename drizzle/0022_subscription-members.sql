CREATE TABLE `subscription_member` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`user_id` text,
	`display_name` text NOT NULL,
	`email` text,
	`share_minor` integer NOT NULL,
	`status` text NOT NULL,
	`invite_hash` text,
	`invite_expires_at` integer,
	`category_id` text,
	`remind_enabled` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscription`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `subscriptionMember_subscriptionId_idx` ON `subscription_member` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `subscriptionMember_userId_idx` ON `subscription_member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptionMember_subscriptionId_userId_uidx` ON `subscription_member` (`subscription_id`,`user_id`) WHERE "subscription_member"."user_id" is not null;