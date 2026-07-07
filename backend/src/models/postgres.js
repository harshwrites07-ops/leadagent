const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway.internal')
    ? false
    : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PG] Pool error:', err.message);
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Convert SQLite-style SQL to PostgreSQL-compatible SQL
function normalizeSql(sql) {
  const hasIgnore  = /INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql);
  const hasReplace = /INSERT\s+OR\s+REPLACE\s+INTO/i.test(sql);

  let out = sql
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi,  'INSERT INTO')
    .replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'INSERT INTO')
    // datetime('now', '+X unit') / datetime('now', '-X unit')
    .replace(/datetime\s*\(\s*'now'\s*,\s*'([^']+)'\s*\)/gi, (_, offset) =>
      `NOW() + INTERVAL '${offset.replace(/^\+/, '')}'`)
    .replace(/datetime\s*\(\s*'now'\s*\)/gi, 'NOW()')
    // DATE('now', ...) / date('now')
    .replace(/[Dd][Aa][Tt][Ee]\s*\(\s*'now'\s*,\s*'([^']+)'\s*\)/g, (_, offset) =>
      `CURRENT_DATE + INTERVAL '${offset.replace(/^\+/, '')}'`)
    .replace(/[Dd][Aa][Tt][Ee]\s*\(\s*'now'\s*\)/g, 'CURRENT_DATE')
    // DATE(column) → column::date
    .replace(/DATE\s*\(\s*([\w.]+)\s*\)/g, '$1::date')
    // strftime('%Y-%m', 'now') → TO_CHAR(NOW(), 'YYYY-MM')
    .replace(/strftime\s*\(\s*'%Y-%m'\s*,\s*'now'\s*\)/gi, "TO_CHAR(NOW(), 'YYYY-MM')")
    // strftime('%Y-%m', col) → TO_CHAR(col, 'YYYY-MM')
    .replace(/strftime\s*\(\s*'%Y-%m'\s*,\s*([\w.]+)\s*\)/gi, "TO_CHAR($1, 'YYYY-MM')")
    // strftime('%H', col) → EXTRACT(HOUR FROM col)::text
    .replace(/strftime\s*\(\s*'%H'\s*,\s*([\w.]+)\s*\)/gi, 'EXTRACT(HOUR FROM $1)::text')
    // julianday('now') - julianday(col) → epoch
    .replace(/julianday\s*\(\s*'now'\s*\)\s*-\s*julianday\s*\(\s*([\w.]+)\s*\)/gi,
      'EXTRACT(EPOCH FROM (NOW() - $1::timestamp)) / 86400')
    // julianday arithmetic → epoch-based
    .replace(/julianday\s*\(\s*([\w.]+)\s*\)\s*-\s*julianday\s*\(\s*([\w.]+)\s*\)/gi,
      'EXTRACT(EPOCH FROM ($1::timestamp - $2::timestamp)) / 86400')
    // SQLite CAST to FLOAT → ::float
    .replace(/CAST\s*\(\s*(.*?)\s+AS\s+FLOAT\s*\)/gi, '($1)::float')
    // ROUND with 2 args needs ::numeric in PG
    .replace(/ROUND\s*\(\s*(.*?)\s*,\s*(\d+)\s*\)/gi, 'ROUND(($1)::numeric, $2)')
    // AUTOINCREMENT → nothing (handled in schema)
    .replace(/\s+AUTOINCREMENT/gi, '')
    // SQLite CURRENT_TIMESTAMP is fine in PG too; leave as-is
  ;

  if (hasIgnore)  out = out.trimEnd() + ' ON CONFLICT DO NOTHING';
  if (hasReplace) {
    if (/\bsessions\b/i.test(sql)) {
      out = out.trimEnd() + ' ON CONFLICT (session_id) DO UPDATE SET data=EXCLUDED.data, expires_at=EXCLUDED.expires_at';
    } else if (/\bsettings\b/i.test(sql)) {
      out = out.trimEnd() + ' ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at';
    } else if (/\bquality_leads\b/i.test(sql)) {
      out = out.trimEnd() + ` ON CONFLICT (creator_id) DO UPDATE SET
        channel_url=EXCLUDED.channel_url, channel_name=EXCLUDED.channel_name, channel_handle=EXCLUDED.channel_handle,
        subscriber_count=EXCLUDED.subscriber_count, niche=EXCLUDED.niche, email=EXCLUDED.email,
        intent_score=EXCLUDED.intent_score, intent_tier=EXCLUDED.intent_tier, meta_channel=EXCLUDED.meta_channel,
        lead_type=EXCLUDED.lead_type, schedule_break=EXCLUDED.schedule_break, break_severity=EXCLUDED.break_severity,
        tier=EXCLUDED.tier, last_refreshed_at=EXCLUDED.last_refreshed_at,
        sig_upload_frequency=EXCLUDED.sig_upload_frequency, sig_view_growth=EXCLUDED.sig_view_growth,
        sig_title_keywords=EXCLUDED.sig_title_keywords, sig_description_keywords=EXCLUDED.sig_description_keywords,
        sig_engagement=EXCLUDED.sig_engagement, sig_consistency=EXCLUDED.sig_consistency,
        source=EXCLUDED.source, updated_at=EXCLUDED.updated_at`;
    } else if (/\barchived_leads\b/i.test(sql)) {
      out = out.trimEnd() + ` ON CONFLICT (creator_id) DO UPDATE SET
        channel_name=EXCLUDED.channel_name, subscriber_count=EXCLUDED.subscriber_count, niche=EXCLUDED.niche,
        email=EXCLUDED.email, intent_score=EXCLUDED.intent_score, intent_tier=EXCLUDED.intent_tier,
        archived_reason=EXCLUDED.archived_reason, archived_at=EXCLUDED.archived_at`;
    } else if (/\buser_followup_settings\b/i.test(sql)) {
      out = out.trimEnd() + ' ON CONFLICT (user_id) DO UPDATE SET interval_days=EXCLUDED.interval_days, max_count=EXCLUDED.max_count, enabled=EXCLUDED.enabled, updated_at=EXCLUDED.updated_at';
    } else if (/\bpitches\b/i.test(sql)) {
      // Call sites write different column subsets — only SET the columns this
      // specific INSERT provides. EXCLUDED.col for an unlisted column would
      // resolve to that column's default (usually NULL), clobbering existing
      // data on conflict instead of leaving it alone.
      const colMatch = sql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+pitches\s*\(([^)]+)\)/i);
      const cols = colMatch ? colMatch[1].split(',').map(c => c.trim()).filter(Boolean) : [];
      const updateCols = cols.filter(c => c.toLowerCase() !== 'lead_id');
      const setParts = updateCols.map(c => `${c}=EXCLUDED.${c}`);
      if (!cols.some(c => c.toLowerCase() === 'updated_at')) setParts.push('updated_at=CURRENT_TIMESTAMP');
      out = out.trimEnd() + ` ON CONFLICT (lead_id) DO UPDATE SET ${setParts.join(', ')}`;
    } else {
      out = out.trimEnd() + ' ON CONFLICT DO NOTHING';
    }
  }

  return out;
}

