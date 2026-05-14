const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// __dirname = backend/src/models  →  ../../data = backend/data
const DB_PATH = path.join(__dirname, '../../data/outreach.db');

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

  // Migrations — safe to run on existing DBs
  try { db.exec(`ALTER TABLE emails ADD COLUMN from_email TEXT`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN follow_up_count INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN last_contacted_date TEXT`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN next_follow_up_date TEXT`); } catch {}
  try { db.exec(`ALTER TABLE leads ADD COLUMN follow_up_status TEXT DEFAULT 'active'`); } catch {}

  // Unique indexes — prevent duplicate leads
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_channel_id_uniq ON leads(channel_id) WHERE channel_id IS NOT NULL AND channel_id != ''`); } catch {}
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_handle_uniq ON leads(channel_handle) WHERE channel_handle IS NOT NULL AND channel_handle != ''`); } catch {}

  // One-time dedup: keep highest id (most recent) per channel_id
  try {
    db.exec(`DELETE FROM leads WHERE id NOT IN (
      SELECT MAX(id) FROM leads WHERE channel_id IS NOT NULL AND channel_id != '' GROUP BY channel_id
    ) AND channel_id IS NOT NULL AND channel_id != ''`);
  } catch {}

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

function logActivity(type, message, leadId = null, metadata = {}) {
  const db = getDb();
  db.prepare(`INSERT INTO activities (type, message, lead_id, metadata) VALUES (?, ?, ?, ?)`)
    .run(type, message, leadId, JSON.stringify(metadata));
}

module.exports = { getDb, getSetting, setSetting, logActivity };
