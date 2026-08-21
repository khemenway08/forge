CREATE TABLE IF NOT EXISTS forge_inventory_items (
    id CHAR(36) NOT NULL,
    subject_type VARCHAR(64) NOT NULL,
    subject_id CHAR(36) NOT NULL,
    on_hand_quantity INT UNSIGNED DEFAULT NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ux_forge_inventory_items_subject (subject_type, subject_id),
    KEY idx_forge_inventory_items_subject_id (subject_id),
    KEY idx_forge_inventory_items_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forge_inventory_movements (
    id CHAR(36) NOT NULL,
    inventory_item_id CHAR(36) NOT NULL,
    movement_type VARCHAR(32) NOT NULL,
    reason_code VARCHAR(32) NOT NULL,
    quantity_before INT UNSIGNED DEFAULT NULL,
    quantity_after INT UNSIGNED NOT NULL,
    quantity_delta INT DEFAULT NULL,
    note TEXT DEFAULT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_forge_inventory_movements_item_created (inventory_item_id, created_at),
    CONSTRAINT fk_forge_inventory_movements_item
        FOREIGN KEY (inventory_item_id) REFERENCES forge_inventory_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
