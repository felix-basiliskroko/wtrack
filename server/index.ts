import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

type VaultMetaRecord = {
  schemaVersion: number;
  kdf: unknown;
  wrappedKey: unknown;
  updatedAt: string;
};

type EncryptedVaultObject = {
  key: string;
  role: string;
  revision: number;
  nonce: string;
  ciphertext: string;
  aad: string;
  updatedAt?: string;
};

type EncryptedVaultBackup = {
  exportedAt: string;
  meta: VaultMetaRecord | null;
  objects: EncryptedVaultObject[];
};

type VaultObjectRow = {
  key: string;
  role: string;
  revision: number;
  nonce: string;
  ciphertext: string;
  aad: string;
  updated_at: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const configFile = process.env.WTRACK_CONFIG_FILE;

if (configFile && existsSync(configFile)) {
  process.loadEnvFile(configFile);
}

const dataDir = resolve(process.env.WTRACK_DATA_DIR ?? join(cwd, '.wtrack-data'));
const dbPath = resolve(process.env.WTRACK_DB_PATH ?? join(dataDir, 'wtrack.sqlite'));
const port = Number(process.env.PORT ?? process.env.WTRACK_PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const serverToken = process.env.WTRACK_SERVER_TOKEN ?? process.env.WTRACK_PASSWORD;
const isProduction = process.env.NODE_ENV === 'production';
const devToken = 'wtrack-local-dev';
const sessionTtlMs = 1000 * 60 * 60 * 24;
const maxEncryptedObjectChars = 64 * 1024 * 1024;
const backupDir = resolve(process.env.WTRACK_BACKUP_DIR ?? join(dataDir, 'backups'));
const maxBackups = 5;

mkdirSync(dataDir, { recursive: true });
mkdirSync(dirname(dbPath), { recursive: true });
mkdirSync(backupDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS vault_meta (
    id TEXT PRIMARY KEY CHECK (id = 'main'),
    schema_version INTEGER NOT NULL,
    kdf_json TEXT NOT NULL,
    wrapped_key_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vault_objects (
    key TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    revision INTEGER NOT NULL,
    nonce TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    aad TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

const app = Fastify({
  logger: false,
  bodyLimit: maxEncryptedObjectChars,
});

await app.register(cookie);

app.addHook('onRequest', async (_request, reply) => {
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  reply.header(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' http://127.0.0.1:8787 http://localhost:8787",
      "worker-src 'self' blob:",
    ].join('; '),
  );

  if (isProduction) {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

const nowIso = () => new Date().toISOString();
const sessionCookieName = 'wtrack.sid';

function getAcceptedToken() {
  if (serverToken) return serverToken;
  if (!isProduction) return devToken;
  return null;
}

function serializeObject(row: VaultObjectRow): EncryptedVaultObject {
  return {
    key: row.key,
    role: row.role,
    revision: row.revision,
    nonce: row.nonce,
    ciphertext: row.ciphertext,
    aad: row.aad,
    updatedAt: row.updated_at,
  };
}

function getSession(id: string | undefined) {
  if (!id) return null;
  const row = db
    .prepare('SELECT id, expires_at FROM sessions WHERE id = ?')
    .get(id) as { id: string; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  return row;
}

async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  const session = getSession(request.cookies[sessionCookieName]);
  if (!session) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}

function validateObject(object: Partial<EncryptedVaultObject>): asserts object is EncryptedVaultObject {
  const fields: Array<keyof EncryptedVaultObject> = ['key', 'role', 'revision', 'nonce', 'ciphertext', 'aad'];
  for (const field of fields) {
    if (object[field] === undefined || object[field] === null) {
      throw new Error(`Missing vault object field: ${field}`);
    }
  }
  const { key, role, revision } = object;
  if (typeof key !== 'string' || !/^[a-zA-Z0-9:._-]{1,96}$/.test(key)) {
    throw new Error('Invalid vault object key');
  }
  if (typeof role !== 'string' || !/^[a-zA-Z0-9:._-]{1,48}$/.test(role)) {
    throw new Error('Invalid vault object role');
  }
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    throw new Error('Invalid vault object revision');
  }
  for (const field of ['nonce', 'ciphertext', 'aad'] as const) {
    if (typeof object[field] !== 'string' || object[field].length > maxEncryptedObjectChars) {
      throw new Error(`Invalid vault object ${field}`);
    }
  }
}

const backupHash = (backup: EncryptedVaultBackup) =>
  createHash('sha256').update(JSON.stringify({ meta: backup.meta, objects: backup.objects })).digest('hex');

const backupTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

async function listBackups() {
  await fs.mkdir(backupDir, { recursive: true });
  const names = (await fs.readdir(backupDir)).filter((name) => name.endsWith('.json'));
  const entries = await Promise.all(
    names.map(async (name) => {
      const filePath = join(backupDir, name);
      const stat = await fs.stat(filePath);
      return { name, filePath, stat };
    }),
  );
  return entries.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}

async function readBackupStatus() {
  const backups = await listBackups();
  if (!backups.length) {
    return {
      available: true,
      lastBackupAt: null,
      latestHash: null,
      latestFilename: null,
      count: 0,
    };
  }

  const latest = backups[0];
  const parsed = JSON.parse(await fs.readFile(latest.filePath, 'utf8')) as EncryptedVaultBackup;
  return {
    available: true,
    lastBackupAt: parsed.exportedAt ?? latest.stat.mtime.toISOString(),
    latestHash: backupHash(parsed),
    latestFilename: latest.name,
    count: backups.length,
  };
}

function validateBackup(body: Partial<EncryptedVaultBackup> | null): asserts body is EncryptedVaultBackup {
  if (!body || typeof body.exportedAt !== 'string' || !body.meta || !Array.isArray(body.objects)) {
    throw new Error('invalid-encrypted-backup');
  }
  body.objects.forEach(validateObject);
}

async function writeEncryptedBackup(backup: EncryptedVaultBackup) {
  const currentStatus = await readBackupStatus();
  const nextHash = backupHash(backup);
  if (currentStatus.latestHash === nextHash) return currentStatus;

  await fs.mkdir(backupDir, { recursive: true });
  const filename = `wtrack-encrypted-backup-${backupTimestamp()}.json`;
  await fs.writeFile(join(backupDir, filename), JSON.stringify(backup, null, 2), 'utf8');

  const backups = await listBackups();
  await Promise.all(backups.slice(maxBackups).map((backupFile) => fs.unlink(backupFile.filePath)));
  return readBackupStatus();
}

app.get('/api/healthz', async () => ({
  ok: true,
  mode: serverToken ? 'configured' : isProduction ? 'missing-token' : 'dev-token',
}));

app.post('/api/session', async (request, reply) => {
  const body = request.body as { token?: string } | null;
  const acceptedToken = getAcceptedToken();
  if (!acceptedToken || body?.token !== acceptedToken) {
    reply.code(401).send({ error: 'invalid-token' });
    return;
  }

  const id = randomBytes(32).toString('base64url');
  const createdAt = Date.now();
  const expiresAt = createdAt + sessionTtlMs;
  db.prepare('INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)').run(id, createdAt, expiresAt);

  reply.setCookie(sessionCookieName, id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
    path: '/',
    maxAge: sessionTtlMs / 1000,
  });
  reply.send({ ok: true, devTokenHint: !serverToken && !isProduction ? devToken : undefined });
});

app.post('/api/session/logout', async (request, reply) => {
  const sid = request.cookies[sessionCookieName];
  if (sid) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
  }
  reply.clearCookie(sessionCookieName, { path: '/' });
  reply.send({ ok: true });
});

app.get('/api/vault/meta', { preHandler: requireSession }, async () => {
  const row = db.prepare('SELECT * FROM vault_meta WHERE id = ?').get('main') as
    | {
        schema_version: number;
        kdf_json: string;
        wrapped_key_json: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return { meta: null };
  return {
    meta: {
      schemaVersion: row.schema_version,
      kdf: JSON.parse(row.kdf_json),
      wrappedKey: JSON.parse(row.wrapped_key_json),
      updatedAt: row.updated_at,
    } satisfies VaultMetaRecord,
  };
});

app.put('/api/vault/meta', { preHandler: requireSession }, async (request, reply) => {
  const body = request.body as Partial<VaultMetaRecord> | null;
  if (!body || body.schemaVersion !== 1 || !body.kdf || !body.wrappedKey) {
    reply.code(400).send({ error: 'invalid-vault-meta' });
    return;
  }

  db.prepare(
    `
      INSERT INTO vault_meta (id, schema_version, kdf_json, wrapped_key_json, updated_at)
      VALUES ('main', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        schema_version = excluded.schema_version,
        kdf_json = excluded.kdf_json,
        wrapped_key_json = excluded.wrapped_key_json,
        updated_at = excluded.updated_at
    `,
  ).run(body.schemaVersion, JSON.stringify(body.kdf), JSON.stringify(body.wrappedKey), nowIso());

  reply.send({ ok: true });
});

app.get('/api/vault/objects', { preHandler: requireSession }, async (request) => {
  const query = request.query as { keys?: string };
  const keys = query.keys
    ?.split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  if (keys?.length) {
    const placeholders = keys.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT * FROM vault_objects WHERE key IN (${placeholders}) ORDER BY key`)
      .all(...keys) as VaultObjectRow[];
    return { objects: rows.map(serializeObject) };
  }

  const rows = db.prepare('SELECT * FROM vault_objects ORDER BY key').all() as VaultObjectRow[];
  return { objects: rows.map(serializeObject) };
});

app.put('/api/vault/objects', { preHandler: requireSession }, async (request, reply) => {
  const body = request.body as
    | { objects?: Array<Partial<EncryptedVaultObject>>; expectedRevisions?: Record<string, number> }
    | null;
  const objects = body?.objects ?? [];
  const expectedRevisions = body?.expectedRevisions ?? {};

  if (!Array.isArray(objects) || objects.length > 128) {
    reply.code(400).send({ error: 'invalid-vault-objects' });
    return;
  }

  try {
    for (const object of objects) validateObject(object);
  } catch (error) {
    reply.code(400).send({ error: error instanceof Error ? error.message : 'invalid-vault-object' });
    return;
  }
  const validObjects = objects as EncryptedVaultObject[];

  try {
    db.exec('BEGIN IMMEDIATE');
    for (const object of validObjects) {
      const current = db.prepare('SELECT revision FROM vault_objects WHERE key = ?').get(object.key) as
        | { revision: number }
        | undefined;
      const currentRevision = current?.revision ?? 0;
      const expectedRevision = expectedRevisions[object.key] ?? currentRevision;

      if (currentRevision !== expectedRevision) {
        db.exec('ROLLBACK');
        reply.code(409).send({
          error: 'revision-conflict',
          key: object.key,
          currentRevision,
          expectedRevision,
        });
        return;
      }
      if (object.revision !== expectedRevision + 1) {
        db.exec('ROLLBACK');
        reply.code(409).send({
          error: 'invalid-next-revision',
          key: object.key,
          currentRevision,
          objectRevision: object.revision,
        });
        return;
      }

      db.prepare(
        `
          INSERT INTO vault_objects (key, role, revision, nonce, ciphertext, aad, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            role = excluded.role,
            revision = excluded.revision,
            nonce = excluded.nonce,
            ciphertext = excluded.ciphertext,
            aad = excluded.aad,
            updated_at = excluded.updated_at
        `,
      ).run(object.key, object.role, object.revision, object.nonce, object.ciphertext, object.aad, nowIso());
    }
    db.exec('COMMIT');
    reply.send({ ok: true });
  } catch (error) {
    db.exec('ROLLBACK');
    reply.code(500).send({ error: error instanceof Error ? error.message : 'vault-write-failed' });
  }
});

app.get('/api/backups/status', { preHandler: requireSession }, async () => readBackupStatus());

app.post('/api/backups', { preHandler: requireSession }, async (request, reply) => {
  try {
    const body = request.body as Partial<EncryptedVaultBackup> | null;
    validateBackup(body);
    reply.send(await writeEncryptedBackup(body));
  } catch (error) {
    reply.code(400).send({ error: error instanceof Error ? error.message : 'invalid-encrypted-backup' });
  }
});

app.post('/api/import/raw', async (_request, reply) => {
  reply.code(410).send({
    error: 'raw-import-disabled',
    message: 'Apple Health exports must be parsed in the browser; the server accepts encrypted vault objects only.',
  });
});

const distDir = resolve(__dirname, '..', 'dist');
if (existsSync(distDir)) {
  await app.register(fastifyStatic, {
    root: distDir,
    wildcard: false,
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.sendFile('index.html');
  });
}

app.addHook('onClose', async () => {
  db.close();
});

app.listen({ port, host }).catch((error) => {
  console.error(error);
  process.exit(1);
});
