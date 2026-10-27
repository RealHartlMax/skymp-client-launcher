# SkyMP Worlds Developer Portal – PHP webhosting

DEV, API and MANAGE run on the PHP webhosting account. Only the game server runs on the VPS.

After uploading the three independent domain ZIPs, configure each domain-root config.php, the two service secrets, explicit management account IDs and the protected reports/ folder in the DEV webroot. No VPS SSH or game-server configuration change is required.

Included setup guides: [Deutsch](setup/SETUP.de.md), [English](setup/SETUP.en.md), [Русский](setup/SETUP.ru.md). They describe hosting-panel/file-manager setup after upload, with optional panel-based PHP scheduling; use the report-list cleanup button if no scheduler is available.

Keep existing private configuration and accounts. Upload stays disabled until configured. No credentials, user reports, dumps or symbols are included.

Default DEV storage: `define('DEV_CRASH_DIRECTORY', __DIR__ . '/reports');`. This is a filesystem directory, not the upload URL. PHP creates UTC year/month/day/report-ID folders. Data files have PHP guards; authenticated downloads return their original format. Existing private storage outside webroots remains supported. Visit `login.php?setup=1` for per-setting checks. Preserve config.php and reports/ data when updating.
