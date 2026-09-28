CREATE TABLE IF NOT EXISTS forge_artwork_template_registrations (
    registration_id CHAR(36) NOT NULL,
    product_definition_id VARCHAR(128) NOT NULL,
    family_id VARCHAR(128) NOT NULL,
    selector_type VARCHAR(32) NOT NULL,
    allowed_variants_json LONGTEXT NOT NULL,
    launcher_family_id VARCHAR(128) NOT NULL,
    artwork_label VARCHAR(255) NOT NULL,
    configuration_revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    configuration_digest CHAR(64) NOT NULL,
    registration_status VARCHAR(16) NOT NULL DEFAULT 'inactive',
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (registration_id),
    UNIQUE KEY ux_forge_artwork_templates_product (product_definition_id),
    UNIQUE KEY ux_forge_artwork_templates_family (family_id),
    UNIQUE KEY ux_forge_artwork_templates_launcher_family (launcher_family_id),
    KEY idx_forge_artwork_templates_status (registration_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forge_artwork_template_validations (
    registration_id CHAR(36) NOT NULL,
    variant_key VARCHAR(128) NOT NULL,
    validation_status VARCHAR(16) NOT NULL,
    validated_at DATETIME(6) NOT NULL,
    launcher_profile_label VARCHAR(128) NOT NULL,
    configuration_revision BIGINT UNSIGNED NOT NULL,
    configuration_digest CHAR(64) NOT NULL,
    validation_error_code VARCHAR(64) NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (registration_id, variant_key),
    KEY idx_forge_artwork_validations_status (validation_status),
    KEY idx_forge_artwork_validations_validated_at (validated_at),
    CONSTRAINT fk_forge_artwork_validations_registration
        FOREIGN KEY (registration_id)
        REFERENCES forge_artwork_template_registrations(registration_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
