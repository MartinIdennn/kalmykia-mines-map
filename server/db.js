import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, 'app.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS mines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    short TEXT,
    description TEXT,
    goal INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mine_id INTEGER NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
    url TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budget_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mine_id INTEGER NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mine_id INTEGER NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export default db;
