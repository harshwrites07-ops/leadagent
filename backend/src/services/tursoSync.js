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

async function ensureLeadsSchema(cfg) {
  await tursoExec(cfg, `
    CREATE TABLE IF NOT EXISTS user_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT UNIQUE,
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
      crm_stage TEXT DEFAULT 'new_lead',
      country TEXT,
      platform TEXT DEFAULT 'youtube',
      thumbnail_url TEXT,
      social_links TEXT DEFAULT '{}',
      pain_points TEXT DEFAULT '[]',
      scrape_source TEXT DEFAULT 'youtube_api',
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);
}

async function pushUserLeadsToTurso(db) {
  const cfg = getCfg();
  if (!cfg) return 0;
  try {
    await ensureLeadsSchema(cfg);
    const leads = db.prepare(`SELECT * FROM leads WHERE email IS NOT NULL AND email != ''`).all();
    if (!leads.length) return 0;
    const BATCH = 50;
    let pushed = 0;
    for (let i = 0; i < leads.length; i += BATCH) {
      const batch = leads.slice(i, i + BATCH);
      const stmts = batch.map(l => ({
        sql: `INSERT OR IGNORE INTO user_leads
                (channel_id, channel_name, channel_handle, subscriber_count, avg_views,
                 email, website, niche, channel_description, lead_score, temperature,
                 crm_stage, country, platform, thumbnail_url, social_links, pain_points, scrape_source)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          l.channel_id || null, l.channel_name, l.channel_handle || null,
          l.subscriber_count || 0, l.avg_views || 0,
          l.email, l.website || null, l.niche || null,
          (l.channel_description || '').substring(0, 400),
          l.lead_score || 0, l.temperature || 'cold',
          l.crm_stage || 'new_lead', l.country || null,
          l.platform || 'youtube', l.thumbnail_url || null,
          l.social_links || '{}', l.pain_points || '[]',
          l.scrape_source || 'youtube_api',
        ],
      }));
      await tursoExecBatch(cfg, stmts);
      pushed += batch.length;
    }
    console.log(`[Turso] Pushed ${pushed} user leads to cloud`);
    return pushed;
  } catch (e) {
    console.error('[Turso] pushUserLeads error:', e.message);
    return 0;
  }
}

