-- Migration: Upgrade existing `servers` table to the current SkyMP Worlds schema
-- Date: 2026-04-23
-- Usage:
--   mysql -u <user> -p <database> < migrations/2026-04-23_servers_table_upgrade.sql

START TRANSACTION;

-- Ensure required columns exist.
ALTER TABLE `servers`
    ADD COLUMN IF NOT EXISTS `server_uid` varchar(128) DEFAULT NULL AFTER `port`,
    ADD COLUMN IF NOT EXISTS `source` enum('dashboard','heartbeat') NOT NULL DEFAULT 'dashboard' AFTER `server_uid`,
    ADD COLUMN IF NOT EXISTS `status` varchar(20) NOT NULL DEFAULT 'active' AFTER `source`,
    ADD COLUMN IF NOT EXISTS `country_code` char(2) NOT NULL DEFAULT 'ZZ' AFTER `status`,
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL AFTER `gamemode`,
    ADD COLUMN IF NOT EXISTS `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() AFTER `created_at`;

-- Ensure timestamps are in the expected shape.
ALTER TABLE `servers`
    MODIFY COLUMN `last_heartbeat` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT current_timestamp();

-- Normalize existing NULL country values for strict NOT NULL compatibility.
UPDATE `servers`
SET `country_code` = 'ZZ'
WHERE `country_code` IS NULL OR `country_code` = '';

-- Create missing unique indexes only if they do not already exist.
SET @idx_server_uid_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'servers'
      AND index_name = 'server_uid'
);
SET @sql := IF(@idx_server_uid_exists = 0,
    'ALTER TABLE `servers` ADD UNIQUE KEY `server_uid` (`server_uid`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_ip_port_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'servers'
      AND index_name = 'ip_port'
);
SET @sql := IF(@idx_ip_port_exists = 0,
    'ALTER TABLE `servers` ADD UNIQUE KEY `ip_port` (`ip`,`port`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_api_key_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'servers'
      AND index_name = 'api_key'
);
SET @sql := IF(@idx_api_key_exists = 0,
    'ALTER TABLE `servers` ADD UNIQUE KEY `api_key` (`api_key`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;
