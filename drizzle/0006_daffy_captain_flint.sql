CREATE TABLE `stock_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`staff_id` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `items` ADD `line_discount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `active` integer DEFAULT 1 NOT NULL;