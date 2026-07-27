CREATE TABLE IF NOT EXISTS forge_order_cleanup_tombstones (
    forge_order_uuid CHAR(36) NOT NULL,
    deleted_at DATETIME(6) NOT NULL,
    PRIMARY KEY (forge_order_uuid),
    KEY idx_forge_order_cleanup_tombstones_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
