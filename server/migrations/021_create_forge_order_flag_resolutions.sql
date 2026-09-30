CREATE TABLE IF NOT EXISTS forge_order_flag_resolutions (
    forge_order_uuid CHAR(36) NOT NULL,
    source_payload_sha256 CHAR(64) NOT NULL,
    flag_key CHAR(64) NOT NULL,
    flag_scope VARCHAR(16) NOT NULL,
    line_id VARCHAR(191) NULL,
    flag_code VARCHAR(64) NOT NULL,
    flag_message_sha256 CHAR(64) NOT NULL,
    resolved_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (forge_order_uuid, source_payload_sha256, flag_key),
    KEY idx_forge_order_flag_resolutions_order (forge_order_uuid),
    KEY idx_forge_order_flag_resolutions_resolved_at (resolved_at),
    CONSTRAINT fk_forge_order_flag_resolutions_order
        FOREIGN KEY (forge_order_uuid) REFERENCES forge_orders (forge_order_uuid)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT chk_forge_order_flag_resolutions_scope
        CHECK (flag_scope IN ('item', 'order'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
