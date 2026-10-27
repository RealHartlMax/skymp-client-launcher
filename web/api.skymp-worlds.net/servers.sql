-- SQL Schema for the SkyMP Master Server
-- This script defines the structure for the `servers` table.

--
-- Table structure for table `servers`
--

CREATE TABLE `servers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `ip` varchar(45) NOT NULL,
  `port` int(11) NOT NULL,
  `server_uid` varchar(128) DEFAULT NULL,
  `source` enum('dashboard','heartbeat') NOT NULL DEFAULT 'dashboard',
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `country_code` char(2) NOT NULL,
  `max_players` int(11) NOT NULL,
  `current_players` int(11) NOT NULL,
  `gamemode` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `api_key` varchar(255) NOT NULL,
  `last_heartbeat` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `server_uid` (`server_uid`),
  UNIQUE KEY `ip_port` (`ip`,`port`),
  UNIQUE KEY `api_key` (`api_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Notes:
-- - `id`: A unique identifier for each server entry.
-- - `name`: The public display name of the server.
-- - `ip`, `port`: The connection details for the game client. A unique constraint ensures no two servers can have the same address.
-- - `server_uid`: Optional stable server identifier provided by hosted server runtime.
-- - `source`: Tracks whether the row came from dashboard or direct heartbeat registration.
-- - `status`: Operational visibility state (`active`, `maintenance`, `draft`).
-- - `country_code`: ISO 3166-1 alpha-2 country code for filtering (e.g. `DE`, `US`).
-- - `max_players`, `current_players`: Player statistics.
-- - `gamemode`: Optional field to describe the server's gamemode.
-- - `notes`: Optional operations notes used by dashboard workflows.
-- - `api_key`: A unique key given to server owners to authenticate their heartbeat requests.
-- - `last_heartbeat`: Automatically updated timestamp to check if the server is still alive.
-- - `created_at`: Timestamp for when the server was first registered.
-- - `updated_at`: Timestamp for latest metadata/status change.
--