function convertQuery(sql, params = []) {
  let i = 0;
  const pgSql = normalizeSql(sql).replace(/\?/g, () => `$${++i}`);
  return { sql: pgSql, params };
}

async function run(sql, params = []) {
  const { sql: pgSql, params: pgParams } = convertQuery(sql, Array.isArray(params) ? params : [params]);
  const result = await query(pgSql, pgParams);
  return { lastID: result.rows[0]?.id, changes: result.rowCount };
}

async function get(sql, params = []) {
  const { sql: pgSql, params: pgParams } = convertQuery(sql, Array.isArray(params) ? params : [params]);
  const result = await query(pgSql, pgParams);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const { sql: pgSql, params: pgParams } = convertQuery(sql, Array.isArray(params) ? params : [params]);
  const result = await query(pgSql, pgParams);
  return result.rows;
}

// PG session store (drop-in for BetterSQLiteStore)
class PgSessionStore {
  constructor(expressSession) {
    const Store = expressSession.Store;
    class _Store extends Store {
      constructor() {
        super();
        setInterval(async () => {
          try { await query("DELETE FROM sessions WHERE expires_at < NOW()"); } catch {}
        }, 15 * 60 * 1000);
      }
      async get(sid, cb) {
        try {
          const result = await query("SELECT data FROM sessions WHERE session_id=$1 AND expires_at > NOW()", [sid]);
          cb(null, result.rows[0] ? JSON.parse(result.rows[0].data) : null);
        } catch (e) { cb(e); }
      }
      async set(sid, sess, cb) {
        try {
          const exp = sess.cookie?.expires
            ? new Date(sess.cookie.expires).toISOString()
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          await query(
            `INSERT INTO sessions (session_id, data, expires_at) VALUES ($1,$2,$3)
             ON CONFLICT (session_id) DO UPDATE SET data=EXCLUDED.data, expires_at=EXCLUDED.expires_at`,
            [sid, JSON.stringify(sess), exp]
          );
          cb(null);
        } catch (e) { cb(e); }
      }
      async destroy(sid, cb) {
        try { await query("DELETE FROM sessions WHERE session_id=$1", [sid]); cb(null); }
        catch (e) { cb(e); }
      }
      async touch(sid, sess, cb) {
        try {
          const exp = sess.cookie?.expires
            ? new Date(sess.cookie.expires).toISOString()
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          await query("UPDATE sessions SET expires_at=$1 WHERE session_id=$2", [exp, sid]);
          cb(null);
        } catch (e) { cb(e); }
      }
    }
    return new _Store();
  }
}

