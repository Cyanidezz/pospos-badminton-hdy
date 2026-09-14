ALTER TABLE `products` ADD `scan_code` text;--> statement-breakpoint
ALTER TABLE `products` ADD `low_stock` integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO product_categories(name) VALUES ('ไม้แบดมินตัน'),('เอ็นแบดมินตัน'),('รองเท้า'),('เสื้อผ้า'),('กระเป๋า'),('อุปกรณ์เสริม');
--> statement-breakpoint
INSERT OR IGNORE INTO product_categories(name) SELECT DISTINCT category FROM products;
