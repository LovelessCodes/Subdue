ALTER TABLE `income_source` ADD `start_date` integer;--> statement-breakpoint
-- Existing sources get "tracked since": the truthful floor is unknowable, and
-- this keeps their income counted exactly as before until edited.
UPDATE `income_source` SET `start_date` = `created_at`;
