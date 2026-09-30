CREATE TABLE IF NOT EXISTS forge_order_artwork_files (
    artwork_file_id CHAR(36) NOT NULL,
    forge_order_uuid CHAR(36) NOT NULL,
    line_id VARCHAR(191) NOT NULL,
    registration_id CHAR(36) NOT NULL,
    product_definition_id VARCHAR(128) NOT NULL,
    variant_key VARCHAR(128) NOT NULL,
    configuration_revision BIGINT UNSIGNED NOT NULL,
    configuration_digest CHAR(64) NOT NULL,
    order_year SMALLINT UNSIGNED NOT NULL,
    customer_folder_name VARCHAR(255) NOT NULL,
    live_filename VARCHAR(255) NOT NULL,
    relative_live_path VARCHAR(768) NOT NULL,
    preparation_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    launcher_profile_label VARCHAR(128) NULL,
    master_sha256 CHAR(64) NULL,
    live_sha256 CHAR(64) NULL,
    prepared_at DATETIME(6) NULL,
    last_error_code VARCHAR(64) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (artwork_file_id),
    UNIQUE KEY ux_forge_order_artwork_line (forge_order_uuid, line_id),
    UNIQUE KEY ux_forge_order_artwork_path (relative_live_path),
    KEY idx_forge_order_artwork_status (preparation_status),
    CONSTRAINT fk_forge_order_artwork_order FOREIGN KEY (forge_order_uuid)
        REFERENCES forge_orders(forge_order_uuid) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_forge_order_artwork_registration FOREIGN KEY (registration_id)
        REFERENCES forge_artwork_template_registrations(registration_id) ON DELETE RESTRICT,
    CONSTRAINT chk_forge_order_artwork_status
        CHECK (preparation_status IN ('pending', 'prepared', 'failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forge_artwork_prepare_tokens (
    token_hash CHAR(64) NOT NULL,
    artwork_file_id CHAR(36) NOT NULL,
    configuration_revision BIGINT UNSIGNED NOT NULL,
    configuration_digest CHAR(64) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (token_hash),
    KEY idx_forge_artwork_prepare_tokens_expiry (expires_at),
    CONSTRAINT fk_forge_artwork_prepare_token_file FOREIGN KEY (artwork_file_id)
        REFERENCES forge_order_artwork_files(artwork_file_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forge_artwork_prepare_report_tokens (
    token_hash CHAR(64) NOT NULL,
    artwork_file_id CHAR(36) NOT NULL,
    configuration_revision BIGINT UNSIGNED NOT NULL,
    configuration_digest CHAR(64) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (token_hash),
    KEY idx_forge_artwork_prepare_report_expiry (expires_at),
    CONSTRAINT fk_forge_artwork_prepare_report_file FOREIGN KEY (artwork_file_id)
        REFERENCES forge_order_artwork_files(artwork_file_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
