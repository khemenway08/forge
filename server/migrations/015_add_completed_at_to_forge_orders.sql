ALTER TABLE forge_orders
    ADD COLUMN completed_at DATETIME(6) NULL AFTER cancelled_at,
    ADD INDEX idx_forge_orders_completed_at (completed_at);
