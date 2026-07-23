ALTER TABLE forge_catalog_designs
    ADD COLUMN sort_order BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER notes,
    ADD KEY idx_forge_catalog_designs_sort_order (sort_order);

ALTER TABLE forge_catalog_hats
    ADD COLUMN sort_order BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER notes,
    ADD KEY idx_forge_catalog_hats_sort_order (sort_order);

ALTER TABLE forge_catalog_materials
    ADD COLUMN sort_order BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER image_height,
    ADD KEY idx_forge_catalog_materials_sort_order (sort_order);

ALTER TABLE forge_catalog_finished_hats
    ADD COLUMN sort_order BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER notes,
    ADD KEY idx_forge_catalog_finished_hats_sort_order (sort_order);

SET @forge_catalog_designs_sort_order := 0;
UPDATE forge_catalog_designs
SET sort_order = (@forge_catalog_designs_sort_order := @forge_catalog_designs_sort_order + 1000)
ORDER BY updated_at DESC, design_name ASC, id ASC;

SET @forge_catalog_hats_sort_order := 0;
UPDATE forge_catalog_hats
SET sort_order = (@forge_catalog_hats_sort_order := @forge_catalog_hats_sort_order + 1000)
ORDER BY updated_at DESC, hat_name ASC, id ASC;

SET @forge_catalog_materials_sort_order := 0;
UPDATE forge_catalog_materials
SET sort_order = (@forge_catalog_materials_sort_order := @forge_catalog_materials_sort_order + 1000)
ORDER BY updated_at DESC, material_name ASC, id ASC;

SET @forge_catalog_finished_hats_sort_order := 0;
UPDATE forge_catalog_finished_hats
SET sort_order = (@forge_catalog_finished_hats_sort_order := @forge_catalog_finished_hats_sort_order + 1000)
ORDER BY updated_at DESC, finished_hat_name ASC, id ASC;
