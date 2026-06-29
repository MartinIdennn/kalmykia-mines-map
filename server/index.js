import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

// Раздача статики фронта
app.use(express.static(join(__dirname, '..', 'public')));

// Подготовленные запросы
const qMinesList = db.prepare(`
  SELECT m.id, m.name, m.lat, m.lng, m.short, m.goal,
         COALESCE((SELECT SUM(amount) FROM donations d WHERE d.mine_id = m.id), 0) AS raised
  FROM mines m
  ORDER BY m.id
`);

const qMine = db.prepare('SELECT id, name, lat, lng, description, goal FROM mines WHERE id = ?');
const qPhotos = db.prepare('SELECT url FROM photos WHERE mine_id = ? ORDER BY id');
const qBudget = db.prepare('SELECT item, amount FROM budget_items WHERE mine_id = ? ORDER BY id');
const qDonors = db.prepare(
  'SELECT name, amount, created_at AS at FROM donations WHERE mine_id = ? ORDER BY id DESC'
);
const qRaised = db.prepare(
  'SELECT COALESCE(SUM(amount), 0) AS raised FROM donations WHERE mine_id = ?'
);
const qInsertDonation = db.prepare(
  'INSERT INTO donations (mine_id, name, amount, created_at) VALUES (?, ?, ?, ?)'
);

// GET /api/mines
app.get('/api/mines', (req, res) => {
  const rows = qMinesList.all().map((r) => ({
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    short: r.short,
    raised: r.raised,
    goal: r.goal,
  }));
  res.json(rows);
});

// GET /api/mines/:id
app.get('/api/mines/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

  const mine = qMine.get(id);
  if (!mine) return res.status(404).json({ error: 'mine not found' });

  res.json({
    id: mine.id,
    name: mine.name,
    lat: mine.lat,
    lng: mine.lng,
    description: mine.description,
    photos: qPhotos.all(id).map((p) => p.url),
    budget: qBudget.all(id),
    goal: mine.goal,
    raised: qRaised.get(id).raised,
    donors: qDonors.all(id),
  });
});

// POST /api/mines/:id/donate
app.post('/api/mines/:id/donate', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

  const mine = qMine.get(id);
  if (!mine) return res.status(404).json({ error: 'mine not found' });

  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const amount = Number(body.amount);

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  qInsertDonation.run(id, name, Math.round(amount), at);

  const raised = qRaised.get(id).raised;
  res.json({ ok: true, raised, donor: { name, amount: Math.round(amount), at } });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
