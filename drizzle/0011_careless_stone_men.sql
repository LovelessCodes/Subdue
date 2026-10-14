ALTER TABLE `subscription` ADD `payment_method_id` text REFERENCES payment_method(id);--> statement-breakpoint
ALTER TABLE `subscription` ADD `url` text;--> statement-breakpoint
ALTER TABLE `subscription` ADD `auto_renew` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `subscription` ADD `cancelled_at` integer;--> statement-breakpoint
ALTER TABLE `subscription` ADD `logo` text;--> statement-breakpoint
CREATE INDEX `subscription_paymentMethodId_idx` ON `subscription` (`payment_method_id`);