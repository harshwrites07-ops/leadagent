const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB_PATH resolution order:
//   1. DB_PATH env var (set this in Railway to point at the mounted volume)
//   2. /app/backend/data (Railway volume default mount path)
//   3. local: backend/data/outreach.db
const DB_PATH = process.env.DB_PATH ||
  (fs.existsSync('/app/backend/data') || process.env.NODE_ENV === 'production'
    ? '/app/backend/data/outreach.db'
    : path.join(__dirname, '../../data/outreach.db'));

let db;

function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL DEFAULT 'youtube',
      channel_id TEXT,
      channel_name TEXT NOT NULL,
      channel_handle TEXT,
      subscriber_count INTEGER DEFAULT 0,
      total_videos INTEGER DEFAULT 0,
      avg_views REAL DEFAULT 0,
      avg_likes REAL DEFAULT 0,
      avg_comments REAL DEFAULT 0,
      engagement_rate REAL DEFAULT 0,
      upload_frequency_days REAL DEFAULT 0,
      last_upload_date TEXT,
      channel_description TEXT,
      channel_tags TEXT DEFAULT '[]',
      recent_videos TEXT DEFAULT '[]',
      most_viewed_video TEXT DEFAULT '{}',
      country TEXT,
      email TEXT,
      website TEXT,
      social_links TEXT DEFAULT '{}',
      pain_points TEXT DEFAULT '[]',
      lead_score INTEGER DEFAULT 0,
      temperature TEXT DEFAULT 'cold',
      crm_stage TEXT DEFAULT 'new_lead',
      niche TEXT,
      reddit_username TEXT,
      reddit_post_title TEXT,
      reddit_post_content TEXT,
      reddit_subreddit TEXT,
      thumbnail_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pitches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL UNIQUE,
      deep_study TEXT,
      custom_offer TEXT,
      cold_email TEXT,
      email_subject TEXT,
      reddit_dm TEXT,
      subject_variants TEXT DEFAULT '[]',
      pitch_score INTEGER,
      pitch_feedback TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'queued',
      sent_at DATETIME,
      opened_at DATETIME,
      clicked_at DATETIME,
      replied_at DATETIME,
      follow_up_number INTEGER DEFAULT 0,
      tracking_id TEXT UNIQUE,
      bounce_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      email_id INTEGER,
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'pending',
      scheduled_at DATETIME,
      sent_at DATETIME,
      priority INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      lead_id INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_leads_platform ON leads(platform);
    CREATE INDEX IF NOT EXISTS idx_leads_crm_stage ON leads(crm_stage);
    CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(temperature);
    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
    CREATE INDEX IF NOT EXISTS idx_emails_lead_id ON emails(lead_id);
    CREATE INDEX IF NOT EXISTS idx_emails_tracking_id ON emails(tracking_id);
    CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);
    CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
  `);

  // Background send jobs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS power_send_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      status TEXT DEFAULT 'running',
      total INTEGER DEFAULT 0,
      studied INTEGER DEFAULT 0,
      generated INTEGER DEFAULT 0,
      sent INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      settings TEXT DEFAULT '{}',
      log TEXT DEFAULT '[]',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);

  // ── Auth tables ────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      phone_number TEXT UNIQUE,
      phone_verified INTEGER DEFAULT 0,
      email_verified INTEGER DEFAULT 0,
      google_id TEXT UNIQUE,
      full_name TEXT NOT NULL DEFAULT '',
      agency_name TEXT DEFAULT '',
      role TEXT DEFAULT 'Video Editor',
      plan TEXT DEFAULT 'free',
      plan_status TEXT DEFAULT 'active',
      leads_used_this_month INTEGER DEFAULT 0,
      emails_used_this_month INTEGER DEFAULT 0,
      usage_reset_date TEXT DEFAULT (date('now','start of month','+1 month')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      profile_picture TEXT,
      onboarding_completed INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      login_attempts INTEGER DEFAULT 0,
      lockout_until DATETIME,
      target_niches TEXT DEFAULT '[]',
      target_platforms TEXT DEFAULT '[]',
      portfolio_url TEXT DEFAULT '',
      daily_email_limit INTEGER DEFAULT 50,
      auto_find_leads INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Gmail OAuth accounts per user
  db.exec(`
    CREATE TABLE IF NOT EXISTS gmail_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expiry INTEGER,
      status TEXT DEFAULT 'active',
      emails_sent_today INTEGER DEFAULT 0,
      last_reset_date TEXT DEFAULT (date('now')),
      connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, email)
    )
  `);

  // Migrations — safe to run on existing DBs
  try { db.exec(`ALTER TABLE emails ADD COLUMN from_email TEXT`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN follow_up_count INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN last_contacted_date TEXT`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN next_follow_up_date TEXT`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN follow_up_status TEXT DEFAULT 'active'`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN email_invalid INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN bounce_reason TEXT`); } catch {}
  try { db.exec(`ALTER TABLE emails ADD COLUMN reply_body TEXT`); } catch {}
  try { db.exec(`ALTER TABLE emails ADD COLUMN reply_subject TEXT`); } catch {}
  try { db.exec(`ALTER TABLE emails ADD COLUMN reply_from TEXT`); } catch {}
  try { db.exec(`ALTER TABLE emails ADD COLUMN my_reply_body TEXT`); } catch {}
  try { db.exec(`ALTER TABLE emails ADD COLUMN my_reply_sent_at TEXT`); } catch {}
  // Mark obviously invalid emails in existing data
  try {
    db.exec(`UPDATE leads SET email_invalid=1 WHERE email IS NOT NULL AND (
      email NOT LIKE '%@%.%' OR
      LENGTH(TRIM(SUBSTR(email,1,INSTR(email,'@')-1))) < 2 OR
      INSTR(email,'@') = 0 OR
      LENGTH(email) < 6
    ) AND email_invalid = 0`);
  } catch {}

  // User preference columns (multi-user settings per user)
  try { db.exec(`ALTER TABLE users ADD COLUMN email_tone TEXT DEFAULT 'casual'`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN outreach_goal TEXT DEFAULT 'get_reply'`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN min_email_delay INTEGER DEFAULT 45`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN max_email_delay INTEGER DEFAULT 120`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN followups_enabled INTEGER DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN max_followups INTEGER DEFAULT 3`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN followup_delay_days INTEGER DEFAULT 3`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN best_result TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN pricing_range TEXT DEFAULT '$500-$2000/month'`); } catch {}

  // ── user_id migrations — add to all data tables ───────────────────────────
  try { db.exec(`ALTER TABLE leads ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch {}
  try { db.exec(`ALTER TABLE emails ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch {}
  try { db.exec(`ALTER TABLE email_queue ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch {}
  try { db.exec(`ALTER TABLE pitches ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch {}
  try { db.exec(`ALTER TABLE notes ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch {}
  try { db.exec(`ALTER TABLE power_send_jobs ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch {}

  // Bootstrap: create the owner/admin user (id=1) and assign all existing orphaned rows to them
  const ownerEmail = process.env.ADMIN_EMAIL || process.env.OWNER_EMAIL || 'admin@quelro.com';
  const existingOwner = db.prepare(`SELECT id FROM users WHERE id=1`).get();
  if (!existingOwner) {
    // Create default admin — password is set via /auth/setup on first visit, or ADMIN_PASSWORD env var
    const bcrypt = require('bcryptjs');
    const rawPass = process.env.ADMIN_PASSWORD || 'changeme123';
    const hashed = bcrypt.hashSync(rawPass, 12);
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password, full_name, email_verified, is_admin, plan, onboarding_completed)
      VALUES (1, ?, ?, 'Admin', 1, 1, 'agency', 1)
    `).run(ownerEmail, hashed);
    console.log(`[DB] Created admin user: ${ownerEmail} (set ADMIN_EMAIL + ADMIN_PASSWORD in .env)`);
  }

  // Assign all orphaned rows (user_id IS NULL) to admin user 1
  try { db.exec(`UPDATE leads SET user_id=1 WHERE user_id IS NULL`); } catch {}
  try { db.exec(`UPDATE emails SET user_id=1 WHERE user_id IS NULL`); } catch {}
  try { db.exec(`UPDATE email_queue SET user_id=1 WHERE user_id IS NULL`); } catch {}
  try { db.exec(`UPDATE pitches SET user_id=1 WHERE user_id IS NULL`); } catch {}
  try { db.exec(`UPDATE activities SET user_id=1 WHERE user_id IS NULL`); } catch {}
  try { db.exec(`UPDATE notes SET user_id=1 WHERE user_id IS NULL`); } catch {}
  try { db.exec(`UPDATE power_send_jobs SET user_id=1 WHERE user_id IS NULL`); } catch {}

  // Drop old global unique indexes (they block multi-user: two users can't have the same channel)
  try { db.exec(`DROP INDEX IF EXISTS idx_leads_channel_id_uniq`); } catch {}
  try { db.exec(`DROP INDEX IF EXISTS idx_leads_handle_uniq`); } catch {}

  // Per-user unique indexes — one channel per user, not globally unique
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_channel_id_user_uniq ON leads(channel_id, user_id) WHERE channel_id IS NOT NULL AND channel_id != ''`); } catch {}
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_handle_user_uniq ON leads(channel_handle, user_id) WHERE channel_handle IS NOT NULL AND channel_handle != ''`); } catch {}

  // One-time dedup: keep highest id (most recent) per channel_id+user_id pair
  try {
    db.exec(`DELETE FROM leads WHERE id NOT IN (
      SELECT MAX(id) FROM leads WHERE channel_id IS NOT NULL AND channel_id != '' GROUP BY channel_id, user_id
    ) AND channel_id IS NOT NULL AND channel_id != ''`);
  } catch {}

  // Stripe billing columns
  try { db.exec(`ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN trial_ends_at DATETIME DEFAULT (datetime('now', '+14 days'))`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN billing_cycle_start DATETIME DEFAULT (datetime('now'))`); } catch {}

  // gmail_accounts migrations
  try { db.exec(`ALTER TABLE gmail_accounts ADD COLUMN daily_limit INTEGER DEFAULT 500`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_gmail_accounts_user_id ON gmail_accounts(user_id)`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN exported_at DATETIME DEFAULT NULL`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_exported_at ON leads(user_id, exported_at)`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN scrape_source TEXT DEFAULT 'youtube_api'`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN view_trend TEXT`); } catch {}

  // user_id indexes for fast per-user queries
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_email_queue_user_id ON email_queue(user_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pitches_user_id ON pitches(user_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_email_queue_user_status ON email_queue(user_id, status, priority, created_at)`); } catch {}

  // One-time: merge orphaned Google-only user into admin (single-user SaaS setup)
  // Scenario: admin@quelro.com (id=1) has all the data; user logged in via Google, got id=2 with no data.
  // Fix: copy google_id to admin so next Google login authenticates as id=1.
  try {
    const alreadyMerged = db.prepare("SELECT value FROM settings WHERE key='google_merge_done'").get();
    if (!alreadyMerged) {
      const admin = db.prepare('SELECT id, google_id FROM users WHERE id=1').get();
      const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
      if (admin && !admin.google_id && userCount === 2) {
        const orphan = db.prepare('SELECT * FROM users WHERE id != 1 AND google_id IS NOT NULL').get();
        if (orphan) {
          const hasLeads = db.prepare('SELECT COUNT(*) as n FROM leads WHERE user_id=?').get(orphan.id).n > 0;
          const hasEmails = db.prepare('SELECT COUNT(*) as n FROM emails WHERE user_id=?').get(orphan.id).n > 0;
          if (!hasLeads && !hasEmails) {
            db.prepare('UPDATE users SET google_id=? WHERE id=1').run(orphan.google_id);
            db.prepare("UPDATE users SET email=('orphan_'||id||'@merged.internal'), google_id=NULL WHERE id=?").run(orphan.id);
            db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('google_merge_done', 'true')").run();
            console.log(`[DB] Merged Google account (user id=${orphan.id}) into admin (id=1) — user must re-login`);
          }
        }
      }
    }
  } catch (e) { console.warn('[DB] Google merge migration skip:', e.message); }

  // Periodic cleanup of expired password reset tokens (runs every 24h)
  setInterval(() => {
    try { getDb().prepare(`DELETE FROM password_reset_tokens WHERE expires_at < datetime('now')`).run(); } catch {}
  }, 24 * 60 * 60 * 1000);

  // Seed default settings
  const defaults = {
    daily_send_limit: '150',
    email_delay_min: '45',
    email_delay_max: '120',
    followup_delay_days: '3',
    max_followups: '3',
    auto_scrape: 'false',
    auto_generate_pitches: 'false',
    auto_queue_emails: 'false',
    auto_followup: 'true',
    tone_preference: 'casual',
    offer_type: 'free_trial',
    risk_reversal: 'free_first_edit',
    agency_name: process.env.AGENCY_NAME || 'ContentCrafterzz',
    your_name: process.env.YOUR_NAME || '',
    your_role: process.env.YOUR_ROLE || 'Founder',
    portfolio_url: process.env.PORTFOLIO_URL || '',
    pricing_range: process.env.PRICING_RANGE || '$500-$2000/month',
    target_niches: '[]',
    case_studies: '[]',
    services_description: 'Professional video editing for YouTube creators',
    blacklist_keywords: '[]',
    blacklist_channels: '[]',
    average_deal_value: '1000',
    smtp_host: process.env.SMTP_HOST || '',
    smtp_port: process.env.SMTP_PORT || '587',
    smtp_user: process.env.SMTP_USER || '',
    smtp_from_name: process.env.SMTP_FROM_NAME || '',
    smtp_inboxes: process.env.SMTP_USER ? JSON.stringify([{
      email: process.env.SMTP_USER,
      from_name: process.env.SMTP_FROM_NAME || 'ContentCrafterzz',
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
    }]) : '[]',
  };

  const insert = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [key, value] of Object.entries(defaults)) {
    insert.run(key, value);
  }
}

function getUserById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByEmail(email) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
}

// express-session store backed by the existing better-sqlite3 connection
class BetterSQLiteStore {
  constructor(expressSession) {
    const Store = expressSession.Store;
    class _Store extends Store {
      constructor() {
        super();
        setInterval(() => {
          try { getDb().prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run(); } catch {}
        }, 15 * 60 * 1000);
      }
      get(sid, cb) {
        try {
          const row = getDb().prepare("SELECT data FROM sessions WHERE session_id=? AND expires_at > datetime('now')").get(sid);
          cb(null, row ? JSON.parse(row.data) : null);
        } catch (e) { cb(e); }
      }
      set(sid, sess, cb) {
        try {
          const exp = sess.cookie?.expires
            ? new Date(sess.cookie.expires).toISOString()
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          getDb().prepare(`INSERT OR REPLACE INTO sessions (session_id,data,expires_at,created_at) VALUES (?,?,?,CURRENT_TIMESTAMP)`).run(sid, JSON.stringify(sess), exp);
          cb(null);
        } catch (e) { cb(e); }
      }
      destroy(sid, cb) {
        try { getDb().prepare('DELETE FROM sessions WHERE session_id=?').run(sid); cb(null); } catch (e) { cb(e); }
      }
      touch(sid, sess, cb) {
        try {
          const exp = sess.cookie?.expires
            ? new Date(sess.cookie.expires).toISOString()
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          getDb().prepare('UPDATE sessions SET expires_at=? WHERE session_id=?').run(exp, sid);
          cb(null);
        } catch (e) { cb(e); }
      }
    }
    return new _Store();
  }
}

function getSetting(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`)
    .run(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
}

function logActivity(type, message, leadId = null, metadata = {}, userId = null) {
  const db = getDb();
  db.prepare(`INSERT INTO activities (type, message, lead_id, metadata, user_id) VALUES (?, ?, ?, ?, ?)`)
    .run(type, message, leadId, JSON.stringify(metadata), userId);
}

module.exports = { getDb, getSetting, setSetting, logActivity, getUserById, getUserByEmail, BetterSQLiteStore };
