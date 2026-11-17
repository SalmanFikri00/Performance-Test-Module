import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = resolve(projectRoot, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(resolve(dataDir, 'bench.db'));
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = FULL');
db.pragma('busy_timeout = 30000');
db.exec(`
  CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

const insertLog = db.prepare(
  'INSERT INTO access_logs (user_id, action, created_at) VALUES (?, ?, ?)',
);
const countLogs = db.prepare('SELECT COUNT(*) AS total_rows FROM access_logs');
const app = Fastify({ logger: false });

app.get('/api/ping', async () => ({
  status: 'ok',
  runtime: 'node',
  uptime_ms: Math.floor(process.uptime() * 1000),
}));

app.post('/api/record', {
  schema: {
    body: {
      type: 'object',
      required: ['user_id', 'action'],
      additionalProperties: false,
      properties: {
        user_id: { type: 'string', minLength: 1 },
        action: { type: 'string', minLength: 1 },
      },
    },
  },
}, async (request) => {
  const { user_id, action } = request.body;
  insertLog.run(user_id, action, Math.floor(Date.now() / 1000));
  const { total_rows } = countLogs.get();
  return { status: 'recorded', total_rows };
});

const port = Number(process.env.PORT || 3000);
await app.listen({ host: '0.0.0.0', port });
console.log(`Node server listening on 0.0.0.0:${port}; SQLite: ${resolve(dataDir, 'bench.db')}`);
