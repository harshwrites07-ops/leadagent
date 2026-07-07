const USE_PG = !!process.env.DATABASE_URL;

let _db = null;
let _settingsCache = {};

// ── Unified async DB interface ────────────────────────────────────────────────

function _wrapSqlite(rawDb) {
  return {
    async get(sql, params = []) {
      const p = Array.isArray(params) ? params : [params];
      return rawDb.prepare(sql).get(...p) || null;
    },
    async run(sql, params = []) {
      const p = Array.isArray(params) ? params : [params];
      const r = rawDb.prepare(sql).run(...p);
      return { lastID: r.lastInsertRowid, changes: r.changes };
    },
    async all(sql, params = []) {
      const p = Array.isArray(params) ? params : [params];
      return rawDb.prepare(sql).all(...p);
    },
    _raw: rawDb,
  };
}

function getDb() {
  return _db;
}

// ── Initialization ────────────────────────────────────────────────────────────

async function initializeDatabase() {
  if (USE_PG) {
    const pg = require('./postgres');
    await pg.initPostgres();
    _db = {
      get: pg.get,
      run: pg.run,
      all: pg.all,
      _pool: pg.pool,
    };
  } else {
    const rawDb = _initSqlite();
    _db = _wrapSqlite(rawDb);
  }

  // Load settings into in-memory cache
  try {
    const rows = await _db.all('SELECT key, value FROM settings');
    _settingsCache = Object.fromEntries(rows.map(r => [r.key, r.value]));
  } catch {}

  // Seed defaults and ensure admin exist
  await _seedDefaultSettings();
  await _ensureAdmin();

  // Periodic cleanup
  setInterval(() => {
    _db.run(`DELETE FROM password_reset_tokens WHERE expires_at < ${USE_PG ? 'NOW()' : "datetime('now')"}`)
      .catch(() => {});
  }, 24 * 60 * 60 * 1000);

  return _db;
}

// ── SQLite initialization (unchanged from original) ───────────────────────────

function _initSqlite() {
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');

  const DB_PATH = process.env.DB_PATH ||
    (fs.existsSync('/app/backend/data') || process.env.NODE_ENV === 'production'
      ? '/app/backend/data/outreach.db'
      : path.join(__dirname, '../../data/outreach.db'));

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const rawDb = new Database(DB_PATH);
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('foreign_keys = ON');
  _initSqliteSchema(rawDb);
  return rawDb;
}

