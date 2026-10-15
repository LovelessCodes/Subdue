ALTER TABLE `category` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `category` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `payment_method` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_method` ADD `archived_at` integer;