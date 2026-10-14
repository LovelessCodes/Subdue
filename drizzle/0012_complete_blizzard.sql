CREATE TABLE `social_provider` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_provider_provider_unique` ON `social_provider` (`provider`);