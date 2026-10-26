# Set up the developer portal on PHP webhosting

Updated 2026-10-25. Configuration steps after uploading the three domain ZIPs.

## Hosting responsibilities

| Component | Location |
| --- | --- |
| DEV | PHP webhosting: developer portal and private crash storage |
| API | PHP webhosting: launcher requests and forwarding reports to DEV |
| MANAGE | PHP webhosting: existing accounts and developer permissions |
| SkyMP game server | VPS: multiplayer and game/mod file delivery |

Use the **webhosting control panel and its file manager or FTP/SFTP access** for the steps below.
DEV/API/MANAGE require no VPS SSH session and no Node service. The VPS game server and its
server-settings.json are not changed to configure crash reports.

## 1. After the ZIP upload

Upload the updated DEV ZIP for protected reports storage. Existing configured API and MANAGE files can stay. Each domain has its own
independent document root. config.php and assets/ belong directly inside that root. DEV, API and
MANAGE below identify the relevant domain root, not new subdirectories under the main website.
Keep existing accounts, databases and configuration. Edit an existing define instead of defining it twice.
Insert additions inside the existing PHP block, before any closing PHP tag. All sites need HTTPS and
PHP 8.1+; API PHP also needs cURL.

## 2. Use the reports folder in the DEV webroot

Reports now go into **reports directly inside the dev.skymp-worlds.net document root**.
Set __DIR__ . '/reports' in config.php. __DIR__ resolves the absolute hosting path automatically;
/dev.skymp-worlds.net/reports may only be a virtual FTP path, not the PHP filesystem path.
Do not enter a domain URL. PHP creates year/month/day/report-ID directories automatically
and needs write access to reports. Upload reports/.htaccess and reports/index.php as well.

Every data file has a PHP guard and a .php suffix. Direct requests exit with empty HTTP 404;
Apache additionally denies access through .htaccess. Authenticated downloads return the original
JSON, log or dump bytes. PHP must also execute in subdirectories. Opening
https://dev.skymp-worlds.net/reports/ must return 403 or 404, never a directory listing.

An existing absolute private path outside all webroots can still be used unchanged.
Keep and back up old raw reports with index.json and report.key there; do not copy them directly
into public reports. Other public storage folders remain forbidden. Webhosting and the VPS
do not share a local directory.

## 3. Configure two different random secrets

Use at least 32 characters per secret, for example 64 random hexadecimal characters from a password
manager. Keep already configured matching values. The sign-in secret must match DEV_SSO_SECRET on
DEV and MANAGE_DEV_SSO_SECRET on MANAGE. The separate upload secret must match
DEV_CRASH_PROXY_TOKEN on DEV and API_CRASH_PROXY_TOKEN on API. These are not Steam or game-server keys.
SIGN_IN_SECRET and UPLOAD_SECRET below are explanatory placeholders, not usable secrets.

## 4. DEV: create or edit config.php

In the document root of dev.skymp-worlds.net, copy config.php.example to config.php if needed and edit:

```php
define('DEV_PUBLIC_URL', 'https://dev.skymp-worlds.net');
define('DEV_MANAGE_PUBLIC_URL', 'https://manage.skymp-worlds.net');
define('DEV_SSO_SECRET', 'SIGN_IN_SECRET');
define('DEV_CRASH_DIRECTORY', __DIR__ . '/reports');
define('DEV_CRASH_PROXY_TOKEN', 'UPLOAD_SECRET');
```

## 5. MANAGE: edit the existing config.php

```php
define('MANAGE_DEV_PUBLIC_URL', 'https://dev.skymp-worlds.net');
define('MANAGE_DEV_SSO_SECRET', 'SIGN_IN_SECRET');
define('MANAGE_CRASH_REPORT_ADMINS', ['YOUR_ACCOUNT_ID']);
```

