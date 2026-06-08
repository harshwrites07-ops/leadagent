/**
 * Turso sync — keeps master_leads persistent across Railway deploys.
 * Uses Turso HTTP API directly (no new npm deps, just axios).
 *
 * On startup:  pullFromTurso() → restores master_leads from cloud into local SQLite
 * After seed:  pushToTurso(leads) → pushes new leads up to Turso cloud
 */

const axios = require('axios');

function getCfg() {
  const url = (process.env.TURSO_DATABASE_URL || '').trim();
  const token = (process.env.TURSO_AUTH_TOKEN || '').trim();
  if (!url || !token) return null;
  // Convert libsql:// → https:// for HTTP API
  return { base: url.replace(/^libsql:\/\//, 'https://'), token };
}

function toArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? { type: 'integer', value: String(v) }
      : { type: 'float', value: String(v) };
  }
  return { type: 'text', value: String(v) };
}

async function tursoExec(cfg, sql, args = []) {
  const { data } = await axios.post(
    `${cfg.base}/v2/pipeline`,
    {
      requests: [
        { type: 'execute', stmt: { sql, args: args.map(toArg) } },
        { type: 'close' },
      ],
    },
    {
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );
  return data.results?.[0]?.response?.result;
}

async function tursoExecBatch(cfg, stmts) {
  const requests = [
    ...stmts.map(s => ({ type: 'execute', stmt: { sql: s.sql, args: (s.args || []).map(toArg) } })),
    { type: 'close' },
  ];
  const { data } = await axios.post(
    `${cfg.base}/v2/pipeline`,
    { requests },
    {
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    }
  );
  return data.results;
}

// Ensure master_leads table exists in Turso
async function ensureSchema(cfg) {
  await tursoExec(cfg, `
    CREATE TABLE IF NOT EXISTS master_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT UNIQUE NOT NULL,
      channel_name TEXT NOT NULL,
      channel_handle TEXT,
      subscriber_count INTEGER DEFAULT 0,
      avg_views REAL DEFAULT 0,
      email TEXT,
      website TEXT,
      niche TEXT,
      channel_description TEXT,
      lead_score INTEGER DEFAULT 0,
      temperature TEXT DEFAULT 'cold',
      country TEXT,
      scraped_at DATETIME DEFAULT (datetime('now'))
    )
  `);
}

/**
 * On startup: download all master_leads from Turso → insert into local SQLite.
 * Returns number of leads restored.
 */
async function pullFromTurso() {
  const cfg = getCfg();
  if (!cfg) {
    console.log('[Turso] No credentials configured — skipping restore');
    return 0;
  }

  try {
    await ensureSchema(cfg);

    const { getDb } = require('../models/database');
    const db = getDb();

    const localCount = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c;
    console.log(`[Turso] Pull starting — local DB has ${localCount} leads`);

    const INSERT = db.prepare(`
      INSERT OR IGNORE INTO master_leads
        (channel_id, channel_name, channel_handle, subscriber_count, avg_views,
         email, website, channel_description, lead_score, temperature, country, niche)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    let offset = 0;
    const batchSize = 500;
    let totalRestored = 0;

    while (true) {
      const result = await tursoExec(
        cfg,
        `SELECT channel_id, channel_name, channel_handle, subscriber_count, avg_views,
                email, website, channel_description, lead_score, temperature, country, niche
         FROM master_leads WHERE email IS NOT NULL AND email != '' LIMIT ? OFFSET ?`,
        [batchSize, offset]
      );

      const cols = (result?.cols || []).map(c => c.name);
      const rows = result?.rows || [];
      if (!rows.length) break;

      const insertBatch = db.transaction(rows => {
        let n = 0;
        for (const row of rows) {
          const r = {};
          cols.forEach((col, i) => { r[col] = row[i]?.value ?? null; });
          try {
            const res = INSERT.run(
              r.channel_id, r.channel_name, r.channel_handle,
              Number(r.subscriber_count) || 0, Number(r.avg_views) || 0,
              r.email, r.website, r.channel_description,
              Number(r.lead_score) || 0, r.temperature, r.country, r.niche
            );
            if (res.changes > 0) n++;
          } catch {}
        }
        return n;
      });

      totalRestored += insertBatch(rows);
      offset += rows.length;
      if (rows.length < batchSize) break;
    }

    const newTotal = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c;
    console.log(`[Turso] Pull complete — restored ${totalRestored} leads | local DB now has ${newTotal}`);
    return totalRestored;
  } catch (e) {
    console.error('[Turso] Pull error:', e.message);
    return 0;
  }
}

/**
 * After seeder cycle: push new leads array up to Turso.
 * Accepts array of lead objects with channel_id, email, etc.
 */
async function pushToTurso(leads) {
  const cfg = getCfg();
  if (!cfg || !leads.length) return 0;

  try {
    await ensureSchema(cfg);

    const BATCH = 50;
    let pushed = 0;

    for (let i = 0; i < leads.length; i += BATCH) {
      const batch = leads.slice(i, i + BATCH);
      const stmts = batch.map(l => ({
        sql: `INSERT OR IGNORE INTO master_leads
                (channel_id, channel_name, channel_handle, subscriber_count, avg_views,
                 email, website, channel_description, lead_score, temperature, country, niche)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          l.channel_id, l.channel_name, l.channel_handle || null,
          l.subscriber_count || 0, l.avg_views || 0,
          l.email, l.website || null,
          (l.channel_description || '').substring(0, 400),
          l.lead_score || 0, l.temperature || 'cold',
          l.country || null, l.niche || null,
        ],
      }));

      await tursoExecBatch(cfg, stmts);
      pushed += batch.length;
    }

    console.log(`[Turso] Pushed ${pushed} leads to cloud`);
    return pushed;
  } catch (e) {
    console.error('[Turso] Push error:', e.message);
    return 0;
  }
}

module.exports = { pullFromTurso, pushToTurso, getCfg };
