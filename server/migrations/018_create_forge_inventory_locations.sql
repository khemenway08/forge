ALTER TABLE forge_inventory_items
    ADD COLUMN tracking_mode VARCHAR(24) NOT NULL DEFAULT 'global' AFTER subject_id;

CREATE TABLE IF NOT EXISTS forge_inventory_locations (
    id CHAR(36) NOT NULL,
    location_code VARCHAR(64) NOT NULL,
    location_name VARCHAR(160) NOT NULL,
    location_type VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    notes TEXT DEFAULT NULL,
    sort_order BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ux_forge_inventory_locations_code (location_code),
    KEY idx_forge_inventory_locations_status_sort (status, sort_order, location_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forge_inventory_location_balances (
    id CHAR(36) NOT NULL,
    inventory_item_id CHAR(36) NOT NULL,
    inventory_location_id CHAR(36) NOT NULL,
    on_hand_quantity INT UNSIGNED DEFAULT NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ux_forge_inventory_location_balances_item_location (inventory_item_id, inventory_location_id),
    KEY idx_forge_inventory_location_balances_location (inventory_location_id),
    CONSTRAINT fk_forge_inventory_location_balances_item
        FOREIGN KEY (inventory_item_id) REFERENCES forge_inventory_items(id),
    CONSTRAINT fk_forge_inventory_location_balances_location
        FOREIGN KEY (inventory_location_id) REFERENCES forge_inventory_locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE forge_inventory_movements
    ADD COLUMN inventory_location_id CHAR(36) DEFAULT NULL AFTER inventory_item_id,
    ADD COLUMN transfer_id CHAR(36) DEFAULT NULL AFTER note,
    ADD KEY idx_forge_inventory_movements_item_location_created (inventory_item_id, inventory_location_id, created_at),
    ADD KEY idx_forge_inventory_movements_transfer (transfer_id),
    ADD CONSTRAINT fk_forge_inventory_movements_location
        FOREIGN KEY (inventory_location_id) REFERENCES forge_inventory_locations(id);

INSERT INTO forge_inventory_locations (
    id, location_code, location_name, location_type, status, notes, sort_order, created_at, updated_at
) VALUES (
    '00000000-0000-4000-8000-000000000018', 'hilltop_internal', 'Hilltop', 'internal', 'active', NULL, 1000, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
) ON DUPLICATE KEY UPDATE id = id;
