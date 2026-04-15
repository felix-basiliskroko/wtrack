import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const BACKUP_DIR = path.resolve(__dirname, 'backup');
const MAX_BACKUPS = 5;

const createTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const json = (res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }, status: number, body: unknown) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const readBody = async (req: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const listBackups = async () => {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const names = (await fs.readdir(BACKUP_DIR)).filter((name) => name.endsWith('.json'));
  const entries = await Promise.all(
    names.map(async (name) => {
      const filePath = path.join(BACKUP_DIR, name);
      const stat = await fs.stat(filePath);
      return { name, filePath, stat };
    }),
  );
  return entries.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
};

const hashPayload = (payload: unknown) =>
  createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const readStatus = async () => {
  const files = await listBackups();
  if (!files.length) {
    return {
      available: true,
      lastBackupAt: null,
      latestHash: null,
      latestFilename: null,
      count: 0,
    };
  }

  const latest = files[0];
  const raw = await fs.readFile(latest.filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    available: true,
    lastBackupAt: parsed.lastUpdated ?? latest.stat.mtime.toISOString(),
    latestHash: hashPayload({ ...parsed, lastUpdated: '' }),
    latestFilename: latest.name,
    count: files.length,
  };
};

const writeBackup = async (payload: Record<string, unknown>) => {
  const normalized = { ...payload, lastUpdated: new Date().toISOString() };
  const status = await readStatus();
  const nextHash = hashPayload({ ...normalized, lastUpdated: '' });

  if (status.latestHash === nextHash) {
    return status;
  }

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const filename = `backup_currentdata_${createTimestamp()}.json`;
  await fs.writeFile(path.join(BACKUP_DIR, filename), JSON.stringify(normalized, null, 2), 'utf8');

  const files = await listBackups();
  await Promise.all(files.slice(MAX_BACKUPS).map((file) => fs.unlink(file.filePath)));

  return readStatus();
};

const backupPlugin = (): Plugin => {
  const handler = async (
    req: { method?: string; url?: string } & NodeJS.ReadableStream,
    res: { setHeader: (name: string, value: string) => void; end: (body: string) => void },
    next: () => void,
  ) => {
    if (req.method === 'GET' && req.url === '/status') {
      json(res, 200, await readStatus());
      return;
    }

    if (req.method === 'POST' && (req.url === '/' || req.url === '')) {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as Record<string, unknown>;
        json(res, 200, await writeBackup(payload));
      } catch (error) {
        json(res, 400, { error: 'Invalid backup payload' });
      }
      return;
    }

    next();
  };

  return {
    name: 'wtrack-backups',
    configureServer(server) {
      server.middlewares.use('/api/backups', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/backups', handler);
    },
  };
};

export default defineConfig({
  plugins: [react(), backupPlugin()],
  server: {
    allowedHosts: ['nanuq.tail12e6ef.ts.net'],
  },
});
