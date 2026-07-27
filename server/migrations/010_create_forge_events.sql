CREATE TABLE IF NOT EXISTS forge_events (
    event_id CHAR(36) NOT NULL,
    public_order_token CHAR(43) NOT NULL,
    event_name VARCHAR(190) NOT NULL,
    event_type ENUM('live_event', 'test_session') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    event_location VARCHAR(190) NULL,
    event_status ENUM('scheduled', 'active', 'ended') NOT NULL DEFAULT 'scheduled',
    started_at DATETIME(6) NULL,
    ended_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (event_id),
    UNIQUE KEY ux_forge_events_public_order_token (public_order_token),
    KEY idx_forge_events_status_dates (event_status, start_date, end_date),
    KEY idx_forge_events_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
