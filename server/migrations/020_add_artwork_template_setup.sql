ALTER TABLE forge_artwork_template_registrations
    ADD COLUMN resolution_config_json LONGTEXT NOT NULL AFTER allowed_variants_json;

CREATE TABLE IF NOT EXISTS forge_artwork_template_setup_tokens (
    token_hash CHAR(64) NOT NULL,
    registration_id CHAR(36) NOT NULL,
    configuration_revision BIGINT UNSIGNED NOT NULL,
    configuration_digest CHAR(64) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (token_hash),
    KEY idx_forge_artwork_setup_tokens_expiry (expires_at),
    CONSTRAINT fk_forge_artwork_setup_tokens_registration
        FOREIGN KEY (registration_id)
        REFERENCES forge_artwork_template_registrations(registration_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forge_artwork_template_report_tokens (
    token_hash CHAR(64) NOT NULL,
    registration_id CHAR(36) NOT NULL,
    configuration_revision BIGINT UNSIGNED NOT NULL,
    configuration_digest CHAR(64) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (token_hash),
    KEY idx_forge_artwork_report_tokens_expiry (expires_at),
    CONSTRAINT fk_forge_artwork_report_tokens_registration
        FOREIGN KEY (registration_id)
        REFERENCES forge_artwork_template_registrations(registration_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
