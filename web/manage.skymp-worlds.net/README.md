# manage.skymp-worlds.net

Native online authentication now uses the same dashboard accounts and server ownership.
See [PHP hosting](../../docs/PHP_HOSTING.md). The API communicates with
`native-master.php` over HTTPS, so each subdomain can have an independent document root.
`game-login.php` confirms game sign-in; `server-connection.php` publishes download
addresses and shows the four settings for the actual server fork. No Node daemon is required.

Initial PHP scaffold for the server admin dashboard described in [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Included flows

- Email and OAuth-based admin login flow for production-oriented deployments
- Dashboard for creating, editing and deleting managed servers
- API key generation, rotation and revocation for heartbeat integration
- Local JSON storage that mirrors the server fields already used by `api.skymp-worlds.net`
- Discord OAuth start/callback stubs so the folder already has the expected auth entry points

## Important files

- `index.php`: routes authenticated users to the dashboard
- `login.php`: auth entry point for email and Discord OAuth
- `dashboard.php`: main server management UI
- `server-save.php`, `server-delete.php`, `api-key-rotate.php`, `api-key-revoke.php`: form handlers
- `includes/`: bootstrap, auth and storage helpers
- `storage/state.json`: local JSON persistence fallback

## Next production steps

- Replace JSON storage with MySQL tables shared with `api.skymp-worlds.net`
- Wire `oauth/discord-callback.php` to exchange the authorization code and map Discord users
- Move API key writes into the same persistence layer used by `heartbeat.php` and `list.php`
- Copy `config.php.example` to `config.php` before deploying secrets

## Email registration (PHPMailer)

This dashboard now includes an optional email registration + verification flow.

1. Install dependencies in this folder:

```bash
cd web/manage.skymp-worlds.net
composer install
```

2. Enable email auth in `config.php`:

- `MANAGE_EMAIL_REGISTRATION_ENABLED=true`
- `MANAGE_EMAIL_VERIFICATION_REQUIRED=false` (quick-start) or `true` (requires SMTP)

3. Configure SMTP values:

- `MANAGE_SMTP_HOST`
- `MANAGE_SMTP_PORT`
- `MANAGE_SMTP_ENCRYPTION` (`tls` or `ssl`)
- `MANAGE_SMTP_USERNAME`
- `MANAGE_SMTP_PASSWORD`
- `MANAGE_MAIL_FROM_ADDRESS`
- optional: `MANAGE_MAIL_FROM_NAME`, `MANAGE_MAIL_REPLY_TO`

4. Set `MANAGE_PUBLIC_URL` to the externally reachable dashboard URL so verification links resolve correctly.

## MySQL auth storage (users + verification tokens)

Email registration can now store accounts in MySQL (recommended for production) while server records stay in JSON until full migration.

1. Import schema:

```bash
mysql -u <user> -p <database> < web/manage.skymp-worlds.net/storage/mysql-schema.sql
```

2. Enable DB mode in `config.php`:

- `MANAGE_DB_ENABLED=true`
- `MANAGE_DB_HOST`
- `MANAGE_DB_PORT`
- `MANAGE_DB_NAME`
- `MANAGE_DB_USER`
- `MANAGE_DB_PASSWORD`
- optional: `MANAGE_DB_CHARSET=utf8mb4`

3. Keep `MANAGE_EMAIL_REGISTRATION_ENABLED=true` and SMTP configured.

4. Existing JSON users remain available only when DB mode is disabled.

### One-time user migration (JSON -> MySQL)

After enabling DB mode and importing schema, run:

```bash
php web/manage.skymp-worlds.net/tools/migrate-users-to-mysql.php
```

This migrates users from `storage/state.json` into `manage_users` and pending verification tokens into `manage_email_verification_tokens`.

### One-time server migration (JSON -> MySQL)

After users are present in MySQL, migrate server records:

```bash
php web/manage.skymp-worlds.net/tools/migrate-servers-to-mysql.php
```

This migrates `storage/state.json` server entries into `manage_servers`.

When DB mode is enabled, dashboard server CRUD uses MySQL with JSON fallback disabled for writes.
