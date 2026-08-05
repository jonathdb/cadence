-- Fix: rename "order" column to order_index in program_day_items
-- The app code uses order_index but the original migration used "order"
ALTER TABLE program_day_items RENAME COLUMN "order" TO order_index;
