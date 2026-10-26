# Discord for SkyMP Worlds

The launcher uses public Application ID `1496895150322876555` for optional activity status in the Discord desktop app. No OAuth link, bot token or client secret is required in the launcher. Settings → Game → Discord activity status offers Show, Hide details and Disabled. Disabled by default. Streamer mode hides server details even when status is enabled.

## Web sign-in and account linking

1. In the Discord Developer Portal, add exactly `https://manage.skymp-worlds.net/oauth/discord-callback.php` under the application's **OAuth2 → Redirects**.
2. Extract the new independent `manage.skymp-worlds.net.zip` into this subdomain's document root. Preserve existing `config.php`, database, `storage/` and service secrets.
3. Add or replace empty settings in private `config.php`: `MANAGE_DISCORD_CLIENT_ID` = `1496895150322876555`; `MANAGE_DISCORD_CLIENT_SECRET` = the portal secret; `MANAGE_DISCORD_REDIRECT_URI` = the callback URL above. Never put the secret in the launcher or public ZIPs, or send it in a message.
4. Use **Sign in with Discord**. For an existing password account, sign in normally first, then choose **Linked accounts → Link Discord**. Launcher Settings → Account opens this web flow.

The site generates its authorization URL with `identify email` and a single-use `state` valid for ten minutes. A copied fixed Discord URL without `state` is rejected. The code exchange happens exclusively on the PHP webhosting; access tokens are not stored. Game and Steam identities remain unchanged.

Matching email addresses are **never linked automatically**. Existing account owners sign in with their password before linking. New Discord accounts require a verified Discord email. Each Discord account belongs to exactly one SkyMP account.

JSON storage uses the same protected account file. With MySQL, `manage_oauth_accounts` is created on first use. If the database user lacks CREATE permission, import only that `CREATE TABLE IF NOT EXISTS` section from `storage/mysql-schema.sql`. Preserve existing tables and accounts. PHP requires outbound HTTPS with valid CA configuration, preferably cURL or alternatively HTTPS streams.

Local checks cover state expiry/replay, mocked Discord exchange, account creation/linking, email conflicts, CSRF and three languages. Actual Discord authorization and production MySQL still require validation after configuring the private secret.
