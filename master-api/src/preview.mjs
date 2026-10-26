import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createMaster } from './server.mjs';

const project = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export function attachWebPreview(app, origin) {
  const handler = app.server.listeners('request')[0];
  app.server.removeAllListeners('request');
  app.server.on('request', (request, response) => {
    const url = new URL(request.url, origin);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/account') || ['/health', '/list.php'].includes(url.pathname)) { handler(request, response); return; }
    const routes = [['/servers/', 'servers.skymp-worlds.net'], ['/updates/', 'update.skymp-worlds.net'], ['/', 'landing-page']];
    if (url.pathname === '/servers' || url.pathname === '/updates') { response.writeHead(302, { Location: url.pathname + '/' }); response.end(); return; }
    // The preview serves only explicitly public static files. PHP, secrets, databases and archives remain inaccessible.
    if (!['GET','HEAD'].includes(request.method) || !(/\.(html|css|js|jpg|png|svg|woff2|json)$/.test(url.pathname) || ['/', '/servers/', '/updates/'].includes(url.pathname))) { handler(request, response); return; }
    const [prefix, directory] = routes.find(([prefix]) => url.pathname.startsWith(prefix));
    const root = resolve(project, 'web', directory);
    let relative;
    try { relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html'; } catch { response.writeHead(400); response.end(); return; }
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404); response.end('Not found'); return; }
    const extension = extname(file);
    let data = readFileSync(file);
    if (['.html','.js','.css'].includes(extension)) {
      let content = data.toString('utf8');
      for (const [remote, local] of [['https://manage.skymp-worlds.net/index.php', '/account'], ['https://api.skymp-worlds.net', ''], ['https://servers.skymp-worlds.net', '/servers'], ['https://update.skymp-worlds.net', '/updates'], ['https://manage.skymp-worlds.net', '/account'], ['https://skymp-worlds.net', '']]) content = content.replaceAll(remote, origin + local);
      data = Buffer.from(content);
    }
    const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
    response.writeHead(200, { 'Content-Type': types[extension], 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : data);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(project, 'local-builds/web-preview');
  mkdirSync(directory, { recursive:true });
  const keyPath = join(directory,'master.key');
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { flag:'wx', mode:0o600 });
  const origin = `http://127.0.0.1:${Number(process.env.PORT || 8787)}`;
  const app = createMaster({ publicUrl:origin, siteUrl:origin, browserUrl:origin+'/servers/', database:join(directory,'master.sqlite'), key:readFileSync(keyPath), allowPrivateResources:true });
  attachWebPreview(app, origin);
  app.server.listen(new URL(origin).port, '127.0.0.1', () => console.log(`Local preview: ${origin}\nServer browser: ${origin}/servers/\nAccount & server registration: ${origin}/account\nNo demo accounts. Local database: ${directory}`));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>app.server.close(()=>{app.store.close();process.exit(0);}));
}
