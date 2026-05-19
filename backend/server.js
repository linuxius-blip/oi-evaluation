// server.js — Open Innovation Self-Evaluation backend
// Receives anonymized response data from the frontend, stores it in Postgres,
// and exposes a token-protected export endpoint for analysis.

import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

// ─── Config ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const EXPORT_TOKEN = process.env.EXPORT_TOKEN; // long random string; set in Railway
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://linuxius-blip.github.io,http://localhost:8000,http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Aborting.');
  process.exit(1);
}
if (!EXPORT_TOKEN) {
  console.warn('⚠️  EXPORT_TOKEN is not set — export endpoints will reject all requests.');
}

// ─── Database ────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway's managed Postgres requires SSL but uses a self-signed chain
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS responses (
      id              SERIAL PRIMARY KEY,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      client_ts       TEXT,
      industry        TEXT,
      company_size    TEXT,
      score_sourcing  REAL,
      score_acquiring REAL,
      score_selling   REAL,
      score_revealing REAL,
      answers         JSONB
    )
  `);
  console.log('✅ Database initialised.');
}

// ─── App ─────────────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: (origin, cb) => {
    // Allow no-origin (curl, health checks) and explicitly allowed origins.
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    console.warn('CORS rejected origin:', origin);
    cb(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '32kb' }));

// Health check (for Railway's monitor)
app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/', (req, res) => {
  res.json({
    service: 'open-innovation-self-evaluation',
    endpoints: ['POST /responses', 'GET /responses (token)', 'GET /responses.csv (token)', 'GET /stats (token)']
  });
});

// ─── Ingest ──────────────────────────────────────────────────────────────
app.post('/responses', async (req, res) => {
  try {
    const { timestamp, industry, size, scores, answers } = req.body || {};

    if (!scores || typeof scores !== 'object') {
      return res.status(400).json({ error: 'scores object required' });
    }
    const { sourcing, acquiring, selling, revealing } = scores;
    const inRange = v => typeof v === 'number' && v >= 1 && v <= 5;
    if (![sourcing, acquiring, selling, revealing].every(inRange)) {
      return res.status(400).json({ error: 'each score must be a number in [1,5]' });
    }
    if (answers && typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers must be an object' });
    }

    await pool.query(
      `INSERT INTO responses
         (client_ts, industry, company_size, score_sourcing, score_acquiring, score_selling, score_revealing, answers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        typeof timestamp === 'string' ? timestamp.slice(0, 64) : null,
        typeof industry === 'string'  ? industry.slice(0, 128) : null,
        typeof size === 'string'      ? size.slice(0, 64) : null,
        sourcing, acquiring, selling, revealing,
        answers ?? null
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /responses error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// ─── Token-protected export endpoints ────────────────────────────────────
function requireToken(req, res, next) {
  const token = req.headers['x-export-token'] || req.query.token;
  if (!EXPORT_TOKEN || token !== EXPORT_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/responses', requireToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM responses ORDER BY created_at DESC');
    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error('GET /responses error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

app.get('/responses.csv', requireToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM responses ORDER BY created_at DESC');
    const headers = [
      'id','created_at','client_ts','industry','company_size',
      'score_sourcing','score_acquiring','score_selling','score_revealing','answers'
    ];
    const esc = v => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => esc(r[h])).join(','))
    ].join('\n');
    res.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="oi-responses.csv"');
    res.send(csv);
  } catch (err) {
    console.error('GET /responses.csv error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Quick aggregate stats — useful in class to show live medians
app.get('/stats', requireToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS n,
        ROUND(AVG(score_sourcing)::numeric, 2)  AS avg_sourcing,
        ROUND(AVG(score_acquiring)::numeric, 2) AS avg_acquiring,
        ROUND(AVG(score_selling)::numeric, 2)   AS avg_selling,
        ROUND(AVG(score_revealing)::numeric, 2) AS avg_revealing
      FROM responses
    `);
    const { rows: byIndustry } = await pool.query(`
      SELECT
        COALESCE(industry, '(none)') AS industry,
        COUNT(*)::int AS n,
        ROUND(AVG(score_sourcing)::numeric, 2)  AS avg_sourcing,
        ROUND(AVG(score_acquiring)::numeric, 2) AS avg_acquiring,
        ROUND(AVG(score_selling)::numeric, 2)   AS avg_selling,
        ROUND(AVG(score_revealing)::numeric, 2) AS avg_revealing
      FROM responses
      GROUP BY industry
      ORDER BY n DESC
    `);
    res.json({ overall: rows[0], by_industry: byIndustry });
  } catch (err) {
    console.error('GET /stats error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────
initDb()
  .then(() => app.listen(PORT, () => console.log(`✅ Server listening on :${PORT}`)))
  .catch(err => { console.error('Startup failed:', err); process.exit(1); });