async function pullUserLeadsFromTurso() {
  const cfg = getCfg();
  if (!cfg) return 0;
  try {
    await ensureLeadsSchema(cfg);
    const { getDb } = require('../models/database');
    const db = getDb();
    const localCount = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
    console.log(`[Turso] Pull user_leads starting — local DB has ${localCount} leads`);

    const INSERT = db.prepare(`
      INSERT OR IGNORE INTO leads
        (channel_id, channel_name, channel_handle, subscriber_count, avg_views,
         email, website, niche, channel_description, lead_score, temperature,
         crm_stage, country, platform, thumbnail_url, social_links, pain_points, scrape_source, user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
    `);

    let offset = 0;
    const batchSize = 500;
    let total = 0;
    while (true) {
      const result = await tursoExec(cfg,
        `SELECT channel_id, channel_name, channel_handle, subscriber_count, avg_views,
                email, website, niche, channel_description, lead_score, temperature,
                crm_stage, country, platform, thumbnail_url, social_links, pain_points, scrape_source
         FROM user_leads WHERE email IS NOT NULL AND email != '' LIMIT ? OFFSET ?`,
        [batchSize, offset]
      );
      const cols = (result?.cols || []).map(c => c.name);
      const rows = result?.rows || [];
      if (!rows.length) break;
      const ins = db.transaction(rows => {
        let n = 0;
        for (const row of rows) {
          const r = {};
          cols.forEach((col, i) => { r[col] = row[i]?.value ?? null; });
          try {
            const res = INSERT.run(
              r.channel_id, r.channel_name, r.channel_handle,
              Number(r.subscriber_count) || 0, Number(r.avg_views) || 0,
              r.email, r.website, r.niche,
              (r.channel_description || '').substring(0, 400),
              Number(r.lead_score) || 0, r.temperature,
              r.crm_stage || 'new_lead', r.country,
              r.platform || 'youtube', r.thumbnail_url,
              r.social_links || '{}', r.pain_points || '[]',
              r.scrape_source || 'youtube_api'
            );
            if (res.changes > 0) n++;
          } catch {}
        }
        return n;
      });
      total += ins(rows);
      offset += rows.length;
      if (rows.length < batchSize) break;
    }
    console.log(`[Turso] Pull user_leads complete — restored ${total} leads`);
    return total;
  } catch (e) {
    console.error('[Turso] pullUserLeads error:', e.message);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────

const USER_COLS = [
  'id', 'email', 'password', 'google_id', 'full_name', 'agency_name', 'role',
  'plan', 'plan_status', 'is_admin', 'email_verified', 'phone_verified', 'phone_number',
  'profile_picture', 'onboarding_completed', 'created_at', 'last_login',
  'target_niches', 'target_platforms', 'portfolio_url', 'daily_email_limit', 'auto_find_leads',
  'service_type', 'one_liner', 'experience_years', 'best_result', 'pricing_range',
  'personality_traits', 'outreach_goal', 'origin_story', 'unique_difference',
  'profile_completed', 'voice_dna',
  'trial_ends_at', 'custom_emails_limit', 'custom_leads_limit',
  'leads_used_this_month', 'emails_used_this_month', 'usage_reset_date',
];

async function ensureUsersSchema(cfg) {
  await tursoExec(cfg, `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      google_id TEXT,
      full_name TEXT,
      agency_name TEXT,
      role TEXT,
      plan TEXT DEFAULT 'trial',
      plan_status TEXT DEFAULT 'active',
      is_admin INTEGER DEFAULT 0,
      email_verified INTEGER DEFAULT 0,
      phone_verified INTEGER DEFAULT 0,
      phone_number TEXT,
      profile_picture TEXT,
      onboarding_completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      last_login DATETIME,
      target_niches TEXT,
      target_platforms TEXT,
      portfolio_url TEXT,
      daily_email_limit INTEGER DEFAULT 50,
      auto_find_leads INTEGER DEFAULT 0,
      service_type TEXT,
      one_liner TEXT,
      experience_years TEXT,
      best_result TEXT,
      pricing_range TEXT,
      personality_traits TEXT,
      outreach_goal TEXT,
      origin_story TEXT,
      unique_difference TEXT,
      profile_completed INTEGER DEFAULT 0,
      voice_dna TEXT DEFAULT '{}',
      trial_ends_at DATETIME,
      custom_emails_limit INTEGER,
      custom_leads_limit INTEGER,
      leads_used_this_month INTEGER DEFAULT 0,
      emails_used_this_month INTEGER DEFAULT 0,
      usage_reset_date DATE
    )
  `);
}

async function syncUsersToTurso(db) {
  const cfg = getCfg();
  if (!cfg) return 0;
  try {
    await ensureUsersSchema(cfg);
    const colList = USER_COLS.join(', ');
    const users = db.prepare(`SELECT ${colList} FROM users`).all();
    if (!users.length) return 0;
    const BATCH = 20;
    let pushed = 0;

    // Use upsert that NEVER downgrades onboarding_completed from 1→0.
    // Once a user completes/skips onboarding, that flag must be sticky in Turso.
    const setCols = USER_COLS
      .filter(c => c !== 'id')
      .map(c => c === 'onboarding_completed'
        ? `onboarding_completed = MAX(users.onboarding_completed, excluded.onboarding_completed)`
        : `${c} = excluded.${c}`)
      .join(', ');
    const sql = `INSERT INTO users (${colList}) VALUES (${USER_COLS.map(() => '?').join(',')})
      ON CONFLICT(id) DO UPDATE SET ${setCols}`;

    for (let i = 0; i < users.length; i += BATCH) {
      const batch = users.slice(i, i + BATCH);
      const stmts = batch.map(u => ({ sql, args: USER_COLS.map(col => u[col] ?? null) }));
      await tursoExecBatch(cfg, stmts);
      pushed += batch.length;
    }
    console.log(`[Turso] Pushed ${pushed} users to cloud`);
    return pushed;
  } catch (e) {
    console.error('[Turso] syncUsers error:', e.message);
    return 0;
  }
}

async function pullUsersFromTurso() {
  const cfg = getCfg();
  if (!cfg) return 0;
  try {
    await ensureUsersSchema(cfg);
    const { getDb } = require('../models/database');
    const db = getDb();
    const localCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    console.log(`[Turso] Pull users starting — local DB has ${localCount} users`);

    const colList = USER_COLS.join(', ');
    const INSERT = db.prepare(
      `INSERT OR REPLACE INTO users (${colList}) VALUES (${USER_COLS.map(() => '?').join(',')})`
    );

    let offset = 0;
    const batchSize = 100;
    let total = 0;

    while (true) {
      const result = await tursoExec(cfg,
        `SELECT ${colList} FROM users ORDER BY id LIMIT ? OFFSET ?`,
        [batchSize, offset]
      );
      const cols = (result?.cols || []).map(c => c.name);
      const rows = result?.rows || [];
      if (!rows.length) break;

      const ins = db.transaction(rows => {
        let n = 0;
        for (const row of rows) {
          const r = {};
          cols.forEach((col, i) => { r[col] = row[i]?.value ?? null; });
          try {
            const res = INSERT.run(USER_COLS.map(col => r[col] ?? null));
            if (res.changes > 0) n++;
          } catch {}
        }
        return n;
      });
      total += ins(rows);
      offset += rows.length;
      if (rows.length < batchSize) break;
    }

    console.log(`[Turso] Pull users complete — restored ${total} users`);

    // Heal: if Turso had stale onboarding_completed=0 for users who have profile
    // data (service_type set = they went through onboarding), fix it locally and
    // immediately push the correction back to Turso so it never happens again.
    try {
      const healed = db.prepare(`
        UPDATE users SET onboarding_completed = 1
        WHERE onboarding_completed = 0
          AND service_type IS NOT NULL AND service_type != ''
      `).run();
      if (healed.changes > 0) {
        console.log(`[Turso] Healed onboarding_completed for ${healed.changes} users — syncing fix to Turso`);
        await syncUsersToTurso(db);
      }
    } catch {}

    return total;
  } catch (e) {
    console.error('[Turso] pullUsers error:', e.message);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────
// QUALITY LEADS
// ─────────────────────────────────────────────────────────────────

const QL_COLS = [
  'creator_id', 'channel_url', 'channel_name', 'channel_handle', 'subscriber_count',
  'niche', 'email', 'intent_score', 'intent_tier',
  'sig_upload_frequency', 'sig_view_growth', 'sig_title_keywords',
  'sig_description_keywords', 'sig_engagement', 'sig_consistency',
  'source', 'outreached', 'updated_at',
];

async function ensureQualityLeadsSchema(cfg) {
  await tursoExec(cfg, `
    CREATE TABLE IF NOT EXISTS quality_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id TEXT UNIQUE NOT NULL,
      channel_url TEXT,
      channel_name TEXT,
      channel_handle TEXT,
      subscriber_count INTEGER DEFAULT 0,
      niche TEXT,
      email TEXT,
      intent_score REAL DEFAULT 0,
      intent_tier TEXT DEFAULT 'COLD',
      sig_upload_frequency REAL DEFAULT 0,
      sig_view_growth REAL DEFAULT 0,
      sig_title_keywords REAL DEFAULT 0,
      sig_description_keywords REAL DEFAULT 0,
      sig_engagement REAL DEFAULT 0,
      sig_consistency REAL DEFAULT 0,
      source TEXT DEFAULT 'master_pool',
      outreached INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT (datetime('now')),
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);
}

async function syncQualityLeadsToTurso(db) {
  const cfg = getCfg();
  if (!cfg) return 0;
  try {
    await ensureQualityLeadsSchema(cfg);
    const colList = QL_COLS.join(', ');
    const leads = db.prepare(
      `SELECT ${colList} FROM quality_leads WHERE intent_tier = 'HOT'`
    ).all();
    if (!leads.length) return 0;
    const BATCH = 50;
    let pushed = 0;
    const sql = `INSERT OR REPLACE INTO quality_leads (${colList}) VALUES (${QL_COLS.map(() => '?').join(',')})`;
    for (let i = 0; i < leads.length; i += BATCH) {
      const batch = leads.slice(i, i + BATCH);
      const stmts = batch.map(l => ({ sql, args: QL_COLS.map(col => l[col] ?? null) }));
      await tursoExecBatch(cfg, stmts);
      pushed += batch.length;
    }
    console.log(`[Turso] Pushed ${pushed} HOT quality_leads to cloud`);
    return pushed;
  } catch (e) {
    console.error('[Turso] syncQualityLeads error:', e.message);
    return 0;
  }
}

async function pullQualityLeadsFromTurso() {
  const cfg = getCfg();
  if (!cfg) return 0;
  try {
    await ensureQualityLeadsSchema(cfg);
    const { getDb } = require('../models/database');
    const db = getDb();
    const localCount = db.prepare('SELECT COUNT(*) as c FROM quality_leads').get().c;
    console.log(`[Turso] Pull quality_leads starting — local DB has ${localCount} quality leads`);

    const colList = QL_COLS.join(', ');
    const INSERT = db.prepare(
      `INSERT OR REPLACE INTO quality_leads (${colList}) VALUES (${QL_COLS.map(() => '?').join(',')})`
    );

    let offset = 0;
    const batchSize = 500;
    let total = 0;

    while (true) {
      const result = await tursoExec(cfg,
        `SELECT ${colList} FROM quality_leads ORDER BY intent_score DESC LIMIT ? OFFSET ?`,
        [batchSize, offset]
      );
      const cols = (result?.cols || []).map(c => c.name);
      const rows = result?.rows || [];
      if (!rows.length) break;

      const ins = db.transaction(rows => {
        let n = 0;
        for (const row of rows) {
          const r = {};
          cols.forEach((col, i) => { r[col] = row[i]?.value ?? null; });
          try {
            const res = INSERT.run(QL_COLS.map(col => r[col] ?? null));
            if (res.changes > 0) n++;
          } catch {}
        }
        return n;
      });
      total += ins(rows);
      offset += rows.length;
      if (rows.length < batchSize) break;
    }

    console.log(`[Turso] Pull quality_leads complete — restored ${total} HOT leads`);
    return total;
  } catch (e) {
    console.error('[Turso] pullQualityLeads error:', e.message);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────
// MASTER BOOT SYNC
// ─────────────────────────────────────────────────────────────────

async function syncAllOnBoot() {
  console.log('[Turso] Starting boot sync...');
  await pullUsersFromTurso();        // Auth works immediately
  await pullFromTurso();             // master_leads restored
  await pullQualityLeadsFromTurso(); // HOT quality leads restored
  await pullUserLeadsFromTurso();    // Per-user leads restored
  console.log('[Turso] Boot sync complete');
}

module.exports = {
  pullFromTurso, pushToTurso, getCfg,
  pushUserLeadsToTurso, pullUserLeadsFromTurso,
  syncUsersToTurso, pullUsersFromTurso,
  syncQualityLeadsToTurso, pullQualityLeadsFromTurso,
  syncAllOnBoot,
};