function _initSqliteSchema(db) {
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

  db.exec(`CREATE TABLE IF NOT EXISTS power_send_jobs (
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
  )`);

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

  db.exec(`CREATE TABLE IF NOT EXISTS gmail_accounts (
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
  )`);

  // Migrations — silently skip "column already exists" errors, log anything else
  const alterTry = (sql) => {
    try { db.exec(sql); } catch (e) {
      const msg = e.message || '';
      const expected = msg.includes('already exists') || msg.includes('duplicate column') || msg.includes('no such table') || msg.includes('already an index');
      if (!expected) console.warn('[DB Migration] Unexpected error:', msg, '| SQL:', sql.slice(0, 80));
    }
  };
  alterTry(`ALTER TABLE emails ADD COLUMN from_email TEXT`);
  alterTry(`ALTER TABLE leads ADD COLUMN follow_up_count INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE leads ADD COLUMN last_contacted_date TEXT`);
  alterTry(`ALTER TABLE leads ADD COLUMN next_follow_up_date TEXT`);
  alterTry(`ALTER TABLE leads ADD COLUMN follow_up_status TEXT DEFAULT 'active'`);
  alterTry(`ALTER TABLE leads ADD COLUMN email_invalid INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE leads ADD COLUMN bounce_reason TEXT`);
  alterTry(`ALTER TABLE emails ADD COLUMN reply_body TEXT`);
  alterTry(`ALTER TABLE emails ADD COLUMN reply_subject TEXT`);
  alterTry(`ALTER TABLE emails ADD COLUMN reply_from TEXT`);
  alterTry(`ALTER TABLE emails ADD COLUMN my_reply_body TEXT`);
  alterTry(`ALTER TABLE emails ADD COLUMN my_reply_sent_at TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN email_tone TEXT DEFAULT 'casual'`);
  alterTry(`ALTER TABLE pitches ADD COLUMN quality_score INTEGER`);
  alterTry(`ALTER TABLE pitches ADD COLUMN quality_breakdown TEXT`);
  alterTry(`ALTER TABLE pitches ADD COLUMN quality_regenerated INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE pitches ADD COLUMN quality_warning INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE users ADD COLUMN voice_sample_1 TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN voice_sample_2 TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN voice_sample_3 TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN voice_confidence_register TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN voice_sentence_style TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN voice_dna_version INTEGER DEFAULT 1`);
  // Distinguishes a real Marcus/AI-generated pitch from buildFallback()'s
  // canned template — the July 3 incident shipped 3 fallback emails that were
  // indistinguishable from real output in the DB and UI. Existing rows predate
  // this column and are assumed 'marcus' (the only path that wrote pitches
  // before this column existed).
  alterTry(`ALTER TABLE pitches ADD COLUMN generation_method TEXT DEFAULT 'marcus'`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS quality_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      channel_id TEXT,
      score INTEGER,
      passed INTEGER DEFAULT 0,
      regenerated INTEGER DEFAULT 0,
      breakdown TEXT DEFAULT '{}',
      attempt_number INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  alterTry(`ALTER TABLE quality_log ADD COLUMN attempt_number INTEGER DEFAULT 1`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_quality_log_user_id ON quality_log(user_id)`);
  alterTry(`ALTER TABLE users ADD COLUMN outreach_goal TEXT DEFAULT 'get_reply'`);
  alterTry(`ALTER TABLE users ADD COLUMN min_email_delay INTEGER DEFAULT 45`);
  alterTry(`ALTER TABLE users ADD COLUMN max_email_delay INTEGER DEFAULT 120`);
  alterTry(`ALTER TABLE users ADD COLUMN followups_enabled INTEGER DEFAULT 1`);
  alterTry(`ALTER TABLE users ADD COLUMN max_followups INTEGER DEFAULT 3`);
  alterTry(`ALTER TABLE users ADD COLUMN followup_delay_days INTEGER DEFAULT 3`);
  alterTry(`ALTER TABLE users ADD COLUMN best_result TEXT DEFAULT ''`);
  alterTry(`ALTER TABLE users ADD COLUMN pricing_range TEXT DEFAULT '$500-$2000/month'`);
  alterTry(`ALTER TABLE leads ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  alterTry(`ALTER TABLE emails ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  alterTry(`ALTER TABLE email_queue ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  alterTry(`ALTER TABLE pitches ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  alterTry(`ALTER TABLE activities ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  alterTry(`ALTER TABLE notes ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  alterTry(`ALTER TABLE power_send_jobs ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  alterTry(`ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN razorpay_customer_id TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN razorpay_subscription_id TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN trial_ends_at DATETIME DEFAULT (datetime('now', '+14 days'))`);
  alterTry(`ALTER TABLE users ADD COLUMN billing_cycle_start DATETIME DEFAULT (datetime('now'))`);
  alterTry(`ALTER TABLE users ADD COLUMN custom_emails_limit INTEGER`);
  alterTry(`ALTER TABLE users ADD COLUMN custom_leads_limit INTEGER`);
  alterTry(`ALTER TABLE users ADD COLUMN service_type TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN one_liner TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN experience_years TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN personality_traits TEXT DEFAULT '[]'`);
  alterTry(`ALTER TABLE users ADD COLUMN origin_story TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN unique_difference TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN voice_dna TEXT DEFAULT '{}'`);
  alterTry(`ALTER TABLE users ADD COLUMN profile_completed INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE gmail_accounts ADD COLUMN daily_limit INTEGER DEFAULT 500`);
  alterTry(`ALTER TABLE leads ADD COLUMN exported_at DATETIME DEFAULT NULL`);
  alterTry(`ALTER TABLE leads ADD COLUMN scrape_source TEXT DEFAULT 'youtube_api'`);
  alterTry(`ALTER TABLE leads ADD COLUMN view_trend TEXT`);
  alterTry(`ALTER TABLE leads ADD COLUMN intent_score REAL DEFAULT NULL`);
  alterTry(`ALTER TABLE leads ADD COLUMN intent_confidence TEXT DEFAULT NULL`);
  alterTry(`ALTER TABLE leads ADD COLUMN intent_reason TEXT DEFAULT NULL`);
  alterTry(`ALTER TABLE leads ADD COLUMN intent_signals TEXT DEFAULT NULL`);
  alterTry(`ALTER TABLE emails ADD COLUMN angle_type TEXT`);
  alterTry(`ALTER TABLE emails ADD COLUMN campaign_id INTEGER REFERENCES campaigns(id)`);
  alterTry(`ALTER TABLE emails ADD COLUMN reply_sentiment TEXT`);
  alterTry(`ALTER TABLE emails ADD COLUMN call_booked INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE emails ADD COLUMN client_closed INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE emails ADD COLUMN client_value REAL DEFAULT 0`);
  alterTry(`ALTER TABLE emails ADD COLUMN ab_variant TEXT`);
  // Freezes the lead's signal state at send time (see signalSnapshot.js) so
  // reply outcomes can later be joined back to what produced them.
  alterTry(`ALTER TABLE email_queue ADD COLUMN signal_snapshot TEXT`);
  alterTry(`ALTER TABLE emails ADD COLUMN signal_snapshot TEXT`);
  alterTry(`ALTER TABLE pitches ADD COLUMN signal_type TEXT`);

  // Indexes
  alterTry(`DROP INDEX IF EXISTS idx_leads_channel_id_uniq`);
  alterTry(`DROP INDEX IF EXISTS idx_leads_handle_uniq`);
  alterTry(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_channel_id_user_uniq ON leads(channel_id, user_id) WHERE channel_id IS NOT NULL AND channel_id != ''`);
  alterTry(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_handle_user_uniq ON leads(channel_handle, user_id) WHERE channel_handle IS NOT NULL AND channel_handle != ''`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_email_queue_user_id ON email_queue(user_id)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_pitches_user_id ON pitches(user_id)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_gmail_accounts_user_id ON gmail_accounts(user_id)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_leads_exported_at ON leads(user_id, exported_at)`);

  // Orphan assignment
  alterTry(`UPDATE leads SET user_id=1 WHERE user_id IS NULL`);
  alterTry(`UPDATE emails SET user_id=1 WHERE user_id IS NULL`);
  alterTry(`UPDATE email_queue SET user_id=1 WHERE user_id IS NULL`);
  alterTry(`UPDATE pitches SET user_id=1 WHERE user_id IS NULL`);
  alterTry(`UPDATE activities SET user_id=1 WHERE user_id IS NULL`);
  alterTry(`UPDATE notes SET user_id=1 WHERE user_id IS NULL`);
  alterTry(`UPDATE power_send_jobs SET user_id=1 WHERE user_id IS NULL`);

  // Fix double-@ in quality_leads.channel_url from a historical bug where
  // channel_handle (already prefixed with @) was concatenated with another @
  alterTry(`UPDATE quality_leads SET channel_url = 'https://youtube.com/' || channel_handle WHERE channel_url LIKE '%youtube.com/@@%' AND channel_handle LIKE '@%'`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS master_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT UNIQUE NOT NULL,
      channel_name TEXT NOT NULL,
      channel_handle TEXT,
      subscriber_count INTEGER DEFAULT 0,
      avg_views REAL DEFAULT 0,
      engagement_rate REAL DEFAULT 0,
      upload_frequency_days REAL DEFAULT 0,
      last_upload_date TEXT,
      country TEXT,
      email TEXT,
      website TEXT,
      niche TEXT,
      channel_description TEXT,
      cpm REAL DEFAULT 0,
      days_since_upload INTEGER,
      lead_score INTEGER DEFAULT 0,
      temperature TEXT DEFAULT 'warm',
      scraped_at DATETIME DEFAULT (datetime('now'))
    )
  `);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_master_niche ON master_leads(niche)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_master_subs ON master_leads(subscriber_count)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_master_email ON master_leads(email)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_master_country ON master_leads(country)`);
  alterTry(`CREATE UNIQUE INDEX IF NOT EXISTS idx_master_leads_channel_id ON master_leads(channel_id) WHERE channel_id IS NOT NULL`);
  alterTry(`DELETE FROM master_leads WHERE email IS NULL OR email = ''`);

  db.exec(`CREATE TABLE IF NOT EXISTS seeder_keyword_tokens (
    keyword TEXT NOT NULL,
    api_key_hash TEXT NOT NULL,
    next_page_token TEXT,
    pages_done INTEGER DEFAULT 0,
    zero_result_streak INTEGER DEFAULT 0,
    last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (keyword, api_key_hash)
  )`);
  alterTry(`ALTER TABLE seeder_keyword_tokens ADD COLUMN zero_result_streak INTEGER DEFAULT 0`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      niche TEXT,
      service_type TEXT,
      credentials TEXT,
      status TEXT DEFAULT 'draft',
      ab_test_enabled INTEGER DEFAULT 0,
      ab_variant_a TEXT DEFAULT 'Problem Angle',
      ab_variant_b TEXT DEFAULT 'Story Angle',
      total_leads INTEGER DEFAULT 0,
      hot_leads INTEGER DEFAULT 0,
      warm_leads INTEGER DEFAULT 0,
      cold_leads INTEGER DEFAULT 0,
      emails_sent INTEGER DEFAULT 0,
      emails_opened INTEGER DEFAULT 0,
      emails_replied INTEGER DEFAULT 0,
      calls_booked INTEGER DEFAULT 0,
      clients_closed INTEGER DEFAULT 0,
      avg_intent_score REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS campaign_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      intent_score REAL DEFAULT 0,
      intent_signals TEXT DEFAULT '{}',
      intent_rank INTEGER,
      intent_reason TEXT,
      intent_confidence TEXT DEFAULT 'Low',
      temperature TEXT DEFAULT 'cold',
      psychology_profile TEXT DEFAULT '{}',
      angles TEXT DEFAULT '[]',
      selected_angle TEXT,
      email_subject TEXT,
      email_body TEXT,
      email_subject_edited TEXT,
      email_body_edited TEXT,
      email_quality_score INTEGER DEFAULT 0,
      ab_variant TEXT,
      email_id INTEGER REFERENCES emails(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, lead_id)
    );
  `);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_id ON campaign_leads(campaign_id)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead_id ON campaign_leads(lead_id)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS quality_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id TEXT UNIQUE NOT NULL,
      channel_url TEXT,
      channel_name TEXT NOT NULL,
      channel_handle TEXT,
      subscriber_count INTEGER DEFAULT 0,
      niche TEXT,
      email TEXT,
      thumbnail_url TEXT,
      intent_score REAL NOT NULL DEFAULT 0,
      intent_tier TEXT NOT NULL DEFAULT 'HOT',
      sig_upload_frequency REAL DEFAULT 0,
      sig_view_growth REAL DEFAULT 0,
      sig_title_keywords REAL DEFAULT 0,
      sig_description_keywords REAL DEFAULT 0,
      sig_engagement REAL DEFAULT 0,
      sig_consistency REAL DEFAULT 0,
      psychology_profile TEXT DEFAULT '{}',
      personality_type TEXT,
      primary_pain_point TEXT,
      communication_style TEXT,
      source TEXT DEFAULT 'master_pool',
      buying_signal_text TEXT,
      outreached INTEGER DEFAULT 0,
      outreached_at DATETIME,
      reply_received INTEGER DEFAULT 0,
      call_booked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS archived_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id TEXT UNIQUE NOT NULL,
      channel_name TEXT,
      subscriber_count INTEGER DEFAULT 0,
      niche TEXT,
      email TEXT,
      intent_score REAL DEFAULT 0,
      intent_tier TEXT DEFAULT 'COLD',
      archived_reason TEXT DEFAULT 'below_threshold',
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS scraper_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT,
      scraper_type TEXT NOT NULL,
      tier INTEGER,
      niche TEXT,
      status TEXT DEFAULT 'running',
      channels_found INTEGER DEFAULT 0,
      channels_scored INTEGER DEFAULT 0,
      hot_added INTEGER DEFAULT 0,
      warm_archived INTEGER DEFAULT 0,
      cold_discarded INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      error_log TEXT DEFAULT '[]',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS scraper_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scraper TEXT NOT NULL,
      run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      attempted INTEGER DEFAULT 0,
      succeeded INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      sample_error TEXT
    );
    CREATE TABLE IF NOT EXISTS scraper_health_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scraper TEXT NOT NULL,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      success_rate REAL,
      attempted INTEGER,
      resolved INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS buying_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'reddit',
      post_id TEXT UNIQUE,
      subreddit TEXT,
      post_title TEXT,
      post_body TEXT,
      post_url TEXT,
      creator_handle TEXT,
      channel_url TEXT,
      subscriber_count INTEGER,
      budget_mentioned TEXT,
      intent_classification TEXT DEFAULT 'CURIOUS',
      keywords_matched TEXT DEFAULT '[]',
      quality_lead_id INTEGER REFERENCES quality_leads(id),
      processed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS platform_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      signal_text TEXT,
      signal_url TEXT,
      confidence REAL DEFAULT 0.5,
      budget_mentioned INTEGER DEFAULT 0,
      found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(creator_id, platform, signal_url)
    );
    CREATE TABLE IF NOT EXISTS creator_profiles (
      creator_id TEXT PRIMARY KEY,
      channel_name TEXT,
      youtube_score REAL DEFAULT 0,
      platform_score REAL DEFAULT 0,
      combined_score REAL DEFAULT 0,
      tier TEXT DEFAULT 'COLD',
      signals_found INTEGER DEFAULT 0,
      confirmed_hiring INTEGER DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS upwork_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT UNIQUE,
      title TEXT,
      description TEXT,
      budget TEXT,
      posted_at TEXT,
      job_url TEXT,
      creator_name TEXT,
      email TEXT,
      matched_channel_id TEXT,
      processed INTEGER DEFAULT 0,
      found_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_quality_leads_niche ON quality_leads(niche)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_quality_leads_score ON quality_leads(intent_score DESC)`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_quality_leads_subs ON quality_leads(subscriber_count)`);

  // Quality upgrade: recent video title column + case study in voice profile
  alterTry(`ALTER TABLE leads ADD COLUMN recent_video_title TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN case_study TEXT`);

  // video_data_status distinguishes "not fetched yet" (NULL) from a fetch that
  // ran and either succeeded ('ok'), failed transiently ('fetch_failed' —
  // quota/timeout, safe to retry), or hit a dead channel ('channel_gone' —
  // deleted/private, should not be retried).
  alterTry(`ALTER TABLE leads ADD COLUMN video_data_status TEXT`);
  alterTry(`CREATE INDEX IF NOT EXISTS idx_leads_video_data_status ON leads(video_data_status)`);
  alterTry(`ALTER TABLE leads ADD COLUMN video_fetch_attempts INTEGER DEFAULT 0`);

  // email_corrupt flags a row whose email column is an image/asset-filename
  // false positive from the old extractEmail() regex bug (e.g. "logo@2x.png",
  // "hash.png@1f.png" emoji sprite filenames) — see purgeCorruptEmails.js.
  // master_leads intentionally does NOT get its email nulled by that script,
  // since `DELETE FROM master_leads WHERE email IS NULL OR email = ''` below
  // runs on every boot and would silently wipe the row on the next restart;
  // the flag alone is enough to exclude it everywhere emails are surfaced.
  alterTry(`ALTER TABLE leads ADD COLUMN email_corrupt INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE master_leads ADD COLUMN email_corrupt INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE quality_leads ADD COLUMN email_corrupt INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE archived_leads ADD COLUMN email_corrupt INTEGER DEFAULT 0`);

  // meta_channel flags a row that teaches/sells the service (editing tutorial,
  // "grow your channel" coaching) rather than a potential buyer of it — see
  // classifyMetaChannel() in intentService.js.
  alterTry(`ALTER TABLE master_leads ADD COLUMN meta_channel INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE quality_leads ADD COLUMN meta_channel INTEGER DEFAULT 0`);

  // lead_type/schedule_break/break_severity (Session 1.1) — master_leads has
  // no recent_videos, so detectScheduleBreak() honestly returns
  // schedule_break=false there; these are meaningful once quality_leads/
  // leads get enriched with video history (videoBackfillService / refresh).
  alterTry(`ALTER TABLE master_leads ADD COLUMN lead_type TEXT`);
  alterTry(`ALTER TABLE master_leads ADD COLUMN schedule_break INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE master_leads ADD COLUMN break_severity REAL`);
  alterTry(`ALTER TABLE quality_leads ADD COLUMN lead_type TEXT`);
  alterTry(`ALTER TABLE quality_leads ADD COLUMN schedule_break INTEGER DEFAULT 0`);
  alterTry(`ALTER TABLE quality_leads ADD COLUMN break_severity REAL`);

  // Mailbox verification waterfall (Session 1.2) — email_status defaults to
  // 'unchecked' everywhere until the batch verify job or a live bounce
  // updates it. See emailVerifier.js.
  alterTry(`ALTER TABLE leads ADD COLUMN email_status TEXT DEFAULT 'unchecked'`);
  alterTry(`ALTER TABLE leads ADD COLUMN email_checked_at TEXT`);
  alterTry(`ALTER TABLE master_leads ADD COLUMN email_status TEXT DEFAULT 'unchecked'`);
  alterTry(`ALTER TABLE master_leads ADD COLUMN email_checked_at TEXT`);
  alterTry(`ALTER TABLE quality_leads ADD COLUMN email_status TEXT DEFAULT 'unchecked'`);
  alterTry(`ALTER TABLE quality_leads ADD COLUMN email_checked_at TEXT`);

  // Tiered refresh cadence + signal decay (Session 1.4)
  alterTry(`ALTER TABLE master_leads ADD COLUMN last_refreshed_at DATETIME`);
  alterTry(`ALTER TABLE master_leads ADD COLUMN tier TEXT`);
  alterTry(`ALTER TABLE quality_leads ADD COLUMN last_refreshed_at DATETIME`);
  alterTry(`ALTER TABLE quality_leads ADD COLUMN tier TEXT`);
  alterTry(`ALTER TABLE users ADD COLUMN hot_alert_digest_enabled INTEGER DEFAULT 1`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS quota_usage (
      api_key_hash TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      units_used INTEGER DEFAULT 0,
      PRIMARY KEY (api_key_hash, usage_date)
    );
    CREATE TABLE IF NOT EXISTS hot_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id TEXT NOT NULL,
      channel_name TEXT,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      matched_niche TEXT,
      matched_service TEXT
    );
    CREATE TABLE IF NOT EXISTS hot_alert_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hot_alert_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      seen INTEGER DEFAULT 0,
      digested_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS job_board_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board TEXT NOT NULL,
      listing_url TEXT UNIQUE NOT NULL,
      title TEXT,
      role_type TEXT,
      channel_ref TEXT,
      resolved_channel_id TEXT,
      posted_at TEXT,
      found_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS discovery_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_ref TEXT NOT NULL,
      resolved_channel_id TEXT,
      seed_channel_id TEXT NOT NULL,
      discovery_method TEXT NOT NULL,
      niche TEXT,
      priority INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      reject_reason TEXT,
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      enriched_at DATETIME,
      UNIQUE(channel_ref, seed_channel_id, discovery_method)
    );
  `);

  db.exec(`CREATE TABLE IF NOT EXISTS user_followup_settings (
    user_id INTEGER PRIMARY KEY,
    interval_days INTEGER DEFAULT 3,
    max_count INTEGER DEFAULT 2,
    enabled INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS power_send_jobs (
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
  )`);

  return db;
}

// ── Default settings seed ──────────────────────────────────────────────────────

async function _seedDefaultSettings() {
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
    daily_verify_limit: '500',
    youtube_quota_budget_per_key: '10000',
    graph_crawl_enabled: 'false',
    graph_crawl_daily_cap: '200',
    graph_crawl_min_subs: '1000',
    graph_crawl_max_subs: '500000',
    graph_crawl_niche_caps: '{}',
    // Empty by default (honest — no board scraped until an admin configures a
    // real, public, robots.txt-compliant RSS/JSON feed URL). Pluggable: keys
    // are arbitrary board names, e.g. {"ytjobs": "https://...", "mandy": "https://..."}.
    job_board_feed_urls: '{}',
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

  for (const [key, value] of Object.entries(defaults)) {
    if (!(_settingsCache[key] != null)) {
      try {
        const conflict = USE_PG
          ? 'ON CONFLICT (key) DO NOTHING'
          : 'OR IGNORE';
        const sql = USE_PG
          ? `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING`
          : `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`;
        await _db.run(sql, [key, value]);
        _settingsCache[key] = value;
      } catch {}
    }
  }
}

// ── Admin user creation ────────────────────────────────────────────────────────

async function _ensureAdmin() {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'harshwrites07@gmail.com';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  try {
    const existing = await _db.get('SELECT id FROM users WHERE email=?', [ADMIN_EMAIL]);
    if (!existing) {
      if (ADMIN_PASSWORD) {
        const bcrypt = require('bcryptjs');
        const hashed = bcrypt.hashSync(ADMIN_PASSWORD, 12);
        const sql = USE_PG
          ? `INSERT INTO users (email, password, full_name, plan, plan_status, is_admin, email_verified, onboarding_completed) VALUES (?, ?, 'Admin', 'agency', 'active', 1, 1, 1) ON CONFLICT DO NOTHING`
          : `INSERT OR IGNORE INTO users (email, password, full_name, plan, plan_status, is_admin, email_verified, onboarding_completed) VALUES (?, ?, 'Admin', 'agency', 'active', 1, 1, 1)`;
        await _db.run(sql, [ADMIN_EMAIL, hashed]);
        console.log(`[DB] Admin account created: ${ADMIN_EMAIL}`);
      }
    } else {
      await _db.run(
        `UPDATE users SET is_admin=1, plan='agency', plan_status='active', email_verified=1, onboarding_completed=1 WHERE email=? AND (is_admin IS NULL OR is_admin=0)`,
        [ADMIN_EMAIL]
      );
    }

    // Auto-promote any admin emails from env
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
    for (const email of adminEmails) {
      const r = await _db.run(`UPDATE users SET is_admin=1, plan='agency' WHERE email=?`, [email]);
      if (r.changes > 0) console.log(`[DB] Auto-promoted ${email} to admin`);
    }
  } catch (e) {
    console.error('[DB] _ensureAdmin error:', e.message);
  }
}

// ── Exported helper functions ──────────────────────────────────────────────────

async function getUserById(id) {
  if (!_db) return null;
  return await _db.get('SELECT * FROM users WHERE id = ?', [id]);
}

async function getUserByEmail(email) {
  if (!_db) return null;
  return await _db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
}

function getSetting(key) {
  return _settingsCache[key] ?? null;
}

function setSetting(key, value) {
  const v = typeof value === 'object' ? JSON.stringify(value) : String(value);
  _settingsCache[key] = v;
  if (!_db) return;
  const sql = USE_PG
    ? `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`
    : `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`;
  _db.run(sql, [key, v]).catch(e => console.warn('[DB] setSetting error:', e.message));
}

function logActivity(type, message, leadId = null, metadata = {}, userId = null) {
  if (!_db) return;
  _db.run(
    `INSERT INTO activities (type, message, lead_id, metadata, user_id) VALUES (?, ?, ?, ?, ?)`,
    [type, message, leadId, JSON.stringify(metadata), userId]
  ).catch(() => {});
}

// ── Session store ──────────────────────────────────────────────────────────────

class BetterSQLiteStore {
  constructor(expressSession) {
    if (USE_PG) {
      const { PgSessionStore } = require('./postgres');
      return new PgSessionStore(expressSession);
    }
    const Store = expressSession.Store;
    class _Store extends Store {
      constructor() {
        super();
        setInterval(() => {
          try { getDb()._raw.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run(); } catch {}
        }, 15 * 60 * 1000);
      }
      get(sid, cb) {
        try {
          const row = getDb()._raw.prepare("SELECT data FROM sessions WHERE session_id=? AND expires_at > datetime('now')").get(sid);
          cb(null, row ? JSON.parse(row.data) : null);
        } catch (e) { cb(e); }
      }
      set(sid, sess, cb) {
        try {
          const exp = sess.cookie?.expires
            ? new Date(sess.cookie.expires).toISOString()
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          getDb()._raw.prepare(`INSERT OR REPLACE INTO sessions (session_id,data,expires_at,created_at) VALUES (?,?,?,CURRENT_TIMESTAMP)`).run(sid, JSON.stringify(sess), exp);
          cb(null);
        } catch (e) { cb(e); }
      }
      destroy(sid, cb) {
        try { getDb()._raw.prepare('DELETE FROM sessions WHERE session_id=?').run(sid); cb(null); } catch (e) { cb(e); }
      }
      touch(sid, sess, cb) {
        try {
          const exp = sess.cookie?.expires
            ? new Date(sess.cookie.expires).toISOString()
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          getDb()._raw.prepare('UPDATE sessions SET expires_at=? WHERE session_id=?').run(exp, sid);
          cb(null);
        } catch (e) { cb(e); }
      }
    }
    return new _Store();
  }
}

const PLAN_LIMITS = {
  free:    { emails_per_month: 10,   gmail_accounts: 1,  team_seats: 1, ai_pitches: 3  },
  trial:   { emails_per_month: 300,  gmail_accounts: 1,  team_seats: 1, ai_pitches: -1 },
  starter: { emails_per_month: 500,  gmail_accounts: 1,  team_seats: 1, ai_pitches: -1 },
  pro:     { emails_per_month: 1500, gmail_accounts: 3,  team_seats: 1, ai_pitches: -1 },
  agency:  { emails_per_month: 5000, gmail_accounts: 10, team_seats: 5, ai_pitches: -1 },
};

module.exports = {
  getDb,
  initializeDatabase,
  getSetting,
  setSetting,
  logActivity,
  getUserById,
  getUserByEmail,
  BetterSQLiteStore,
  PLAN_LIMITS,
  USE_PG,
};
