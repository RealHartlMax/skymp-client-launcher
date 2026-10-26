# Configure crash reporting

Documentation reviewed **2026-10-26**, launcher **0.2.0**.

Reports now go to the independent developer portal
**dev.skymp-worlds.net**. The complete three-webroot setup, developer access,
private storage, hosting limits and maintenance are documented in
[DEV_PORTAL_SETUP.en.md](DEV_PORTAL_SETUP.en.md).

The launcher remains at **0.2.0** and keeps the same fixed API endpoint.
This web routing change does not require a launcher rebuild.

- Preview and approve the basis report in the crash dialog before sending.
- Enable optional dump capture before the next game launch; capture cannot
  recover the memory of a process that already terminated.
- Select an existing dump separately when exporting or uploading.
- If uploads are not configured, export locally and import the report on DEV later.
- Network failures retain previously approved local reports for retries.

The launcher does not bundle a rebuilt native game DLL. The thread-pool
source fix still needs its own native client build and updated runtime package.
Technical details: [CRASH_REPORTS.md](CRASH_REPORTS.md).

This setup concerns PHP webhosting or the listed launcher settings. Launcher, game-server and native runtime packages remain separate. [Documentation index](README.md) · [Launcher release](RELEASING.md).
