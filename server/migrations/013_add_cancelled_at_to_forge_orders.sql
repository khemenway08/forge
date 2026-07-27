ALTER TABLE forge_orders
    ADD COLUMN cancelled_at DATETIME(6) NULL AFTER ready_to_pack_at,
    ADD INDEX idx_forge_orders_cancelled_at (cancelled_at);
