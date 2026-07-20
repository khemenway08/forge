ALTER TABLE forge_orders
    ADD COLUMN production_status VARCHAR(32) NULL AFTER payload_sha256,
    ADD COLUMN current_tray_number INT UNSIGNED NULL AFTER production_status,
    ADD INDEX idx_forge_orders_production_status (production_status),
    ADD INDEX idx_forge_orders_current_tray_number (current_tray_number);

CREATE TABLE IF NOT EXISTS forge_production_trays (
    tray_number INT UNSIGNED NOT NULL,
    tray_status VARCHAR(32) NOT NULL,
    current_order_uuid CHAR(36) NULL,
    assigned_at DATETIME(6) NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (tray_number),
    KEY idx_forge_production_trays_status (tray_status),
    KEY idx_forge_production_trays_current_order_uuid (current_order_uuid),
    CONSTRAINT fk_forge_production_trays_current_order
        FOREIGN KEY (current_order_uuid) REFERENCES forge_orders (forge_order_uuid)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT chk_forge_production_trays_status
        CHECK (tray_status IN ('available', 'assigned', 'out_of_service'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forge_tray_assignment_history (
    tray_assignment_id CHAR(36) NOT NULL,
    tray_number INT UNSIGNED NOT NULL,
    forge_order_uuid CHAR(36) NOT NULL,
    assigned_at DATETIME(6) NOT NULL,
    released_at DATETIME(6) NULL,
    release_reason VARCHAR(64) NULL,
    PRIMARY KEY (tray_assignment_id),
    KEY idx_forge_tray_assignment_history_tray_number (tray_number),
    KEY idx_forge_tray_assignment_history_order_uuid (forge_order_uuid),
    KEY idx_forge_tray_assignment_history_released_at (released_at),
    CONSTRAINT fk_forge_tray_assignment_history_tray
        FOREIGN KEY (tray_number) REFERENCES forge_production_trays (tray_number)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_forge_tray_assignment_history_order
        FOREIGN KEY (forge_order_uuid) REFERENCES forge_orders (forge_order_uuid)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