async function initPostgres() {
  console.log('[PG] Initializing PostgreSQL...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
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
        usage_reset_date TEXT DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::date::text,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP,
        profile_picture TEXT,
        onboarding_completed INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0,
        login_attempts INTEGER DEFAULT 0,
        lockout_until TIMESTAMP,
        target_niches TEXT DEFAULT '[]',
        target_platforms TEXT DEFAULT '[]',
        portfolio_url TEXT DEFAULT '',
        daily_email_limit INTEGER DEFAULT 50,
        auto_find_leads INTEGER DEFAULT 0,
        email_tone TEXT DEFAULT 'casual',
        outreach_goal TEXT DEFAULT 'get_reply',
        min_email_delay INTEGER DEFAULT 45,
        max_email_delay INTEGER DEFAULT 120,
        followups_enabled INTEGER DEFAULT 1,
        max_followups INTEGER DEFAULT 3,
        followup_delay_days INTEGER DEFAULT 3,
        best_result TEXT DEFAULT '',
        pricing_range TEXT DEFAULT '$500-$2000/month',
        service_type TEXT,
        one_liner TEXT,
        experience_years TEXT,
        personality_traits TEXT DEFAULT '[]',
        origin_story TEXT,
        unique_difference TEXT,
        voice_dna TEXT DEFAULT '{}',
        profile_completed INTEGER DEFAULT 0,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        trial_ends_at TIMESTAMP DEFAULT (NOW() + INTERVAL '14 days'),
        billing_cycle_start TIMESTAMP DEFAULT NOW(),
        custom_emails_limit INTEGER,
        custom_leads_limit INTEGER
      )
    `);
    console.log('[PG] ✅ users');

    await query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ sessions');

    await query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
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
        follow_up_count INTEGER DEFAULT 0,
        last_contacted_date TEXT,
        next_follow_up_date TEXT,
        follow_up_status TEXT DEFAULT 'active',
        email_invalid INTEGER DEFAULT 0,
        bounce_reason TEXT,
        exported_at TIMESTAMP,
        scrape_source TEXT DEFAULT 'youtube_api',
        view_trend TEXT,
        intent_score REAL,
        intent_confidence TEXT,
        intent_reason TEXT,
        intent_signals TEXT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ leads');

    await query(`
      CREATE TABLE IF NOT EXISTS pitches (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        deep_study TEXT,
        custom_offer TEXT,
        cold_email TEXT,
        email_subject TEXT,
        reddit_dm TEXT,
        subject_variants TEXT DEFAULT '[]',
        pitch_score INTEGER,
        pitch_feedback TEXT,
        signal_type TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ pitches');

    await query(`
      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT,
        body TEXT,
        status TEXT DEFAULT 'queued',
        sent_at TIMESTAMP,
        opened_at TIMESTAMP,
        clicked_at TIMESTAMP,
        replied_at TIMESTAMP,
        follow_up_number INTEGER DEFAULT 0,
        tracking_id TEXT UNIQUE,
        bounce_reason TEXT,
        from_email TEXT,
        reply_body TEXT,
        reply_subject TEXT,
        reply_from TEXT,
        my_reply_body TEXT,
        my_reply_sent_at TEXT,
        angle_type TEXT,
        campaign_id INTEGER,
        reply_sentiment TEXT,
        call_booked INTEGER DEFAULT 0,
        client_closed INTEGER DEFAULT 0,
        client_value REAL DEFAULT 0,
        ab_variant TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ emails');

    await query(`
      CREATE TABLE IF NOT EXISTS email_queue (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        email_id INTEGER,
        subject TEXT,
        body TEXT,
        status TEXT DEFAULT 'pending',
        scheduled_at TIMESTAMP,
        sent_at TIMESTAMP,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ email_queue');

    await query(`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        lead_id INTEGER,
        metadata TEXT DEFAULT '{}',
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ activities');

    await query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ notes');

    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ settings');

    await query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        type TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ otp_codes');

    await query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ password_reset_tokens');

    await query(`
      CREATE TABLE IF NOT EXISTS gmail_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_expiry BIGINT,
        status TEXT DEFAULT 'active',
        emails_sent_today INTEGER DEFAULT 0,
        last_reset_date TEXT DEFAULT CURRENT_DATE::text,
        daily_limit INTEGER DEFAULT 500,
        connected_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, email)
      )
    `);
    console.log('[PG] ✅ gmail_accounts');

    await query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
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
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ campaigns');

    await query(`
      CREATE TABLE IF NOT EXISTS campaign_leads (
        id SERIAL PRIMARY KEY,
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
        email_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(campaign_id, lead_id)
      )
    `);
    console.log('[PG] ✅ campaign_leads');

    await query(`
      CREATE TABLE IF NOT EXISTS master_leads (
        id SERIAL PRIMARY KEY,
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
        scraped_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ master_leads');

    await query(`
      CREATE TABLE IF NOT EXISTS quality_leads (
        id SERIAL PRIMARY KEY,
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
        outreached_at TIMESTAMP,
        reply_received INTEGER DEFAULT 0,
        call_booked INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ quality_leads');

    await query(`
      CREATE TABLE IF NOT EXISTS archived_leads (
        id SERIAL PRIMARY KEY,
        creator_id TEXT UNIQUE NOT NULL,
        channel_name TEXT,
        subscriber_count INTEGER DEFAULT 0,
        niche TEXT,
        email TEXT,
        intent_score REAL DEFAULT 0,
        intent_tier TEXT DEFAULT 'COLD',
        archived_reason TEXT DEFAULT 'below_threshold',
        archived_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ archived_leads');

    await query(`
      CREATE TABLE IF NOT EXISTS scraper_logs (
        id SERIAL PRIMARY KEY,
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
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);
    console.log('[PG] ✅ scraper_logs');

    await query(`
      CREATE TABLE IF NOT EXISTS scraper_health (
        id SERIAL PRIMARY KEY,
        scraper TEXT NOT NULL,
        run_at TIMESTAMP DEFAULT NOW(),
        attempted INTEGER DEFAULT 0,
        succeeded INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        sample_error TEXT
      )
    `);
    console.log('[PG] ✅ scraper_health');

    await query(`
      CREATE TABLE IF NOT EXISTS scraper_health_alerts (
        id SERIAL PRIMARY KEY,
        scraper TEXT NOT NULL,
        detected_at TIMESTAMP DEFAULT NOW(),
        success_rate REAL,
        attempted INTEGER,
        resolved INTEGER DEFAULT 0
      )
    `);
    console.log('[PG] ✅ scraper_health_alerts');

    await query(`
      CREATE TABLE IF NOT EXISTS buying_signals (
        id SERIAL PRIMARY KEY,
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
        quality_lead_id INTEGER,
        processed INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ buying_signals');

    await query(`
      CREATE TABLE IF NOT EXISTS platform_signals (
        id SERIAL PRIMARY KEY,
        creator_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        signal_text TEXT,
        signal_url TEXT,
        confidence REAL DEFAULT 0.5,
        budget_mentioned INTEGER DEFAULT 0,
        found_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(creator_id, platform, signal_url)
      )
    `);
    console.log('[PG] ✅ platform_signals');

    await query(`
      CREATE TABLE IF NOT EXISTS creator_profiles (
        creator_id TEXT PRIMARY KEY,
        channel_name TEXT,
        youtube_score REAL DEFAULT 0,
        platform_score REAL DEFAULT 0,
        combined_score REAL DEFAULT 0,
        tier TEXT DEFAULT 'COLD',
        signals_found INTEGER DEFAULT 0,
        confirmed_hiring INTEGER DEFAULT 0,
        last_updated TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ creator_profiles');

    await query(`
      CREATE TABLE IF NOT EXISTS upwork_signals (
        id SERIAL PRIMARY KEY,
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
        found_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ upwork_signals');

    await query(`
      CREATE TABLE IF NOT EXISTS power_send_jobs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'running',
        total INTEGER DEFAULT 0,
        studied INTEGER DEFAULT 0,
        generated INTEGER DEFAULT 0,
        sent INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        settings TEXT DEFAULT '{}',
        log TEXT DEFAULT '[]',
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);
    console.log('[PG] ✅ power_send_jobs');

    await query(`
      CREATE TABLE IF NOT EXISTS seeder_keyword_tokens (
        keyword TEXT NOT NULL,
        api_key_hash TEXT NOT NULL,
        next_page_token TEXT,
        pages_done INTEGER DEFAULT 0,
        zero_result_streak INTEGER DEFAULT 0,
        last_used TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (keyword, api_key_hash)
      )
    `);
    try { await query(`ALTER TABLE seeder_keyword_tokens ADD COLUMN IF NOT EXISTS zero_result_streak INTEGER DEFAULT 0`); } catch {}
    console.log('[PG] ✅ seeder_keyword_tokens');

    await query(`
      CREATE TABLE IF NOT EXISTS user_followup_settings (
        user_id INTEGER PRIMARY KEY,
        interval_days INTEGER DEFAULT 3,
        max_count INTEGER DEFAULT 2,
        enabled INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ user_followup_settings');

    await query(`
      CREATE TABLE IF NOT EXISTS quality_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        channel_id TEXT,
        score INTEGER,
        passed INTEGER DEFAULT 0,
        regenerated INTEGER DEFAULT 0,
        breakdown JSONB DEFAULT '{}',
        attempt_number INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    try { await query(`ALTER TABLE quality_log ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1`); } catch {}
    console.log('[PG] ✅ quality_log');

    // Quality gate columns on pitches (safe migrations)
    try { await query(`ALTER TABLE pitches ADD COLUMN IF NOT EXISTS quality_score INTEGER`); } catch {}
    try { await query(`ALTER TABLE pitches ADD COLUMN IF NOT EXISTS quality_breakdown TEXT`); } catch {}
    try { await query(`ALTER TABLE pitches ADD COLUMN IF NOT EXISTS quality_regenerated INTEGER DEFAULT 0`); } catch {}
    try { await query(`ALTER TABLE pitches ADD COLUMN IF NOT EXISTS quality_warning INTEGER DEFAULT 0`); } catch {}

    // Quality upgrade: recent video title + named case study
    try { await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS recent_video_title TEXT`); } catch {}
    try { await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS case_study TEXT`); } catch {}

    // video_data_status distinguishes "not fetched yet" (NULL) from a fetch
    // that ran and either succeeded ('ok'), failed transiently
    // ('fetch_failed' — quota/timeout, safe to retry), or hit a dead channel
    // ('channel_gone' — deleted/private, should not be retried).
    try { await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS video_data_status TEXT`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS idx_leads_video_data_status ON leads(video_data_status)`); } catch {}
    try { await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS video_fetch_attempts INTEGER DEFAULT 0`); } catch {}

    // email_corrupt flags a row whose email column is an image/asset-filename
    // false positive from the old extractEmail() regex bug — see purgeCorruptEmails.js.
    try { await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_corrupt INTEGER DEFAULT 0`); } catch {}
    try { await query(`ALTER TABLE master_leads ADD COLUMN IF NOT EXISTS email_corrupt INTEGER DEFAULT 0`); } catch {}
    try { await query(`ALTER TABLE quality_leads ADD COLUMN IF NOT EXISTS email_corrupt INTEGER DEFAULT 0`); } catch {}
    try { await query(`ALTER TABLE archived_leads ADD COLUMN IF NOT EXISTS email_corrupt INTEGER DEFAULT 0`); } catch {}
    try { await query(`ALTER TABLE master_leads ADD COLUMN IF NOT EXISTS meta_channel INTEGER DEFAULT 0`); } catch {}
    try { await query(`ALTER TABLE quality_leads ADD COLUMN IF NOT EXISTS meta_channel INTEGER DEFAULT 0`); } catch {}
    try { await query(`ALTER TABLE master_leads ADD COLUMN IF NOT EXISTS lead_type TEXT`); } catch {}
    try { await query(`ALTER TABLE master_leads ADD COLUMN IF NOT EXISTS schedule_break INTEGER DEFAULT 0`); } catch {}
    try { await query(`ALTER TABLE master_leads ADD COLUMN IF NOT EXISTS break_severity REAL`); } catch {}
    try { await query(`ALTER TABLE quality_leads ADD COLUMN IF NOT EXISTS lead_type TEXT`); } catch {}
    try { await query(`ALTER TABLE quality_leads ADD COLUMN IF NOT EXISTS schedule_break INTEGER DEFAULT 0`); } catch {}
    try { await query(`ALTER TABLE quality_leads ADD COLUMN IF NOT EXISTS break_severity REAL`); } catch {}
    try { await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'unchecked'`); } catch {}
    try { await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_checked_at TEXT`); } catch {}
    try { await query(`ALTER TABLE master_leads ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'unchecked'`); } catch {}
    try { await query(`ALTER TABLE master_leads ADD COLUMN IF NOT EXISTS email_checked_at TEXT`); } catch {}
    try { await query(`ALTER TABLE quality_leads ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'unchecked'`); } catch {}
    try { await query(`ALTER TABLE quality_leads ADD COLUMN IF NOT EXISTS email_checked_at TEXT`); } catch {}
    try { await query(`ALTER TABLE master_leads ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMP`); } catch {}
    try { await query(`ALTER TABLE master_leads ADD COLUMN IF NOT EXISTS tier TEXT`); } catch {}
    try { await query(`ALTER TABLE quality_leads ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMP`); } catch {}
    try { await query(`ALTER TABLE quality_leads ADD COLUMN IF NOT EXISTS tier TEXT`); } catch {}
    try { await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS hot_alert_digest_enabled INTEGER DEFAULT 1`); } catch {}

    await query(`
      CREATE TABLE IF NOT EXISTS quota_usage (
        api_key_hash TEXT NOT NULL,
        usage_date TEXT NOT NULL,
        units_used INTEGER DEFAULT 0,
        PRIMARY KEY (api_key_hash, usage_date)
      )
    `);
    console.log('[PG] ✅ quota_usage');

    await query(`
      CREATE TABLE IF NOT EXISTS hot_alerts (
        id SERIAL PRIMARY KEY,
        creator_id TEXT NOT NULL,
        channel_name TEXT,
        detected_at TIMESTAMP DEFAULT NOW(),
        matched_niche TEXT,
        matched_service TEXT
      )
    `);
    console.log('[PG] ✅ hot_alerts');

    await query(`
      CREATE TABLE IF NOT EXISTS hot_alert_notifications (
        id SERIAL PRIMARY KEY,
        hot_alert_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        seen INTEGER DEFAULT 0,
        digested_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ hot_alert_notifications');

    await query(`
      CREATE TABLE IF NOT EXISTS video_description_snapshots (
        id SERIAL PRIMARY KEY,
        channel_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        description_hash TEXT NOT NULL,
        credits_json TEXT DEFAULT '{}',
        captured_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ video_description_snapshots');
    try { await query(`CREATE INDEX IF NOT EXISTS idx_video_snapshots_channel ON video_description_snapshots(channel_id)`); } catch {}

    await query(`
      CREATE TABLE IF NOT EXISTS job_board_listings (
        id SERIAL PRIMARY KEY,
        board TEXT NOT NULL,
        listing_url TEXT UNIQUE NOT NULL,
        title TEXT,
        role_type TEXT,
        channel_ref TEXT,
        resolved_channel_id TEXT,
        posted_at TEXT,
        found_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[PG] ✅ job_board_listings');

    await query(`
      CREATE TABLE IF NOT EXISTS discovery_queue (
        id SERIAL PRIMARY KEY,
        channel_ref TEXT NOT NULL,
        resolved_channel_id TEXT,
        seed_channel_id TEXT NOT NULL,
        discovery_method TEXT NOT NULL,
        niche TEXT,
        priority INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        reject_reason TEXT,
        discovered_at TIMESTAMP DEFAULT NOW(),
        enriched_at TIMESTAMP,
        UNIQUE(channel_ref, seed_channel_id, discovery_method)
      )
    `);
    console.log('[PG] ✅ discovery_queue');

    // Per-user unique indexes
    try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_channel_id_user ON leads(channel_id, user_id) WHERE channel_id IS NOT NULL AND channel_id != ''`); } catch {}
    try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_handle_user ON leads(channel_handle, user_id) WHERE channel_handle IS NOT NULL AND channel_handle != ''`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id)`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id)`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id)`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS idx_pitches_user_id ON pitches(user_id)`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS idx_master_niche ON master_leads(niche)`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS idx_master_email ON master_leads(email)`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS idx_quality_leads_score ON quality_leads(intent_score DESC)`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS idx_quality_leads_niche ON quality_leads(niche)`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS idx_quality_log_user_id ON quality_log(user_id)`); } catch {}

    // Column migrations — safe: errors mean column already exists
    const pgAlter = async (sql) => { try { await query(sql); } catch {} };
    await pgAlter(`ALTER TABLE users ADD COLUMN razorpay_customer_id TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN razorpay_subscription_id TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN trial_ends_at TIMESTAMP DEFAULT (NOW() + INTERVAL '14 days')`);
    await pgAlter(`ALTER TABLE users ADD COLUMN billing_cycle_start TIMESTAMP DEFAULT NOW()`);
    await pgAlter(`ALTER TABLE users ADD COLUMN custom_emails_limit INTEGER`);
    await pgAlter(`ALTER TABLE users ADD COLUMN custom_leads_limit INTEGER`);
    await pgAlter(`ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0`);
    await pgAlter(`ALTER TABLE users ADD COLUMN service_type TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN one_liner TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN experience_years TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN personality_traits TEXT DEFAULT '[]'`);
    await pgAlter(`ALTER TABLE users ADD COLUMN origin_story TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN unique_difference TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN voice_dna TEXT DEFAULT '{}'`);
    await pgAlter(`ALTER TABLE users ADD COLUMN profile_completed INTEGER DEFAULT 0`);
    await pgAlter(`ALTER TABLE users ADD COLUMN voice_sample_1 TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN voice_sample_2 TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN voice_sample_3 TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN voice_confidence_register TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN voice_sentence_style TEXT`);
    await pgAlter(`ALTER TABLE users ADD COLUMN voice_dna_version INTEGER DEFAULT 1`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN user_id INTEGER REFERENCES users(id)`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN follow_up_count INTEGER DEFAULT 0`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN last_contacted_date TEXT`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN next_follow_up_date TEXT`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN follow_up_status TEXT DEFAULT 'active'`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN email_invalid INTEGER DEFAULT 0`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN bounce_reason TEXT`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN exported_at TIMESTAMP`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN scrape_source TEXT DEFAULT 'youtube_api'`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN view_trend TEXT`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN intent_score REAL`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN intent_confidence TEXT`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN intent_reason TEXT`);
    await pgAlter(`ALTER TABLE leads ADD COLUMN intent_signals TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN from_email TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN reply_body TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN reply_subject TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN reply_from TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN my_reply_body TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN my_reply_sent_at TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN angle_type TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN reply_sentiment TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN call_booked INTEGER DEFAULT 0`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN client_closed INTEGER DEFAULT 0`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN client_value REAL DEFAULT 0`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN ab_variant TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN user_id INTEGER REFERENCES users(id)`);
    await pgAlter(`ALTER TABLE email_queue ADD COLUMN signal_snapshot TEXT`);
    await pgAlter(`ALTER TABLE emails ADD COLUMN signal_snapshot TEXT`);
    await pgAlter(`ALTER TABLE pitches ADD COLUMN signal_type TEXT`);
    await pgAlter(`ALTER TABLE pitches ADD COLUMN user_id INTEGER REFERENCES users(id)`);
    // Distinguishes a real Marcus/AI-generated pitch from buildFallback()'s
    // canned template — see database.js for the incident this was added for.
    await pgAlter(`ALTER TABLE pitches ADD COLUMN generation_method TEXT DEFAULT 'marcus'`);
    // token_expiry is ms-epoch from Google — exceeds INTEGER max, must be BIGINT
    try { await query(`ALTER TABLE gmail_accounts ALTER COLUMN token_expiry TYPE BIGINT`); } catch {}
    console.log('[PG] ✅ migrations applied');

    console.log('[PG] ✅ ALL TABLES READY');
    return true;
  } catch (err) {
    console.error('[PG] ❌ Init failed:', err.message);
    throw err;
  }
}

module.exports = { pool, query, run, get, all, initPostgres, convertQuery, normalizeSql, PgSessionStore };
