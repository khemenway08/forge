SET @forge_has_internal_note_column := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'forge_orders'
      AND COLUMN_NAME = 'internal_note'
);

SET @forge_add_internal_note_column_sql := IF(
    @forge_has_internal_note_column = 0,
    'ALTER TABLE forge_orders ADD COLUMN internal_note TEXT NULL AFTER event_id',
    'SELECT 1'
);

PREPARE forge_add_internal_note_column_stmt FROM @forge_add_internal_note_column_sql;
EXECUTE forge_add_internal_note_column_stmt;
DEALLOCATE PREPARE forge_add_internal_note_column_stmt;
