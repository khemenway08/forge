SET @forge_schema := DATABASE();

SET @has_forge_order_number := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @forge_schema
      AND TABLE_NAME = 'forge_orders'
      AND COLUMN_NAME = 'forge_order_number'
);

SET @forge_order_number_sql := IF(
    @has_forge_order_number = 0,
    'ALTER TABLE forge_orders ADD COLUMN forge_order_number INT UNSIGNED NULL AFTER forge_order_uuid',
    'SELECT 1'
);
PREPARE forge_order_number_stmt FROM @forge_order_number_sql;
EXECUTE forge_order_number_stmt;
DEALLOCATE PREPARE forge_order_number_stmt;

SET @has_forge_order_number_index := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @forge_schema
      AND TABLE_NAME = 'forge_orders'
      AND INDEX_NAME = 'ux_forge_orders_forge_order_number'
);

SET @forge_order_number_index_sql := IF(
    @has_forge_order_number_index = 0,
    'ALTER TABLE forge_orders ADD UNIQUE KEY ux_forge_orders_forge_order_number (forge_order_number)',
    'SELECT 1'
);
PREPARE forge_order_number_index_stmt FROM @forge_order_number_index_sql;
EXECUTE forge_order_number_index_stmt;
DEALLOCATE PREPARE forge_order_number_index_stmt;

CREATE TABLE IF NOT EXISTS forge_order_number_sequence (
    sequence_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (sequence_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=1001;
