import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

// Экспортирует все данные из SQLite в один статический JSON для GitHub Pages.
// Структура совпадает с тем, что раньше отдавал GET /api/mines/:id, плюс short
// для попапов. Донаты в онлайн-версии хранятся в localStorage браузера.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'data', 'mines.json');

const mines = db.prepare('SELECT id, name, lat, lng, short, description, goal FROM mines ORDER BY id').all();
const qPhotos = db.prepare('SELECT url FROM photos WHERE mine_id = ? ORDER BY id');
const qBudget = db.prepare('SELECT item, amount FROM budget_items WHERE mine_id = ? ORDER BY id');
const qDonors = db.prepare(
  'SELECT name, amount, created_at AS at FROM donations WHERE mine_id = ? ORDER BY id DESC'
);

const data = mines.map((m) => ({
  ...m,
  photos: qPhotos.all(m.id).map((p) => p.url),
  budget: qBudget.all(m.id),
  donors: qDonors.all(m.id),
}));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
console.log(`Экспортировано ${data.length} рудников → ${path.relative(process.cwd(), OUT)}`);
