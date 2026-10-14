CREATE TABLE `exchange_rate` (
	`id` text PRIMARY KEY NOT NULL,
	`quote` text NOT NULL,
	`rate` integer NOT NULL,
	`rate_date` integer NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rate_quote_unique` ON `exchange_rate` (`quote`);