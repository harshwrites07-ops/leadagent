const express = require('express');
const router = express.Router();
const path = require('path');
const { asyncHandler } = require('../middleware/errorHandler');
const { getDb, getSetting, setSetting, logActivity } = require('../models/database');
const { FAST_MODEL, SMART_MODEL, getGeminiKey, getGeminiKeys, makeGeminiModel, checkAiAvailability } = require('../services/claudeService');
const { getAllKeys: getYtKeys, isQuotaExhausted } = require('../services/youtubeService');

const ENV_PATH = path.join(__dirname, '../../../.env');

function getGeminiChat(systemPrompt) {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const key = getGeminiKey();
  if (!key) return null;
  // Jack uses Flash — fast responses, strong tool use
  return makeGeminiModel(key, FAST_MODEL, systemPrompt);
}

// ── Tools ─────────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_stats',
    description: 'Get full dashboard stats: total leads, hot/warm/cold counts, emails sent, replies, closed won, pitches generated, added today.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_leads',
    description: 'List a sample of leads (max 100). For full database operations use full_database_report or mass_delete_leads.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        temperature: { type: 'string', enum: ['hot', 'warm', 'cold'] },
        stage: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_leads_bulk',
    description: 'Get up to 500 leads at once for full-database operations.',
    input_schema: {
      type: 'object',
      properties: {
        temperature: { type: 'string', enum: ['hot', 'warm', 'cold'] },
        stage: { type: 'string' },
        has_email: { type: 'boolean' },
        limit: { type: 'number', description: 'Max 500' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'search_youtube',
    description: 'Search YouTube for one keyword. Saves channels with emails to CRM.',
    input_schema: {
      type: 'object',
      required: ['keyword'],
      properties: {
        keyword: { type: 'string' },
        minSubs: { type: 'number' },
        maxSubs: { type: 'number' },
        maxResults: { type: 'number' },
      },
    },
  },
  {
    name: 'scrape_bulk',
    description: 'Scrape multiple YouTube keywords at once. Up to 8 keywords in parallel.',
    input_schema: {
      type: 'object',
      required: ['keywords'],
      properties: {
        keywords: { type: 'array', items: { type: 'string' } },
        minSubs: { type: 'number' },
        maxSubs: { type: 'number' },
        maxResultsPerKeyword: { type: 'number' },
      },
    },
  },
  {
    name: 'trigger_niche_hunt',
    description: 'Start a targeted niche hunt scraper for a specific niche. Available niches: Business, Finance, Real Estate, Fitness, SaaS & Tech, Law, Health, Education, Podcasters.',
    input_schema: {
      type: 'object',
      required: ['niche'],
      properties: {
        niche: { type: 'string', description: 'One of: Business, Finance, Real Estate, Fitness, SaaS & Tech, Law, Health, Education, Podcasters' },
        target: { type: 'number', description: 'Target number of leads (default 50)' },
      },
    },
  },
  {
    name: 'trigger_powermode',
    description: 'Start PowerMode — searches 15 high-value keywords simultaneously to flood the CRM with leads.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'analyze_channel',
    description: 'Deep-analyze a YouTube channel by URL — generates full analysis + personalized cold email.',
    input_schema: {
      type: 'object',
      required: ['url'],
      properties: { url: { type: 'string' } },
    },
  },
  {
    name: 'generate_pitch',
    description: 'Generate a personalized cold email pitch for one lead by ID. Fast — single AI call.',
    input_schema: {
      type: 'object',
      required: ['lead_id'],
      properties: { lead_id: { type: 'number' } },
    },
  },
  {
    name: 'bulk_generate_pitches',
    description: 'Generate personalized pitches for multiple leads. Runs 5 at a time in parallel. Use for "pitch all hot leads", "generate pitches for 20 leads", etc.',
    input_schema: {
      type: 'object',
      required: ['lead_ids'],
      properties: {
        lead_ids: { type: 'array', items: { type: 'number' } },
      },
    },
  },
  {
    name: 'find_and_pitch',
    description: 'Find leads for keywords AND generate pitches for them in one shot. Best for "find and pitch fitness coaches".',
    input_schema: {
      type: 'object',
      required: ['keywords'],
      properties: {
        keywords: { type: 'array', items: { type: 'string' } },
        minSubs: { type: 'number' },
        maxSubs: { type: 'number' },
        maxResultsPerKeyword: { type: 'number' },
      },
    },
  },
  {
    name: 'send_emails',
    description: 'Study leads, generate personalized emails, and SEND them — all in one shot. Use for "send emails to X leads", "email warm leads", "send 50 hot lead emails", etc. Automatically selects leads with emails, generates pitches, and fires them. Returns count sent.',
    input_schema: {
      type: 'object',
      properties: {
        temperature: { type: 'string', enum: ['hot', 'warm', 'cold'] },
        stage: { type: 'string', description: 'CRM stage filter (default: new_lead or pitch_ready)' },
        limit: { type: 'number', description: 'How many to email. Max 20 per batch.' },
      },
    },
  },
  {
    name: 'send_followup_emails',
    description: 'Auto-generate and send follow-up emails to leads that were emailed but never replied. Use for "follow up with emailed leads", "send follow-ups to silent leads", etc.',
    input_schema: {
      type: 'object',
      properties: {
        days_since_email: { type: 'number', description: 'Only follow up leads emailed at least this many days ago (default: 3)' },
        limit: { type: 'number', description: 'Max leads to follow up (default: 15, max: 30)' },
        followup_number: { type: 'number', description: 'Which follow-up this is: 1, 2, or 3 (default: 1)' },
      },
    },
  },
  {
    name: 'get_email_queue',
    description: 'Check the email queue — how many pending, sent today, failed, and daily limit remaining.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'control_queue',
    description: 'Pause or resume the email sending queue.',
    input_schema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['pause', 'resume'], description: 'pause or resume the queue' },
      },
    },
  },
  {
    name: 'set_setting',
    description: 'Change an app setting: daily_send_limit, your_name, agency_name, portfolio_url. Use to adjust daily email limit etc.',
    input_schema: {
      type: 'object',
      required: ['key', 'value'],
      properties: {
        key: { type: 'string', enum: ['daily_send_limit', 'your_name', 'agency_name', 'portfolio_url', 'auto_scrape'] },
        value: { type: 'string' },
      },
    },
  },
  {
    name: 'move_lead',
    description: 'Move a lead to a different CRM stage.',
    input_schema: {
      type: 'object',
      required: ['lead_id', 'stage'],
      properties: {
        lead_id: { type: 'number' },
        stage: { type: 'string', enum: ['new_lead', 'studying', 'pitch_ready', 'emailed', 'opened', 'replied', 'call_booked', 'closed_won', 'closed_lost'] },
      },
    },
  },
  {
    name: 'delete_lead',
    description: 'Delete one lead by ID.',
    input_schema: {
      type: 'object',
      required: ['lead_id'],
      properties: { lead_id: { type: 'number' } },
    },
  },
  {
    name: 'mass_delete_leads',
    description: 'Permanently delete ALL leads matching a filter across the ENTIRE database. No limit — deletes every matching row.',
    input_schema: {
      type: 'object',
      required: ['filter'],
      properties: {
        filter: {
          type: 'string',
          enum: ['no_email', 'cold_stage_only', 'inactive_90days', 'duplicates', 'all_cold_temperature'],
        },
        dry_run: { type: 'boolean', description: 'If true, only count — do not delete' },
      },
    },
  },
  {
    name: 'get_automation_status',
    description: 'Check auto-scrape status, last run, leads found today, API key pool status.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'toggle_automation',
    description: 'Turn auto lead scraping on or off.',
    input_schema: {
      type: 'object',
      required: ['enabled'],
      properties: { enabled: { type: 'boolean' } },
    },
  },
  {
    name: 'daily_briefing',
    description: 'Full daily briefing: leads found today, pitches generated, emails sent, replies, top hot leads to contact right now.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'full_database_report',
    description: 'Full database report — total counts, by temperature, stage, niche. Operates on ALL leads, no pagination.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'clean_dead_leads',
    description: 'Archive or delete leads without emails, inactive 90+ days.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['archive', 'delete'] },
      },
    },
  },
  {
    name: 'export_leads_csv',
    description: 'Export all leads (or filtered) to a CSV string. Returns the CSV content directly.',
    input_schema: {
      type: 'object',
      properties: {
        temperature: { type: 'string', enum: ['hot', 'warm', 'cold'] },
        stage: { type: 'string' },
        has_email: { type: 'boolean' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'archive_cold_leads',
    description: 'Move all cold-temperature new_lead stage leads to closed_lost (archive them). Frees up CRM.',
    input_schema: {
      type: 'object',
      properties: {
        dry_run: { type: 'boolean', description: 'If true, only count — do not archive' },
      },
    },
  },
  {
    name: 'backup_database',
    description: 'Get a full database summary: total counts, emails sent, pitches, all CRM stages.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'clear_failed_emails',
    description: 'Delete all failed emails from the email queue.',
    input_schema: {
      type: 'object',
      properties: {
        dry_run: { type: 'boolean' },
      },
    },
  },
  {
    name: 'show_best_subjects',
    description: 'Show the top email subject lines by open rate. Reveals what subject patterns actually work.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many to show (default 10)' },
      },
    },
  },
  {
    name: 'power_follow_up',
    description: 'Send follow-up emails to all leads due for follow-up (3-day cadence, 5 steps max). Returns count sent.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max leads to follow up (default 30)' },
      },
    },
  },
  {
    name: 'show_follow_up_status',
    description: 'Show follow-up pipeline: how many leads are at each step (FU1-FU5), overdue, completed.',
    input_schema: { type: 'object', properties: {} },
  },
];

