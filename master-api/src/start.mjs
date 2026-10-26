import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createMaster } from './server.mjs';

const directory = resolve(process.env.DATA_DIR || 'data');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const secretPath = join(directory, 'master.key');
if (!existsSync(secretPath)) writeFileSync(secretPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
const publicUrl = process.env.PUBLIC_URL || `http://127.0.0.1:${port}`;
const origin = new URL(publicUrl);
if (origin.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw Error('PUBLIC_URL muss außerhalb lokaler Tests HTTPS verwenden.');
const app = createMaster({ database: join(directory, 'master.sqlite'), key: readFileSync(secretPath), publicUrl: origin.origin,
  allowPrivateResources: process.env.ALLOW_PRIVATE_RESOURCES === 'true', trustLoopbackProxy: process.env.TRUST_LOOPBACK_PROXY === 'true' });
app.server.listen(port, host, () => console.log(`SkyMP master: ${origin.origin}/account (no demo accounts)`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.server.close(() => { app.store.close(); process.exit(0); }));
