ALTER TABLE forge_catalog_designs
    ADD COLUMN create_idempotency_key CHAR(36) NULL AFTER id,
    ADD COLUMN create_payload_sha256 CHAR(64) NULL AFTER create_idempotency_key,
    ADD UNIQUE KEY ux_forge_catalog_designs_create_idempotency_key (create_idempotency_key);
