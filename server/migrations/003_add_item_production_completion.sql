SET @forge_schema := DATABASE();

SET @has_ready_to_pack_at := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @forge_schema
      AND TABLE_NAME = 'forge_orders'
      AND COLUMN_NAME = 'ready_to_pack_at'
);

SET @ready_to_pack_at_sql := IF(
    @has_ready_to_pack_at = 0,
    'ALTER TABLE forge_orders ADD COLUMN ready_to_pack_at DATETIME(6) NULL AFTER current_tray_number',
    'SELECT 1'
);
PREPARE forge_ready_to_pack_at_stmt FROM @ready_to_pack_at_sql;
EXECUTE forge_ready_to_pack_at_stmt;
DEALLOCATE PREPARE forge_ready_to_pack_at_stmt;

CREATE TABLE IF NOT EXISTS forge_order_item_production (
    forge_order_uuid CHAR(36) NOT NULL,
    line_id VARCHAR(191) NOT NULL,
    required_quantity INT UNSIGNED NOT NULL,
    completed_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    production_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    completed_at DATETIME(6) NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (forge_order_uuid, line_id),
    KEY idx_forge_order_item_production_status (production_status),
    KEY idx_forge_order_item_production_completed_at (completed_at),
    CONSTRAINT fk_forge_order_item_production_order
        FOREIGN KEY (forge_order_uuid) REFERENCES forge_orders (forge_order_uuid)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT chk_forge_order_item_production_status
        CHECK (production_status IN ('pending', 'in_production', 'complete', 'blocked', 'cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
