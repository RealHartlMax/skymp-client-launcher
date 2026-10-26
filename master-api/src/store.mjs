import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const random = () => randomBytes(32).toString('hex');
export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const digest = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${digest.toString('hex')}`;
}
export async function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = (await passwordHash(password, salt)).split(':')[1];
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export class Store {
  constructor(path, key) {
    this.db = new DatabaseSync(path);
    this.key = key;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT NOT NULL, login TEXT NOT NULL UNIQUE, password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS servers(id TEXT PRIMARY KEY, owner INTEGER NOT NULL REFERENCES users(id), secret TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL, resource TEXT NOT NULL, runtime TEXT NOT NULL,
        players INTEGER NOT NULL DEFAULT 0, capacity INTEGER NOT NULL DEFAULT 100, mode TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', heartbeat INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY, user INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, server TEXT, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS handoffs(state TEXT PRIMARY KEY, token TEXT, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user);`);
    // Equal-cost verification also runs for unknown accounts.
    this.dummyPassword = passwordHash(random());
  }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  cleanup(now) {
    if ((this.lastCleanup || 0) + 30_000 > now) return;
    this.lastCleanup = now;
    for (const table of ['tokens', 'handoffs', 'limits']) this.run(`DELETE FROM ${table} WHERE expires < ?`, now);
  }
  limit(key, maximum, window, now) {
    const id = hash(key);
    this.run('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires < ? THEN 1 ELSE count+1 END, expires = CASE WHEN expires < ? THEN ? ELSE expires END', id, now + window, now, now, now + window);
    return this.get('SELECT count FROM limits WHERE key=?', id).count <= maximum;
  }
  issue(user, kind, lifetime, now, server = null) {
    const token = random();
    this.run('INSERT INTO tokens VALUES(?,?,?,?,?)', hash(token), user, kind, server, now + lifetime);
    return token;
  }
  token(token, kind, now) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
    return this.get('SELECT t.*,u.username FROM tokens t JOIN users u ON u.id=t.user WHERE t.hash=? AND t.kind=? AND t.expires>?', hash(token), kind, now);
  }
  seal(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  unseal(value) {
    const data = Buffer.from(value, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  }
  close() { this.db.close(); }
}
