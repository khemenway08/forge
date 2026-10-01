CREATE TABLE IF NOT EXISTS forge_artwork_proofs (
    proof_id CHAR(36) NOT NULL,
    artwork_file_id CHAR(36) NOT NULL,
    preview_revision INT UNSIGNED NOT NULL DEFAULT 0,
    preview_status VARCHAR(32) NOT NULL DEFAULT 'not_generated',
    source_live_sha256 CHAR(64) NULL,
    preview_sha256 CHAR(64) NULL,
    preview_mime_type VARCHAR(32) NULL,
    preview_width INT UNSIGNED NULL,
    preview_height INT UNSIGNED NULL,
    preview_bytes MEDIUMBLOB NULL,
    rendered_at DATETIME(6) NULL,
    renderer_profile_label VARCHAR(128) NULL,
    proof_status VARCHAR(32) NOT NULL DEFAULT 'waiting_for_proof',
    correction_note VARCHAR(1000) NULL,
    decided_at DATETIME(6) NULL,
    decided_by VARCHAR(128) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (proof_id),
    UNIQUE KEY ux_forge_artwork_proof_file (artwork_file_id),
    KEY idx_forge_artwork_proof_status (proof_status, updated_at),
    CONSTRAINT fk_forge_artwork_proof_file FOREIGN KEY (artwork_file_id)
        REFERENCES forge_order_artwork_files(artwork_file_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forge_artwork_proof_events (
    proof_event_id CHAR(36) NOT NULL,
    proof_id CHAR(36) NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    preview_revision INT UNSIGNED NOT NULL,
    note VARCHAR(1000) NULL,
    staff_identity VARCHAR(128) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (proof_event_id),
    KEY idx_forge_artwork_proof_event_history (proof_id, created_at),
    CONSTRAINT fk_forge_artwork_proof_event FOREIGN KEY (proof_id)
        REFERENCES forge_artwork_proofs(proof_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forge_artwork_proof_tokens (
    token_hash CHAR(64) NOT NULL,
    token_type VARCHAR(16) NOT NULL,
    artwork_file_id CHAR(36) NOT NULL,
    expected_preview_revision INT UNSIGNED NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (token_hash),
    KEY idx_forge_artwork_proof_token_expiry (expires_at),
    CONSTRAINT fk_forge_artwork_proof_token_file FOREIGN KEY (artwork_file_id)
        REFERENCES forge_order_artwork_files(artwork_file_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