Use the internal management account ID. Sign in to MANAGE and open
https://manage.skymp-worlds.net/crash-reports.php: its access-denied page shows your account ID.
Only explicitly listed IDs receive developer access. This is not an email or Steam ID.
Old MANAGE_CRASH_DIRECTORY/MANAGE_CRASH_PROXY_TOKEN settings apply to the previous management-local
receiver; DEV_CRASH_DIRECTORY/DEV_CRASH_PROXY_TOKEN apply to the dedicated portal.
MANAGE_CRASH_REPORT_ADMINS remains the current allowlist. Keep database, mail and account settings.

## 6. API: edit the existing config.php

```php
define('API_CRASH_PUBLIC_URL', 'https://dev.skymp-worlds.net');
define('API_CRASH_PROXY_TOKEN', 'UPLOAD_SECRET');
```

API_MANAGE_PUBLIC_URL stays https://manage.skymp-worlds.net for accounts/registry.
The launcher keeps submitting to https://api.skymp-worlds.net/crash-reports.php; API forwards over
HTTPS to https://dev.skymp-worlds.net/crash-ingest.php. No launcher or game-server rebuild is needed.

## 7. Verify in the browser

Open DEV and select **Sign in with SkyMP account**. Sign in with the existing authorized management
account; a signed single-use ticket is posted to DEV. Access lasts 15 minutes. Permission removal blocks
new sign-ins immediately and existing sessions within 15 minutes. Import report.json from a launcher
export; optionally select crash.dmp with separate consent. Retry does not duplicate the same report.
Check status changes, downloads and sign-out. Ordinary management users cannot access reports.

If setup is incomplete, DEV shows the missing settings individually: config.php, the SSO secret, web addresses or report storage. Open login.php?setup=1 to show the checks even after setup. These checks cannot detect mismatched secrets on other domains; matching pairs must be identical.
For management denial, check the account ID. For invalid sign-in, check matching SSO secrets, HTTPS
origins, cookies and private storage. For upload errors, check matching upload secrets, API_CRASH_PUBLIC_URL
and cURL. Do not include secrets in diagnostic excerpts.

## 8. Limits, storage and maintenance without SSH

UTC receipt time determines reports/year/month/day/report-ID. In the default folder, protected files are named index.json.php, report.key.php, report.json.php, contact.json.php, logs/*.log.php and attachments/crash.dmp.php. Downloads remove the PHP guard. An alternative private directory outside the webroot keeps the existing raw format. A local PC path cannot be read
by the website; explicitly upload selected files. In the launcher, report and dump submission need
separate approval. Enable dump capture **before** the next game launch; it cannot capture a terminated process.

Basis: 1 MiB maximum. Dump: 128 MiB maximum and the smallest hosting limit. Configure PHP settings
for both DEV and API in the hosting panel. An optional .user.ini is usable only when supported:

```ini
upload_max_filesize = 128M
post_max_size = 130M
max_execution_time = 180
max_input_time = 180
```

Provider-controlled extensions and limits require the host to enable them. Smaller dump limits do
not block the basis report. Apache uses the included .htaccess rules; Nginx needs equivalent provider
rules denying config.php, includes/ and setup/.

Use **Apply retention periods** in the report list. New basis uploads also apply retention.
No cron job is required to complete setup. Defaults: 2 GiB total, 10,000 reports, 20 new reports per
source/hour, 90 days for reports and 30 for dumps; configure DEV/config.php.
Optionally create a daily **PHP task in the webhosting panel** for tools/cleanup-crash-reports.php
inside the DEV root. Use the provider's script-path and PHP-version fields. This is not a VPS job;
the script rejects browser/URL access and runs only through PHP CLI via the hosting scheduler.

Keep the complete previous private directory including index.json/report.key when migrating.
Website ZIPs do not contain that data. On the same webhosting DEV may use the existing suitable
private report directory. Analyze dumps locally with matching PDB symbols. Real hosting paths,
PHP permissions, HTTPS and hosting limits must be configured in the provider panel.
