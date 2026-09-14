CREATE TABLE `config` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`show_earnings` integer DEFAULT 0 NOT NULL,
	`shop` text DEFAULT 'Badminton Shop' NOT NULL,
	`line_oa` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`mime` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`qty` integer NOT NULL,
	`price` integer NOT NULL,
	`original` integer NOT NULL,
	`net` integer NOT NULL,
	`cost` integer,
	`note` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `items_sale` ON `items` (`sale_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`customer` text NOT NULL,
	`phone` text NOT NULL,
	`racket` text NOT NULL,
	`product_id` text NOT NULL,
	`tension` text NOT NULL,
	`condition` text NOT NULL,
	`note` text NOT NULL,
	`photos` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`staff_id` text NOT NULL,
	`stringer_id` text NOT NULL,
	`created` text NOT NULL,
	`completed` text,
	`returned` text,
	`line_user` text,
	`notify` text DEFAULT 'ยังไม่เชื่อม LINE' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_token_unique` ON `jobs` (`token`);--> statement-breakpoint
CREATE TABLE `leaves` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`type` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`action` text NOT NULL,
	`created` text NOT NULL,
	`valid` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`barcode` text NOT NULL,
	`category` text NOT NULL,
	`price` integer NOT NULL,
	`cost` integer,
	`stock` integer DEFAULT 0 NOT NULL,
	`unit` text DEFAULT 'ชิ้น' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_barcode_unique` ON `products` (`barcode`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`qty` integer NOT NULL,
	`cost` integer,
	`staff_id` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`created` text NOT NULL,
	`total` integer NOT NULL,
	`discount` integer NOT NULL,
	`method` text NOT NULL,
	`slip` text,
	`job_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_job_id_unique` ON `sales` (`job_id`);