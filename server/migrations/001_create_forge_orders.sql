CREATE TABLE IF NOT EXISTS forge_orders (
    forge_order_uuid CHAR(36) NOT NULL,
    record_version VARCHAR(16) NOT NULL,
    source VARCHAR(64) NOT NULL,
    submitted_at DATETIME(6) NOT NULL,
    received_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    device_id VARCHAR(128) NULL,
    event_id VARCHAR(128) NULL,
    payload_json LONGTEXT NOT NULL,
    payload_sha256 CHAR(64) NOT NULL,
    PRIMARY KEY (forge_order_uuid),
    KEY idx_forge_orders_submitted_at (submitted_at),
    KEY idx_forge_orders_received_at (received_at),
    KEY idx_forge_orders_payload_sha256 (payload_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