// Gemini uses `parameters` not `input_schema`
const GEMINI_TOOLS = TOOLS.map(t => ({
  name: t.name,
  description: t.description,
  parameters: t.input_schema,
}));

// ── Tool executor ─────────────────────────────────────────────────────────────
const LEAD_INSERT_SQL = `
  INSERT OR IGNORE INTO leads
    (user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
     avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
     last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
     country, email, website, social_links, thumbnail_url, pain_points, lead_score, temperature, crm_stage)
  VALUES
    (@user_id, @platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @total_videos,
     @avg_views, @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days,
     @last_upload_date, @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
     @country, @email, @website, @social_links, @thumbnail_url, @pain_points, @lead_score, @temperature, 'new_lead')
`;

async function runTool(name, input, userId) {
  const db = getDb();

  switch (name) {

    case 'get_stats': {
      const row = db.prepare(`
        SELECT COUNT(*) as total_leads,
          SUM(CASE WHEN temperature='hot' THEN 1 ELSE 0 END) as hot,
          SUM(CASE WHEN temperature='warm' THEN 1 ELSE 0 END) as warm,
          SUM(CASE WHEN temperature='cold' THEN 1 ELSE 0 END) as cold,
          SUM(CASE WHEN crm_stage='closed_won' THEN 1 ELSE 0 END) as closed_won,
          SUM(CASE WHEN crm_stage='replied' THEN 1 ELSE 0 END) as replied,
          SUM(CASE WHEN crm_stage='emailed' THEN 1 ELSE 0 END) as emailed,
          SUM(CASE WHEN email IS NOT NULL AND email!='' THEN 1 ELSE 0 END) as with_email
        FROM leads WHERE user_id=?`).get(userId);
      const sent = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE user_id=? AND status='sent'`).get(userId);
      const today = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE user_id=? AND date(created_at)=date('now')`).get(userId);
      const pitches = db.prepare(`SELECT COUNT(*) as n FROM pitches WHERE lead_id IN (SELECT id FROM leads WHERE user_id=?)`).get(userId);
      return { ...row, emails_sent: sent?.n || 0, added_today: today?.n || 0, pitches_generated: pitches?.n || 0 };
    }

    case 'get_leads': {
      let q = `SELECT id,channel_name,subscriber_count,avg_views,engagement_rate,temperature,crm_stage,email,lead_score,channel_handle FROM leads WHERE user_id=?`;
      const params = [userId];
      if (input.search)      { q += ' AND channel_name LIKE ?'; params.push(`%${input.search}%`); }
      if (input.temperature) { q += ' AND temperature=?'; params.push(input.temperature); }
      if (input.stage)       { q += ' AND crm_stage=?'; params.push(input.stage); }
      q += ' ORDER BY lead_score DESC LIMIT ?';
      params.push(Math.min(input.limit || 25, 100));
      const leads = db.prepare(q).all(...params);
      const total = db.prepare('SELECT COUNT(*) as n FROM leads WHERE user_id=?').get(userId);
      return { leads, shown: leads.length, total_in_db: total.n };
    }

    case 'get_leads_bulk': {
      let q = `SELECT id,channel_name,subscriber_count,avg_views,engagement_rate,temperature,crm_stage,email,lead_score,channel_handle,created_at FROM leads WHERE user_id=?`;
      const params = [userId];
      if (input.temperature) { q += ' AND temperature=?'; params.push(input.temperature); }
      if (input.stage)       { q += ' AND crm_stage=?'; params.push(input.stage); }
      if (input.has_email === true)  { q += ' AND email IS NOT NULL AND email != ""'; }
      if (input.has_email === false) { q += ' AND (email IS NULL OR email = "")'; }
      q += ' ORDER BY lead_score DESC LIMIT ? OFFSET ?';
      params.push(Math.min(input.limit || 200, 500), input.offset || 0);
      const leads = db.prepare(q).all(...params);
      const total = db.prepare('SELECT COUNT(*) as n FROM leads WHERE user_id=?').get(userId);
      return { leads, shown: leads.length, total_in_db: total.n, offset: input.offset || 0 };
    }

    case 'full_database_report': {
      const totals = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as with_email,
          SUM(CASE WHEN email IS NULL OR email = '' THEN 1 ELSE 0 END) as no_email,
          SUM(CASE WHEN temperature='hot' THEN 1 ELSE 0 END) as hot,
          SUM(CASE WHEN temperature='warm' THEN 1 ELSE 0 END) as warm,
          SUM(CASE WHEN temperature='cold' THEN 1 ELSE 0 END) as cold,
          SUM(CASE WHEN crm_stage='new_lead' THEN 1 ELSE 0 END) as new_lead,
          SUM(CASE WHEN crm_stage='pitch_ready' THEN 1 ELSE 0 END) as pitch_ready,
          SUM(CASE WHEN crm_stage='emailed' THEN 1 ELSE 0 END) as emailed,
          SUM(CASE WHEN crm_stage='replied' THEN 1 ELSE 0 END) as replied,
          SUM(CASE WHEN crm_stage='closed_won' THEN 1 ELSE 0 END) as won,
          SUM(CASE WHEN crm_stage='closed_lost' THEN 1 ELSE 0 END) as lost,
          SUM(CASE WHEN date(created_at)=date('now') THEN 1 ELSE 0 END) as added_today,
          SUM(CASE WHEN date(created_at)>=date('now','-7 days') THEN 1 ELSE 0 END) as added_this_week
        FROM leads WHERE user_id=?`).get(userId);
      const topLeads = db.prepare(`SELECT id,channel_name,subscriber_count,lead_score,email,temperature FROM leads WHERE user_id=? AND temperature='hot' ORDER BY lead_score DESC LIMIT 10`).all(userId);
      const pitches = db.prepare('SELECT COUNT(*) as n FROM pitches WHERE lead_id IN (SELECT id FROM leads WHERE user_id=?)').get(userId);
      const emailsSent = db.prepare("SELECT COUNT(*) as n FROM email_queue WHERE user_id=? AND status='sent'").get(userId);
      return { ...totals, pitches_generated: pitches.n, emails_sent: emailsSent.n, top_10_hot_leads: topLeads };
    }

    case 'mass_delete_leads': {
      let countQ, deleteQ, countParams, deleteParams;
      switch (input.filter) {
        case 'no_email':           countQ = `SELECT COUNT(*) as n FROM leads WHERE user_id=? AND (email IS NULL OR email = '')`; deleteQ = `DELETE FROM leads WHERE user_id=? AND (email IS NULL OR email = '')`; countParams = deleteParams = [userId]; break;
        case 'cold_stage_only':    countQ = `SELECT COUNT(*) as n FROM leads WHERE user_id=? AND crm_stage='closed_lost'`; deleteQ = `DELETE FROM leads WHERE user_id=? AND crm_stage='closed_lost'`; countParams = deleteParams = [userId]; break;
        case 'inactive_90days':    countQ = `SELECT COUNT(*) as n FROM leads WHERE user_id=? AND julianday('now')-julianday(updated_at)>90 AND crm_stage='new_lead'`; deleteQ = `DELETE FROM leads WHERE user_id=? AND julianday('now')-julianday(updated_at)>90 AND crm_stage='new_lead'`; countParams = deleteParams = [userId]; break;
        case 'duplicates':         countQ = `SELECT COUNT(*) as n FROM leads WHERE user_id=? AND id NOT IN (SELECT MAX(id) FROM leads WHERE user_id=? GROUP BY channel_id)`; deleteQ = `DELETE FROM leads WHERE user_id=? AND id NOT IN (SELECT MAX(id) FROM leads WHERE user_id=? GROUP BY channel_id)`; countParams = deleteParams = [userId, userId]; break;
        case 'all_cold_temperature': countQ = `SELECT COUNT(*) as n FROM leads WHERE user_id=? AND temperature='cold' AND crm_stage='new_lead'`; deleteQ = `DELETE FROM leads WHERE user_id=? AND temperature='cold' AND crm_stage='new_lead'`; countParams = deleteParams = [userId]; break;
        default: return { error: 'Unknown filter' };
      }
      const count = db.prepare(countQ).get(...countParams).n;
      if (input.dry_run) return { would_delete: count, filter: input.filter, dry_run: true };
      db.prepare(deleteQ).run(...deleteParams);
      const remaining = db.prepare('SELECT COUNT(*) as n FROM leads WHERE user_id=?').get(userId).n;
      return { deleted: count, filter: input.filter, leads_remaining: remaining };
    }

    case 'search_youtube': {
      const { searchChannels } = require('../services/youtubeService');
      const { keyword, minSubs = 30000, maxSubs = 500000 } = input;
      const maxResults = Math.min(input.maxResults || 15, 25);
      let saved = 0;
      try {
        const leads = await searchChannels({ keyword, minSubs, maxSubs, maxResults, emailOnly: true });
        const ins = db.prepare(LEAD_INSERT_SQL);
        for (const lead of leads) { try { const r = ins.run({ ...lead, user_id: userId }); if (r.changes > 0) saved++; } catch {} }
        console.log(`[Jack] search_youtube "${keyword}": ${saved} new leads saved`);
      } catch (e) { console.error(`[Jack] search_youtube error:`, e.message); return { error: e.message }; }
      return { status: 'done', keyword, leads_found: saved, message: `Found and saved ${saved} new leads for "${keyword}". Check CRM to see them.` };
    }

    case 'scrape_bulk': {
      const { searchChannels } = require('../services/youtubeService');
      const keywords = (input.keywords || []).slice(0, 8);
      const { minSubs = 30000, maxSubs = 500000 } = input;
      const maxPerKw = Math.min(input.maxResultsPerKeyword || 10, 15);
      let totalSaved = 0;
      for (const keyword of keywords) {
        try {
          const leads = await searchChannels({ keyword, minSubs, maxSubs, maxResults: maxPerKw, emailOnly: true });
          const ins = db.prepare(LEAD_INSERT_SQL);
          for (const lead of leads) { try { const r = ins.run({ ...lead, user_id: userId }); if (r.changes > 0) totalSaved++; } catch {} }
          console.log(`[Jack] scrape_bulk "${keyword}": ${leads.length} found`);
        } catch (e) { console.error(`[Jack] scrape_bulk "${keyword}" error:`, e.message); }
      }
      return { status: 'done', keywords, leads_saved: totalSaved, message: `Scraped ${keywords.length} keywords — ${totalSaved} new leads saved to CRM.` };
    }

    case 'trigger_niche_hunt': {
      const { niche, target = 50 } = input;
      const { searchChannels, searchChannelsMulti } = require('../services/youtubeService');
      const NICHE_KEYWORDS = {
        'Business': ['business coach YouTube','entrepreneur channel','agency owner YouTube','online business tips'],
        'Finance': ['stock trader YouTube','investing channel','personal finance channel','wealth building YouTube'],
        'Real Estate': ['real estate agent YouTube','property investor channel','real estate investing'],
        'Fitness': ['online fitness coach','personal trainer YouTube','nutrition coach YouTube'],
        'SaaS & Tech': ['SaaS founder YouTube','software demo channel','tech founder vlog'],
        'Law': ['immigration lawyer YouTube','law firm YouTube','legal education channel'],
        'Health': ['doctor YouTube channel','therapist YouTube','wellness coach YouTube'],
        'Education': ['course creator YouTube','online educator channel','eLearning YouTube'],
        'Podcasters': ['podcast video channel','video podcast YouTube','podcaster YouTube'],
      };
      const keywords = NICHE_KEYWORDS[niche] || ['entrepreneur YouTube', 'online business', 'creator economy'];
      ;(async () => {
        try {
          const leads = await searchChannelsMulti(keywords.slice(0, 3), { minSubs: 5000, maxSubs: 500000, maxResults: Math.min(target, 30), emailOnly: true });
          const ins = db.prepare(LEAD_INSERT_SQL);
          let saved = 0;
          for (const lead of leads) { try { ins.run({ ...lead, niche, user_id: userId }); saved++; } catch {} }
          console.log(`[Jack] niche_hunt "${niche}": ${saved} saved`);
        } catch (e) { console.error(`[Jack] niche_hunt error:`, e.message); }
      })();
      return { status: 'hunting', niche, target, message: `Hunting ${niche} leads in background. Targeting ${target} leads with emails. Check CRM in 2-5 min.` };
    }

    case 'trigger_powermode': {
      const { searchChannelsMulti: pmSearch } = require('../services/youtubeService');
      const POWERMODE_KEYWORDS = [
        'business coach YouTube', 'entrepreneur channel', 'startup founder vlog', 'agency owner YouTube',
        'consultant YouTube channel', 'online business tips', 'CEO vlog',
        'stock trader YouTube', 'investing channel', 'personal finance channel',
        'real estate agent YouTube', 'property investor channel',
        'online fitness coach', 'personal trainer YouTube', 'SaaS founder YouTube',
      ];
      ;(async () => {
        try {
          const ins = db.prepare(LEAD_INSERT_SQL);
          let totalSaved = 0;
          for (let i = 0; i < POWERMODE_KEYWORDS.length; i += 3) {
            const batch = POWERMODE_KEYWORDS.slice(i, i + 3);
            const leads = await pmSearch(batch, { minSubs: 5000, maxSubs: 500000, maxResults: 30, emailOnly: false });
            for (const lead of leads) { try { const r = ins.run({ ...lead, user_id: userId }); if (r.changes > 0) totalSaved++; } catch {} }
          }
          console.log(`[Jack] powermode complete: ${totalSaved} leads saved`);
        } catch (e) { console.error('[Jack] powermode error:', e.message); }
      })();
      return { status: 'started', message: 'PowerMode launched — searching 15 high-value keywords in background. Expect 50-150 leads in CRM over next 10-20 minutes.' };
    }

    case 'analyze_channel': {
      const { getChannelByUrl } = require('../services/youtubeService');
      const claude = require('../services/claudeService');
      const channelData = await getChannelByUrl(input.url);
      let deepStudy = null, coldEmail = null, emailSubject = null;
      try {
        [deepStudy, coldEmail] = await Promise.all([
          claude.analyzeChannelDeep(channelData),
          claude.generateAnalyzerEmail(channelData, '').catch(() => null),
        ]);
        if (coldEmail) {
          const sm = coldEmail.match(/SUBJECT:\s*(.+)/i);
          const bm = coldEmail.match(/---\s*([\s\S]+)/);
          emailSubject = sm?.[1]?.trim() || null;
          coldEmail = bm?.[1]?.trim() || coldEmail;
        }
      } catch (e) { deepStudy = `Analysis error: ${e.message}`; }
      try { db.prepare(LEAD_INSERT_SQL).run({ ...channelData, user_id: userId }); } catch {}
      return { channel: channelData.channel_name, subscribers: channelData.subscriber_count?.toLocaleString(), email: channelData.email || 'none', temperature: channelData.temperature, deep_study: deepStudy, email_subject: emailSubject, cold_email: coldEmail };
    }

    case 'generate_pitch': {
      const claude = require('../services/claudeService');
      const lead = db.prepare('SELECT * FROM leads WHERE id=? AND user_id=?').get(input.lead_id, userId);
      if (!lead) throw new Error(`Lead ${input.lead_id} not found`);
      db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
      const result = await claude.generateFullPitch(lead);
      db.prepare(`INSERT OR REPLACE INTO pitches (lead_id,user_id,deep_study,custom_offer,cold_email,email_subject,subject_variants) VALUES (?,?,?,?,?,?,?)`)
        .run(lead.id, userId, result.key_insight, result.custom_offer, result.email_body, result.email_subject, JSON.stringify(result.subject_variants || []));
      db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
      return { lead: lead.channel_name, subject: result.email_subject, preview: result.email_body.substring(0, 300) + '...' };
    }

    case 'bulk_generate_pitches': {
      const claude = require('../services/claudeService');
      const ids = (input.lead_ids || []).slice(0, 20);
      const CONCURRENCY = 5;
      ;(async () => {
        let done = 0;
        for (let i = 0; i < ids.length; i += CONCURRENCY) {
          const batch = ids.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(batch.map(async id => {
            const lead = db.prepare('SELECT * FROM leads WHERE id=? AND user_id=?').get(id, userId);
            if (!lead) return;
            db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
            const result = await claude.generateFullPitch(lead);
            db.prepare(`INSERT OR REPLACE INTO pitches (lead_id,user_id,deep_study,custom_offer,cold_email,email_subject,subject_variants) VALUES (?,?,?,?,?,?,?)`)
              .run(id, userId, result.key_insight, result.custom_offer, result.email_body, result.email_subject, JSON.stringify(result.subject_variants || []));
            db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
            done++;
          }));
        }
        console.log(`[Jack] bulk_generate_pitches done — ${done}/${ids.length}`);
      })();
      return { status: 'generating', lead_count: ids.length, concurrency: CONCURRENCY, message: `Generating ${ids.length} pitches — 5 at a time in parallel. ~${Math.ceil(ids.length / 5) * 15}s total. Pitches land in Pitch Gen as they complete.` };
    }

    case 'find_and_pitch': {
      const { searchChannels } = require('../services/youtubeService');
      const claude = require('../services/claudeService');
      const keywords = (input.keywords || []).slice(0, 5);
      const { minSubs = 30000, maxSubs = 500000 } = input;
      const maxPerKw = Math.min(input.maxResultsPerKeyword || 8, 12);
      const CONCURRENCY = 5;
      ;(async () => {
        const insert = db.prepare(LEAD_INSERT_SQL);
        let allIds = [];
        for (const keyword of keywords) {
          try {
            const leads = await searchChannels({ keyword, minSubs, maxSubs, maxResults: maxPerKw, emailOnly: true });
            for (const lead of leads) {
              try { insert.run({ ...lead, user_id: userId }); } catch {}
              const saved = db.prepare('SELECT id FROM leads WHERE channel_id=? AND user_id=?').get(lead.channel_id, userId);
              if (saved) allIds.push(saved.id);
            }
          } catch (e) { console.error(`[Jack] find_and_pitch scrape "${keyword}":`, e.message); }
        }
        let pitched = 0;
        for (let i = 0; i < Math.min(allIds.length, 20); i += CONCURRENCY) {
          const batch = allIds.slice(i, i + CONCURRENCY);
          await Promise.allSettled(batch.map(async id => {
            try {
              const fullLead = db.prepare('SELECT * FROM leads WHERE id=? AND user_id=?').get(id, userId);
              if (!fullLead) return;
              const result = await claude.generateFullPitch(fullLead);
              db.prepare(`INSERT OR REPLACE INTO pitches (lead_id,user_id,cold_email,email_subject,subject_variants) VALUES (?,?,?,?,?)`)
                .run(fullLead.id, userId, result.email_body, result.email_subject, JSON.stringify(result.subject_variants || []));
              db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(fullLead.id);
              pitched++;
            } catch {}
          }));
        }
        console.log(`[Jack] find_and_pitch done — ${allIds.length} leads, ${pitched} pitched`);
      })();
      return { status: 'running', keywords, message: `Finding + pitching across ${keywords.length} keywords. Scraping leads + generating pitches in parallel. Check Pitch Gen in 5-10 min.` };
    }

    case 'send_emails': {
      const claude = require('../services/claudeService');
      const { sendEmail, getInboxes } = require('../services/emailService');

      // Pre-flight: verify SMTP is configured
      const inboxes = getInboxes();
      if (!inboxes.length) return { sent: 0, error: 'SMTP not configured. Go to Settings → Email Inboxes and add your Gmail + App Password.' };

      // Pre-flight: verify AI is available
      const aiStatus = await checkAiAvailability();
      if (!aiStatus.ok) return { sent: 0, error: `AI unavailable: ${aiStatus.error}` };

      const temp = input.temperature;
      const limit = Math.min(input.limit || 10, 20);

      let q = `SELECT * FROM leads WHERE user_id=? AND email IS NOT NULL AND email != ''`;
      const params = [userId];
      if (temp) { q += ' AND temperature=?'; params.push(temp); }
      if (input.stage) { q += ' AND crm_stage=?'; params.push(input.stage); }
      else { q += ` AND crm_stage IN ('new_lead','pitch_ready')`; }
      q += ' ORDER BY lead_score DESC LIMIT ?';
      params.push(limit);
      const leads = db.prepare(q).all(...params);

      if (!leads.length) return { sent: 0, message: `No leads found (temperature: ${temp || 'any'}, stage: new_lead/pitch_ready).` };

      const CONCURRENCY = 3;
      let sent = 0, failed = 0, failReasons = [];

      // Run synchronously so Levi can report REAL results
      for (let i = 0; i < leads.length; i += CONCURRENCY) {
        const batch = leads.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(batch.map(async lead => {
          db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
          const result = await claude.generateFullPitch(lead);
          db.prepare(`INSERT OR REPLACE INTO pitches (lead_id,user_id,deep_study,custom_offer,cold_email,email_subject,subject_variants) VALUES (?,?,?,?,?,?,?)`)
            .run(lead.id, userId, result.key_insight, result.custom_offer, result.email_body, result.email_subject, JSON.stringify(result.subject_variants || []));
          const qr = db.prepare(`INSERT INTO email_queue (user_id,lead_id,subject,body,status) VALUES (?,?,?,?,'pending')`).run(userId, lead.id, result.email_subject, result.email_body);
          db.prepare(`UPDATE email_queue SET status='sending' WHERE id=?`).run(qr.lastInsertRowid);
          const sentResult = await sendEmail({ to: lead.email, subject: result.email_subject, body: result.email_body, leadId: lead.id });
          db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP,email_id=? WHERE id=?`).run(sentResult.emailId || null, qr.lastInsertRowid);
          db.prepare(`UPDATE leads SET crm_stage='emailed', last_contacted_date=date('now'), follow_up_count=0, follow_up_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
          logActivity('email_sent', `[Jack] Email sent to ${lead.channel_name}`, lead.id, {}, userId);
          return lead.channel_name;
        }));

        for (const r of results) {
          if (r.status === 'fulfilled') { sent++; }
          else {
            failed++;
            const errMsg = r.reason?.message || 'unknown error';
            failReasons.push(errMsg.substring(0, 80));
            const batchLead = batch[results.indexOf(r)];
            try { db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(batchLead?.id); } catch {}
          }
        }
      }

      const msg = failed === 0
        ? `${sent} emails sent. All leads moved to "Emailed" stage. Check Email Sender for delivery details.`
        : `${sent} sent, ${failed} failed. ${failReasons[0] ? `First error: ${failReasons[0]}` : ''}`;

      return { sent, failed, total: leads.length, ai_provider: aiStatus.provider, message: msg };
    }

    case 'send_followup_emails': {
      const claude = require('../services/claudeService');
      const { sendEmail, getInboxes } = require('../services/emailService');
      if (!getInboxes().length) return { sent: 0, error: 'SMTP not configured. Add inbox in Settings.' };
      const aiStatus2 = await checkAiAvailability();
      if (!aiStatus2.ok) return { sent: 0, error: `AI unavailable: ${aiStatus2.error}` };
      const daysSince = input.days_since_email || 3;
      const limit = Math.min(input.limit || 15, 30);
      const followUpNum = input.followup_number || 1;

      const leads = db.prepare(`
        SELECT l.*, p.cold_email as original_email FROM leads l
        LEFT JOIN pitches p ON p.lead_id = l.id
        WHERE l.user_id = ?
          AND l.crm_stage = 'emailed'
          AND l.email IS NOT NULL AND l.email != ''
          AND julianday('now') - julianday(l.updated_at) >= ?
        ORDER BY l.lead_score DESC LIMIT ?
      `).all(userId, daysSince, limit);

      if (!leads.length) return { sent: 0, message: `No emailed leads found that are ${daysSince}+ days silent.` };

      const CONCURRENCY = 3;
      ;(async () => {
        let sent = 0;
        for (let i = 0; i < leads.length; i += CONCURRENCY) {
          const batch = leads.slice(i, i + CONCURRENCY);
          await Promise.allSettled(batch.map(async lead => {
            try {
              const followUpRaw = await claude.generateFollowUp(lead, lead.original_email || '', followUpNum);
              const sm = followUpRaw.match(/SUBJECT:\s*(.+)/i);
              const bm = followUpRaw.match(/---\s*([\s\S]+)/);
              const subject = sm?.[1]?.trim() || `Following up — ${lead.channel_name}`;
              const body = bm?.[1]?.trim() || followUpRaw;
              const qr = db.prepare(`INSERT INTO email_queue (user_id,lead_id,subject,body,status) VALUES (?,?,?,?,'pending')`).run(userId, lead.id, subject, body);
              db.prepare(`UPDATE email_queue SET status='sending' WHERE id=?`).run(qr.lastInsertRowid);
              const sentResult = await sendEmail({ to: lead.email, subject, body, leadId: lead.id });
              db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP,email_id=? WHERE id=?`).run(sentResult.emailId || null, qr.lastInsertRowid);
              logActivity('follow_up_sent', `[Jack] Follow-up #${followUpNum} sent to ${lead.channel_name}`, lead.id, {}, userId);
              sent++;
            } catch (e) { console.error(`[Jack] followup lead ${lead.id}:`, e.message); }
          }));
        }
        console.log(`[Jack] follow-ups done — ${sent}/${leads.length} sent`);
      })();

      return { status: 'sending', targeting: leads.length, followup_number: followUpNum, message: `Sending follow-up #${followUpNum} to ${leads.length} leads that went silent ${daysSince}+ days ago. Running 3 at a time. Check CRM for updates.` };
    }

    case 'get_email_queue': {
      const pending = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE user_id=? AND status='pending'`).get(userId);
      const sentToday = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE user_id=? AND status='sent' AND date(sent_at)=date('now')`).get(userId);
      const failed = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE user_id=? AND status='failed'`).get(userId);
      const dailyLimit = parseInt(getSetting('daily_send_limit') || '150');
      const paused = getSetting('queue_paused') === '1';
      const recentSent = db.prepare(`
        SELECT eq.subject, l.channel_name, eq.sent_at
        FROM email_queue eq JOIN leads l ON l.id=eq.lead_id
        WHERE eq.user_id=? AND eq.status='sent' ORDER BY eq.sent_at DESC LIMIT 5
      `).all(userId);
      return { pending: pending.n, sent_today: sentToday.n, daily_limit: dailyLimit, daily_remaining: Math.max(0, dailyLimit - sentToday.n), failed: failed.n, paused, recent_sent: recentSent };
    }

    case 'control_queue': {
      const { setSetting } = require('../models/database');
      setSetting('queue_paused', input.action === 'pause' ? '1' : '0');
      return { success: true, queue: input.action === 'pause' ? 'PAUSED — no more emails will send until resumed' : 'RESUMED — queue is active and sending' };
    }

    case 'set_setting': {
      setSetting(input.key, input.value);
      return { success: true, key: input.key, value: input.value, message: `Setting "${input.key}" updated to "${input.value}"` };
    }

    case 'move_lead': {
      const lead = db.prepare('SELECT channel_name,crm_stage FROM leads WHERE id=? AND user_id=?').get(input.lead_id, userId);
      if (!lead) throw new Error(`Lead ${input.lead_id} not found`);
      db.prepare('UPDATE leads SET crm_stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').run(input.stage, input.lead_id, userId);
      return { success: true, lead: lead.channel_name, from: lead.crm_stage, to: input.stage };
    }

    case 'delete_lead': {
      const lead = db.prepare('SELECT channel_name FROM leads WHERE id=? AND user_id=?').get(input.lead_id, userId);
      if (!lead) throw new Error(`Lead ${input.lead_id} not found`);
      db.prepare('DELETE FROM leads WHERE id=? AND user_id=?').run(input.lead_id, userId);
      return { success: true, deleted: lead.channel_name };
    }

    case 'get_automation_status': {
      const autoScrape = getSetting('auto_scrape');
      const today = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE user_id=? AND date(created_at)=date('now')`).get(userId);
      const lastRun = db.prepare(`SELECT message,created_at FROM activities WHERE (user_id = ? OR user_id IS NULL) AND message LIKE '%Auto-scrape%' ORDER BY created_at DESC LIMIT 1`).get(userId);
      const keyPool = require('../services/youtubeService').getKeyPoolStatus?.() || [];
      return { auto_scrape_enabled: autoScrape === 'true', leads_found_today: today?.n || 0, last_run: lastRun?.created_at || 'never', last_run_result: lastRun?.message || 'none', api_keys_active: keyPool.filter(k => !k.exhausted).length, api_keys_total: keyPool.length, schedule: 'Every 30 minutes, 45+ keywords, 15 niches' };
    }

    case 'toggle_automation': {
      setSetting('auto_scrape', input.enabled ? 'true' : 'false');
      return { success: true, auto_scrape: input.enabled ? 'ENABLED — running every 30 minutes' : 'DISABLED' };
    }

    case 'daily_briefing': {
      const stats = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN temperature='hot' THEN 1 ELSE 0 END) as hot,
          SUM(CASE WHEN temperature='warm' THEN 1 ELSE 0 END) as warm,
          SUM(CASE WHEN date(created_at)=date('now') THEN 1 ELSE 0 END) as today,
          SUM(CASE WHEN crm_stage='pitch_ready' THEN 1 ELSE 0 END) as pitch_ready,
          SUM(CASE WHEN crm_stage='emailed' THEN 1 ELSE 0 END) as emailed,
          SUM(CASE WHEN crm_stage='replied' THEN 1 ELSE 0 END) as replied,
          SUM(CASE WHEN crm_stage='closed_won' THEN 1 ELSE 0 END) as won
        FROM leads WHERE user_id=?`).get(userId);
      const sentToday = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE user_id=? AND status='sent' AND date(sent_at)=date('now')`).get(userId);
      const topLeads = db.prepare(`SELECT id,channel_name,subscriber_count,lead_score,email,temperature FROM leads WHERE user_id=? AND temperature='hot' AND crm_stage='new_lead' ORDER BY lead_score DESC LIMIT 5`).all(userId);
      const autoScrape = getSetting('auto_scrape');
      const dailyLimit = parseInt(getSetting('daily_send_limit') || '150');
      return { date: new Date().toLocaleDateString(), leads_found_today: stats.today, total_leads: stats.total, hot: stats.hot, warm: stats.warm, pitch_ready: stats.pitch_ready, emailed: stats.emailed, replied: stats.replied, closed_won: stats.won, emails_sent_today: sentToday?.n || 0, daily_limit: dailyLimit, top_hot_leads_to_contact: topLeads, automation_running: autoScrape === 'true' };
    }

    case 'clean_dead_leads': {
      const action = input.action || 'archive';
      let count = 0;
      if (action === 'archive') {
        const r = db.prepare(`UPDATE leads SET crm_stage='closed_lost',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND (email IS NULL OR email='') AND crm_stage='new_lead'`).run(userId);
        count = r.changes;
      } else {
        const r = db.prepare(`DELETE FROM leads WHERE user_id=? AND (email IS NULL OR email='') AND crm_stage='new_lead'`).run(userId);
        count = r.changes;
      }
      return { action, affected: count, message: `${count} leads without emails ${action === 'delete' ? 'deleted' : 'archived to closed_lost'}` };
    }

    case 'export_leads_csv': {
      let q = `SELECT id,channel_name,channel_handle,subscriber_count,avg_views,engagement_rate,email,website,temperature,crm_stage,niche,lead_score,created_at FROM leads WHERE user_id=?`;
      const params = [userId];
      if (input.temperature) { q += ' AND temperature=?'; params.push(input.temperature); }
      if (input.stage)       { q += ' AND crm_stage=?'; params.push(input.stage); }
      if (input.has_email === true)  { q += ' AND email IS NOT NULL AND email != ""'; }
      if (input.has_email === false) { q += ' AND (email IS NULL OR email = "")'; }
      q += ' ORDER BY lead_score DESC LIMIT ?';
      params.push(Math.min(input.limit || 500, 1000));
      const rows = db.prepare(q).all(...params);
      const headers = ['id','channel_name','channel_handle','subscriber_count','avg_views','engagement_rate','email','website','temperature','crm_stage','niche','lead_score','created_at'];
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
      return { rows: rows.length, csv_preview: csv.substring(0, 500) + (csv.length > 500 ? '\n...truncated...' : ''), message: `${rows.length} leads exported. CSV data included above — copy and paste into a spreadsheet.` };
    }

    case 'archive_cold_leads': {
      const count = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE user_id=? AND temperature='cold' AND crm_stage='new_lead'`).get(userId).n;
      if (input.dry_run) return { would_archive: count, dry_run: true };
      db.prepare(`UPDATE leads SET crm_stage='closed_lost',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND temperature='cold' AND crm_stage='new_lead'`).run(userId);
      return { archived: count, message: `${count} cold new_leads moved to closed_lost. CRM is cleaner now.` };
    }

    case 'backup_database': {
      const summary = db.prepare(`
        SELECT
          COUNT(*) as total_leads,
          SUM(CASE WHEN email IS NOT NULL AND email!='' THEN 1 ELSE 0 END) as with_email,
          SUM(CASE WHEN temperature='hot' THEN 1 ELSE 0 END) as hot,
          SUM(CASE WHEN temperature='warm' THEN 1 ELSE 0 END) as warm,
          SUM(CASE WHEN temperature='cold' THEN 1 ELSE 0 END) as cold,
          SUM(CASE WHEN crm_stage='emailed' THEN 1 ELSE 0 END) as emailed,
          SUM(CASE WHEN crm_stage='replied' THEN 1 ELSE 0 END) as replied,
          SUM(CASE WHEN crm_stage='closed_won' THEN 1 ELSE 0 END) as won,
          SUM(CASE WHEN crm_stage='no_response' THEN 1 ELSE 0 END) as no_response
        FROM leads WHERE user_id=?`).get(userId);
      const pitches = db.prepare('SELECT COUNT(*) as n FROM pitches WHERE lead_id IN (SELECT id FROM leads WHERE user_id=?)').get(userId);
      const sentTotal = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE user_id=? AND status='sent'`).get(userId);
      const failed = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE user_id=? AND status='failed'`).get(userId);
      const activities = db.prepare('SELECT COUNT(*) as n FROM activities WHERE user_id=?').get(userId);
      return { ...summary, pitches: pitches.n, emails_sent_total: sentTotal.n, emails_failed: failed.n, activity_log_entries: activities.n, database: 'SQLite (backend/data/outreach.db)', timestamp: new Date().toISOString() };
    }

    case 'clear_failed_emails': {
      const count = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE user_id=? AND status='failed'`).get(userId).n;
      if (input.dry_run) return { would_delete: count, dry_run: true };
      db.prepare(`DELETE FROM email_queue WHERE user_id=? AND status='failed'`).run(userId);
      return { deleted: count, message: `${count} failed emails cleared from queue.` };
    }

    case 'show_best_subjects': {
      const limit = Math.min(input.limit || 10, 25);
      const best = db.prepare(`
        SELECT eq.subject, COUNT(*) as sent,
          SUM(CASE WHEN e.opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
          SUM(CASE WHEN e.replied_at IS NOT NULL THEN 1 ELSE 0 END) as replied
        FROM email_queue eq
        LEFT JOIN emails e ON e.id = eq.email_id
        WHERE eq.user_id = ? AND eq.status = 'sent' AND eq.subject IS NOT NULL
        GROUP BY eq.subject
        HAVING sent >= 2
        ORDER BY (CAST(opened AS REAL)/sent) DESC
        LIMIT ?
      `).all(userId, limit);
      return { subjects: best.map(r => ({ subject: r.subject, sent: r.sent, opened: r.opened, replied: r.replied, open_rate: r.sent > 0 ? `${Math.round(r.opened/r.sent*100)}%` : '0%' })), count: best.length };
    }

    case 'power_follow_up': {
      const { generateFollowUp } = require('../services/claudeService');
      const { sendEmail, getInboxes } = require('../services/emailService');
      if (!getInboxes().length) return { sent: 0, error: 'SMTP not configured.' };
      const limit = Math.min(input.limit || 30, 50);
      const leads = db.prepare(`
        SELECT l.*, p.cold_email as original_email
        FROM leads l LEFT JOIN pitches p ON p.lead_id = l.id
        WHERE l.user_id = ?
          AND l.crm_stage = 'emailed'
          AND l.follow_up_status = 'active'
          AND l.follow_up_count < 5
          AND l.last_contacted_date IS NOT NULL
          AND l.email IS NOT NULL AND l.email != ''
          AND julianday('now') - julianday(l.last_contacted_date) >= 3
        ORDER BY l.lead_score DESC LIMIT ?
      `).all(userId, limit);
      if (!leads.length) return { sent: 0, message: 'No follow-ups due right now (need 3+ days since last contact).' };
      const CONCURRENCY = 3;
      ;(async () => {
        let sent = 0;
        for (let i = 0; i < leads.length; i += CONCURRENCY) {
          const batch = leads.slice(i, i + CONCURRENCY);
          await Promise.allSettled(batch.map(async lead => {
            try {
              const step = (lead.follow_up_count || 0) + 1;
              const raw = await generateFollowUp(lead, lead.original_email || '', step);
              const sm = raw.match(/SUBJECT:\s*(.+)/i);
              const bm = raw.match(/---\s*([\s\S]+)/);
              const subject = sm?.[1]?.trim() || `Following up — ${lead.channel_name}`;
              const body = bm?.[1]?.trim() || raw;
              const qr = db.prepare(`INSERT INTO email_queue (user_id,lead_id,subject,body,status,priority) VALUES (?,?,?,?,'pending',?)`).run(userId, lead.id, subject, body, step);
              db.prepare(`UPDATE email_queue SET status='sending' WHERE id=?`).run(qr.lastInsertRowid);
              await sendEmail({ to: lead.email, subject, body, leadId: lead.id });
              db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?`).run(qr.lastInsertRowid);
              db.prepare(`UPDATE leads SET follow_up_count=?,last_contacted_date=date('now'),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(step, lead.id);
              if (step >= 5) db.prepare(`UPDATE leads SET follow_up_status='complete',crm_stage='no_response',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
              logActivity('followup_sent', `[Jack] FU#${step}/5 sent to ${lead.channel_name}`, lead.id, {}, userId);
              sent++;
            } catch (e) { console.error(`[Jack] FU lead ${lead.id}:`, e.message); }
          }));
        }
        console.log(`[Jack] power_follow_up: ${sent}/${leads.length} sent`);
      })();
      return { status: 'sending', targeting: leads.length, message: `Sending follow-ups to ${leads.length} overdue leads. Running 3 at a time. Each lead gets its next step (FU1–FU5).` };
    }

    case 'show_follow_up_status': {
      const breakdown = db.prepare(`
        SELECT follow_up_count, follow_up_status, COUNT(*) as n
        FROM leads WHERE user_id=? AND crm_stage IN ('emailed','no_response')
        GROUP BY follow_up_count, follow_up_status
        ORDER BY follow_up_count
      `).all(userId);
      const overdue = db.prepare(`
        SELECT COUNT(*) as n FROM leads
        WHERE user_id=? AND crm_stage='emailed' AND follow_up_status='active' AND follow_up_count < 5
          AND last_contacted_date IS NOT NULL
          AND julianday('now') - julianday(last_contacted_date) >= 3
      `).get(userId);
      const completed = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE user_id=? AND follow_up_status='complete'`).get(userId);
      const noResponse = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE user_id=? AND crm_stage='no_response'`).get(userId);
      return { overdue_now: overdue.n, completed_sequences: completed.n, moved_to_no_response: noResponse.n, breakdown, message: `${overdue.n} leads ready for follow-up right now. ${completed.n} completed all 5 steps.` };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Jack System Prompt ────────────────────────────────────────────────────────
const SYSTEM = `You are Jack — the autonomous AI outreach agent built into this platform.

You are not a chatbot. You are an execution engine with 30+ tools covering everything: finding leads, writing personalized emails, sending pitches, managing the CRM, running follow-up sequences, analyzing channels, and reporting results.

You adapt to every user. Each user has their own business, niche, and service they sell to YouTubers. You serve THEIR goals — not a fixed script. Use get_stats and daily_briefing to understand their current state before giving advice.

## ABSOLUTE RULES
1. NEVER ask for clarification. Pick the best default and execute.
2. NEVER say "Would you like me to", "Should I proceed", "Can you clarify", "Which niche", "How many". JUST DO IT.
3. Leads without email are worthless — emailOnly is always true.
4. Save every lead directly to CRM. Always.
5. Action first, report numbers after.
6. For database-wide ops, use full_database_report or mass_delete_leads — not get_leads (it's a sample only).

## WHAT YOU CAN DO (use the right tool immediately)
FIND LEADS:
"find leads" → trigger_powermode (fastest — serves from master DB instantly)
"find [niche] leads" → trigger_niche_hunt(niche) then get_leads_bulk
"find leads manually" → scrape_bulk with 4-5 keywords for their niche
"find and pitch" → find_and_pitch

EMAILS & PITCHES:
"generate pitches" / "write emails" → get_leads_bulk → bulk_generate_pitches
"send emails" / "send N emails" → send_emails(limit=N)
"email hot leads" → send_emails(temperature="hot", limit=10)
"follow up" → power_follow_up(limit=30)
"follow up status" → show_follow_up_status

CRM & ANALYTICS:
"stats" / "briefing" → daily_briefing + full_database_report
"export" → export_leads_csv
"clean up" → mass_delete_leads(no_email) then mass_delete_leads(duplicates)
"archive cold" → archive_cold_leads
"move lead to X" → move_lead(lead_id, stage)

QUEUE MANAGEMENT:
"queue status" → get_email_queue
"pause queue" → control_queue(pause)
"resume queue" → control_queue(resume)
"set daily limit N" → set_setting(daily_send_limit, N)
"clear failed" → clear_failed_emails

AUTOMATION:
"automation status" → get_automation_status
"turn on automation" → toggle_automation(true)
"powermode" → trigger_powermode

## RESPONSE STYLE
Short. Numbers. Results. No fluff.
Good: "Found 24 leads. Pitched 18. 6 emails sent. 2 replies. Queue: 4 pending."
Bad: "Great! I'd be happy to help you find leads today."

Never apologize. Never hesitate. One sentence why if something fails, one sentence fix.

BANNED WORDS: "Great question" | "I'd be happy to" | "Would you like" | "Should I" | "Can you clarify" | "Let me know" | "Shall I" | "Just to confirm" | "Certainly"`;


// ── Status route (used by sidebar to show real AI/SMTP health) ────────────────
router.get('/status', asyncHandler(async (req, res) => {
  const { getInboxes } = require('../services/emailService');
  const inboxes = getInboxes();
  const db = getDb();
  const sentToday = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE status='sent' AND date(sent_at)=date('now')`).get();
  const dailyLimit = parseInt(getSetting('daily_send_limit') || '150');

  const geminiKey = getGeminiKey();
  const ytKeys = getYtKeys();
  const ytExhausted = isQuotaExhausted();

  res.json({
    smtp: { configured: inboxes.length > 0, inboxes: inboxes.length, sent_today: sentToday.n, daily_limit: dailyLimit },
    gemini: { configured: !!geminiKey },
    ai_available: !!geminiKey,
    youtube: { configured: ytKeys.length > 0, keys: ytKeys.length, exhausted: ytExhausted },
    innertube: { online: true },
  });
}));

// ── Route ─────────────────────────────────────────────────────────────────────
router.post('/chat', asyncHandler(async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }
  const userId = req.user.id;

  require('dotenv').config({ path: ENV_PATH, override: true });
  const keys = getGeminiKeys();
  if (!keys.length) {
    return res.json({ reply: "No Gemini API key configured. Go to Settings → Integrations and add a key from aistudio.google.com (it's free)." });
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const isQuotaErr = msg => /429|quota|resource_exhausted|limit/i.test(msg || '');

  const priorMsgs = messages.slice(0, -1);
  let geminiHistory = priorMsgs.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
  }));
  // Gemini requires history to start with 'user' and strictly alternate roles
  while (geminiHistory.length && geminiHistory[0].role !== 'user') geminiHistory.shift();
  geminiHistory = geminiHistory.filter((m, i, arr) => i === arr.length - 1 || m.role !== arr[i + 1].role);
  const lastMsg = messages[messages.length - 1];
  const lastMsgText = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);

  for (const key of keys) {
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({
        model: FAST_MODEL,
        systemInstruction: SYSTEM,
        tools: [{ functionDeclarations: GEMINI_TOOLS }],
      });

      const chat = model.startChat({ history: geminiHistory });
      let result = await chat.sendMessage(lastMsgText);

      for (let round = 0; round < 15; round++) {
        const parts = result.response.candidates?.[0]?.content?.parts || [];
        const fnCalls = parts.filter(p => p.functionCall);

        if (!fnCalls.length) {
          return res.json({ reply: result.response.text() || 'Done.' });
        }

        const toolResponses = await Promise.all(
          fnCalls.map(async p => {
            const { name, args } = p.functionCall;
            let output;
            try { output = await runTool(name, args || {}, userId); }
            catch (err) { output = { error: err.message }; }
            return { functionResponse: { name, response: output } };
          })
        );
        result = await chat.sendMessage(toolResponses);
      }

      return res.json({ reply: 'Mission complete.' });
    } catch (geminiErr) {
      const msg = geminiErr.message || '';
      console.warn(`[Jack] Key ...${key.slice(-6)} error: ${msg.substring(0, 80)}`);
      if (isQuotaErr(msg)) continue; // try next key
      // Non-quota error — report it directly
      return res.json({ reply: `Jack hit an error: ${msg.substring(0, 120) || 'unknown'}. Try rephrasing your request.` });
    }
  }

  return res.json({ reply: "All Gemini keys are at their daily limit. Try again tomorrow or add more keys in Settings → Integrations." });
}));

module.exports = router;
