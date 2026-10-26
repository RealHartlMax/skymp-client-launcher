# SkyMP Worlds Auth Master

This is the optional Node reference implementation. The current PHP-only hosting uses
the existing dashboard accounts through the [PHP master](../docs/PHP_HOSTING.md).
No Node service is required there. These Node reference accounts are separate and
are not part of the PHP upload archives.

Online accounts, native heartbeats and server-scoped play sessions for this SkyMP
fork. Requires Node.js 24+, uses SQLite and Node standard libraries. No npm dependencies
or demo accounts.

```powershell
npm test
npm run preview
```

Open `http://127.0.0.1:8787/account`, create your account and register a server.
For standalone hosting, copy `.env.example` to `.env`, configure your HTTPS origin
and start `npm start` behind your reverse proxy.

See [local setup and hosting](../docs/LOCAL_AND_LIVE.md) for exact server/launcher
configuration, supported routes, protocol compatibility and packaging.
The legacy `login-discord` route name is retained for wire compatibility; this
master uses username/password accounts. Discord OAuth and guild verification are
not configured by this service.
