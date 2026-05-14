const express = require('express');
const router = express.Router();
const path = require('path');
const { asyncHandler } = require('../middleware/errorHandler');
const { getDb, getSetting, setSetting, logActivity } = require('../models/database');
const { FAST_MODEL, SMART_MODEL, getGeminiKey, makeGeminiModel, checkAiAvailability, getAnthropicKey } = require('../services/claudeService');

const ENV_PATH = path.join(__dirname, '../../../.env');

function getGeminiChat(systemPrompt) {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const key = getGeminiKey();
  if (!key) return null;
  // Levi uses Flash — fast responses, strong tool use
  return makeGeminiModel(key, FAST_MODEL, systemPrompt);
}

function getClaudeClient() {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const dbKey = getSetting('anthropic_api_key');
  const key = (dbKey && dbKey !== 'placeholder') ? dbKey : process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'placeholder') return null;
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: key });
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
    (platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
     avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
     last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
     country, email, website, social_links, thumbnail_url, pain_points, lead_score, temperature, crm_stage)
  VALUES
    (@platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @total_videos,
     @avg_views, @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days,
     @last_upload_date, @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
     @country, @email, @website, @social_links, @thumbnail_url, @pain_points, @lead_score, @temperature, 'new_lead')
`;

async function runTool(name, input) {
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
        FROM leads`).get();
      const sent = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE status='sent'`).get();
      const today = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE date(created_at)=date('now')`).get();
      const pitches = db.prepare(`SELECT COUNT(*) as n FROM pitches`).get();
      return { ...row, emails_sent: sent?.n || 0, added_today: today?.n || 0, pitches_generated: pitches?.n || 0 };
    }

    case 'get_leads': {
      let q = `SELECT id,channel_name,subscriber_count,avg_views,engagement_rate,temperature,crm_stage,email,lead_score,channel_handle FROM leads WHERE 1=1`;
      const params = [];
      if (input.search)      { q += ' AND channel_name LIKE ?'; params.push(`%${input.search}%`); }
      if (input.temperature) { q += ' AND temperature=?'; params.push(input.temperature); }
      if (input.stage)       { q += ' AND crm_stage=?'; params.push(input.stage); }
      q += ' ORDER BY lead_score DESC LIMIT ?';
      params.push(Math.min(input.limit || 25, 100));
      const leads = db.prepare(q).all(...params);
      const total = db.prepare('SELECT COUNT(*) as n FROM leads').get();
      return { leads, shown: leads.length, total_in_db: total.n };
    }

    case 'get_leads_bulk': {
      let q = `SELECT id,channel_name,subscriber_count,avg_views,engagement_rate,temperature,crm_stage,email,lead_score,channel_handle,created_at FROM leads WHERE 1=1`;
      const params = [];
      if (input.temperature) { q += ' AND temperature=?'; params.push(input.temperature); }
      if (input.stage)       { q += ' AND crm_stage=?'; params.push(input.stage); }
      if (input.has_email === true)  { q += ' AND email IS NOT NULL AND email != ""'; }
      if (input.has_email === false) { q += ' AND (email IS NULL OR email = "")'; }
      q += ' ORDER BY lead_score DESC LIMIT ? OFFSET ?';
      params.push(Math.min(input.limit || 200, 500), input.offset || 0);
      const leads = db.prepare(q).all(...params);
      const total = db.prepare('SELECT COUNT(*) as n FROM leads').get();
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
        FROM leads`).get();
      const topLeads = db.prepare(`SELECT id,channel_name,subscriber_count,lead_score,email,temperature FROM leads WHERE temperature='hot' ORDER BY lead_score DESC LIMIT 10`).all();
      const pitches = db.prepare('SELECT COUNT(*) as n FROM pitches').get();
      const emailsSent = db.prepare("SELECT COUNT(*) as n FROM email_queue WHERE status='sent'").get();
      return { ...totals, pitches_generated: pitches.n, emails_sent: emailsSent.n, top_10_hot_leads: topLeads };
    }

    case 'mass_delete_leads': {
      let countQ, deleteQ;
      switch (input.filter) {
        case 'no_email':           countQ = `SELECT COUNT(*) as n FROM leads WHERE email IS NULL OR email = ''`; deleteQ = `DELETE FROM leads WHERE email IS NULL OR email = ''`; break;
        case 'cold_stage_only':    countQ = `SELECT COUNT(*) as n FROM leads WHERE crm_stage='closed_lost'`; deleteQ = `DELETE FROM leads WHERE crm_stage='closed_lost'`; break;
        case 'inactive_90days':    countQ = `SELECT COUNT(*) as n FROM leads WHERE julianday('now')-julianday(updated_at)>90 AND crm_stage='new_lead'`; deleteQ = `DELETE FROM leads WHERE julianday('now')-julianday(updated_at)>90 AND crm_stage='new_lead'`; break;
        case 'duplicates':         countQ = `SELECT COUNT(*) as n FROM leads WHERE id NOT IN (SELECT MAX(id) FROM leads GROUP BY channel_id)`; deleteQ = `DELETE FROM leads WHERE id NOT IN (SELECT MAX(id) FROM leads GROUP BY channel_id)`; break;
        case 'all_cold_temperature': countQ = `SELECT COUNT(*) as n FROM leads WHERE temperature='cold' AND crm_stage='new_lead'`; deleteQ = `DELETE FROM leads WHERE temperature='cold' AND crm_stage='new_lead'`; break;
        default: return { error: 'Unknown filter' };
      }
      const count = db.prepare(countQ).get().n;
      if (input.dry_run) return { would_delete: count, filter: input.filter, dry_run: true };
      db.prepare(deleteQ).run();
      const remaining = db.prepare('SELECT COUNT(*) as n FROM leads').get().n;
      return { deleted: count, filter: input.filter, leads_remaining: remaining };
    }

    case 'search_youtube': {
      const { searchChannels } = require('../services/youtubeService');
      const { keyword, minSubs = 30000, maxSubs = 500000 } = input;
      const maxResults = Math.min(input.maxResults || 15, 25);
      ;(async () => {
        try {
          const leads = await searchChannels({ keyword, minSubs, maxSubs, maxResults, emailOnly: true });
          const ins = db.prepare(LEAD_INSERT_SQL);
          for (const lead of leads) { try { ins.run(lead); } catch {} }
          console.log(`[Levi] search_youtube "${keyword}": ${leads.length} leads saved`);
        } catch (e) { console.error(`[Levi] search_youtube error:`, e.message); }
      })();
      return { status: 'searching', keyword, estimated_leads: maxResults, message: `Searching "${keyword}" in background. ~${maxResults} leads in 1-3 min. Ask "show leads" to check.` };
    }

    case 'scrape_bulk': {
      const { searchChannels } = require('../services/youtubeService');
      const keywords = (input.keywords || []).slice(0, 8);
      const { minSubs = 30000, maxSubs = 500000 } = input;
      const maxPerKw = Math.min(input.maxResultsPerKeyword || 10, 15);
      ;(async () => {
        for (const keyword of keywords) {
          try {
            const leads = await searchChannels({ keyword, minSubs, maxSubs, maxResults: maxPerKw, emailOnly: true });
            const ins = db.prepare(LEAD_INSERT_SQL);
            for (const lead of leads) { try { ins.run(lead); } catch {} }
            console.log(`[Levi] scrape_bulk "${keyword}": ${leads.length} saved`);
          } catch (e) { console.error(`[Levi] scrape_bulk "${keyword}" error:`, e.message); }
        }
        console.log(`[Levi] scrape_bulk complete — all ${keywords.length} keywords done`);
      })();
      return { status: 'searching', keywords, estimated_leads: keywords.length * maxPerKw, message: `Searching ${keywords.length} keywords in background (~${keywords.length * maxPerKw} leads expected). Takes 2-10 min. Ask "daily briefing" to check progress.` };
    }

    case 'trigger_niche_hunt': {
      const { niche, target = 50 } = input;
      try {
        const response = await require('node-fetch')('http://localhost:3001/api/scraper/hunt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ niche, target }),
        }).catch(() => null);
        if (response?.ok) {
          return { status: 'started', niche, target, message: `Niche hunt launched for "${niche}" — targeting ${target} leads. Check /api/scraper/hunt/status for live progress.` };
        }
      } catch {}
      // Fallback: direct scrape
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
          for (const lead of leads) { try { ins.run({ ...lead, niche }); saved++; } catch {} }
          console.log(`[Levi] niche_hunt "${niche}": ${saved} saved`);
        } catch (e) { console.error(`[Levi] niche_hunt error:`, e.message); }
      })();
      return { status: 'hunting', niche, target, message: `Hunting ${niche} leads in background. Targeting ${target} leads with emails. Check CRM in 2-5 min.` };
    }

    case 'trigger_powermode': {
      try {
        const fetch = (...args) => import('node-fetch').then(m => m.default(...args)).catch(() => null);
        await fetch('http://localhost:3001/api/scraper/powermode/start', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      } catch {}
      return { status: 'started', message: 'PowerMode launched — searching 15 high-value keywords simultaneously. Expect 50-150 leads in CRM over next 10-20 minutes. Check Lead Finder → PowerMode tab for live progress.' };
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
      try { db.prepare(LEAD_INSERT_SQL).run(channelData); } catch {}
      return { channel: channelData.channel_name, subscribers: channelData.subscriber_count?.toLocaleString(), email: channelData.email || 'none', temperature: channelData.temperature, deep_study: deepStudy, email_subject: emailSubject, cold_email: coldEmail };
    }

    case 'generate_pitch': {
      const claude = require('../services/claudeService');
      const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(input.lead_id);
      if (!lead) throw new Error(`Lead ${input.lead_id} not found`);
      db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
      const result = await claude.generateFullPitch(lead);
      db.prepare(`INSERT OR REPLACE INTO pitches (lead_id,deep_study,custom_offer,cold_email,email_subject,subject_variants) VALUES (?,?,?,?,?,?)`)
        .run(lead.id, result.key_insight, result.custom_offer, result.email_body, result.email_subject, JSON.stringify(result.subject_variants || []));
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
            const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(id);
            if (!lead) return;
            db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
            const result = await claude.generateFullPitch(lead);
            db.prepare(`INSERT OR REPLACE INTO pitches (lead_id,deep_study,custom_offer,cold_email,email_subject,subject_variants) VALUES (?,?,?,?,?,?)`)
              .run(id, result.key_insight, result.custom_offer, result.email_body, result.email_subject, JSON.stringify(result.subject_variants || []));
            db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
            done++;
          }));
        }
        console.log(`[Levi] bulk_generate_pitches done — ${done}/${ids.length}`);
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
              try { insert.run(lead); } catch {}
              const saved = db.prepare('SELECT id FROM leads WHERE channel_id=?').get(lead.channel_id);
              if (saved) allIds.push(saved.id);
            }
          } catch (e) { console.error(`[Levi] find_and_pitch scrape "${keyword}":`, e.message); }
        }
        let pitched = 0;
        for (let i = 0; i < Math.min(allIds.length, 20); i += CONCURRENCY) {
          const batch = allIds.slice(i, i + CONCURRENCY);
          await Promise.allSettled(batch.map(async id => {
            try {
              const fullLead = db.prepare('SELECT * FROM leads WHERE id=?').get(id);
              if (!fullLead) return;
              const result = await claude.generateFullPitch(fullLead);
              db.prepare(`INSERT OR REPLACE INTO pitches (lead_id,cold_email,email_subject,subject_variants) VALUES (?,?,?,?)`)
                .run(fullLead.id, result.email_body, result.email_subject, JSON.stringify(result.subject_variants || []));
              db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(fullLead.id);
              pitched++;
            } catch {}
          }));
        }
        console.log(`[Levi] find_and_pitch done — ${allIds.length} leads, ${pitched} pitched`);
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

      let q = `SELECT * FROM leads WHERE email IS NOT NULL AND email != ''`;
      const params = [];
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
          db.prepare(`INSERT OR REPLACE INTO pitches (lead_id,deep_study,custom_offer,cold_email,email_subject,subject_variants) VALUES (?,?,?,?,?,?)`)
            .run(lead.id, result.key_insight, result.custom_offer, result.email_body, result.email_subject, JSON.stringify(result.subject_variants || []));
          const qr = db.prepare(`INSERT INTO email_queue (lead_id,subject,body,status) VALUES (?,?,?,'pending')`).run(lead.id, result.email_subject, result.email_body);
          db.prepare(`UPDATE email_queue SET status='sending' WHERE id=?`).run(qr.lastInsertRowid);
          const sentResult = await sendEmail({ to: lead.email, subject: result.email_subject, body: result.email_body, leadId: lead.id });
          db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP,email_id=? WHERE id=?`).run(sentResult.emailId || null, qr.lastInsertRowid);
          db.prepare(`UPDATE leads SET crm_stage='emailed', last_contacted_date=date('now'), follow_up_count=0, follow_up_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
          logActivity('email_sent', `[Levi] Email sent to ${lead.channel_name}`, lead.id);
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
        WHERE l.crm_stage = 'emailed'
          AND l.email IS NOT NULL AND l.email != ''
          AND julianday('now') - julianday(l.updated_at) >= ?
        ORDER BY l.lead_score DESC LIMIT ?
      `).all(daysSince, limit);

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
              const qr = db.prepare(`INSERT INTO email_queue (lead_id,subject,body,status) VALUES (?,?,?,'pending')`).run(lead.id, subject, body);
              db.prepare(`UPDATE email_queue SET status='sending' WHERE id=?`).run(qr.lastInsertRowid);
              const sentResult = await sendEmail({ to: lead.email, subject, body, leadId: lead.id });
              db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP,email_id=? WHERE id=?`).run(sentResult.emailId || null, qr.lastInsertRowid);
              logActivity('follow_up_sent', `[Levi] Follow-up #${followUpNum} sent to ${lead.channel_name}`, lead.id);
              sent++;
            } catch (e) { console.error(`[Levi] followup lead ${lead.id}:`, e.message); }
          }));
        }
        console.log(`[Levi] follow-ups done — ${sent}/${leads.length} sent`);
      })();

      return { status: 'sending', targeting: leads.length, followup_number: followUpNum, message: `Sending follow-up #${followUpNum} to ${leads.length} leads that went silent ${daysSince}+ days ago. Running 3 at a time. Check CRM for updates.` };
    }

    case 'get_email_queue': {
      const pending = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE status='pending'`).get();
      const sentToday = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE status='sent' AND date(sent_at)=date('now')`).get();
      const failed = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE status='failed'`).get();
      const dailyLimit = parseInt(getSetting('daily_send_limit') || '150');
      const paused = getSetting('queue_paused') === '1';
      const recentSent = db.prepare(`
        SELECT eq.subject, l.channel_name, eq.sent_at
        FROM email_queue eq JOIN leads l ON l.id=eq.lead_id
        WHERE eq.status='sent' ORDER BY eq.sent_at DESC LIMIT 5
      `).all();
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
      const lead = db.prepare('SELECT channel_name,crm_stage FROM leads WHERE id=?').get(input.lead_id);
      if (!lead) throw new Error(`Lead ${input.lead_id} not found`);
      db.prepare('UPDATE leads SET crm_stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(input.stage, input.lead_id);
      return { success: true, lead: lead.channel_name, from: lead.crm_stage, to: input.stage };
    }

    case 'delete_lead': {
      const lead = db.prepare('SELECT channel_name FROM leads WHERE id=?').get(input.lead_id);
      if (!lead) throw new Error(`Lead ${input.lead_id} not found`);
      db.prepare('DELETE FROM leads WHERE id=?').run(input.lead_id);
      return { success: true, deleted: lead.channel_name };
    }

    case 'get_automation_status': {
      const autoScrape = getSetting('auto_scrape');
      const today = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE date(created_at)=date('now')`).get();
      const lastRun = db.prepare(`SELECT description,created_at FROM activities WHERE description LIKE '%Auto-scrape%' ORDER BY created_at DESC LIMIT 1`).get();
      const keyPool = require('../services/youtubeService').getKeyPoolStatus?.() || [];
      return { auto_scrape_enabled: autoScrape === 'true', leads_found_today: today?.n || 0, last_run: lastRun?.created_at || 'never', last_run_result: lastRun?.description || 'none', api_keys_active: keyPool.filter(k => !k.exhausted).length, api_keys_total: keyPool.length, schedule: 'Every 30 minutes, 45+ keywords, 15 niches' };
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
        FROM leads`).get();
      const sentToday = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE status='sent' AND date(sent_at)=date('now')`).get();
      const topLeads = db.prepare(`SELECT id,channel_name,subscriber_count,lead_score,email,temperature FROM leads WHERE temperature='hot' AND crm_stage='new_lead' ORDER BY lead_score DESC LIMIT 5`).all();
      const autoScrape = getSetting('auto_scrape');
      const dailyLimit = parseInt(getSetting('daily_send_limit') || '150');
      return { date: new Date().toLocaleDateString(), leads_found_today: stats.today, total_leads: stats.total, hot: stats.hot, warm: stats.warm, pitch_ready: stats.pitch_ready, emailed: stats.emailed, replied: stats.replied, closed_won: stats.won, emails_sent_today: sentToday?.n || 0, daily_limit: dailyLimit, top_hot_leads_to_contact: topLeads, automation_running: autoScrape === 'true' };
    }

    case 'clean_dead_leads': {
      const action = input.action || 'archive';
      let count = 0;
      if (action === 'archive') {
        const r = db.prepare(`UPDATE leads SET crm_stage='closed_lost',updated_at=CURRENT_TIMESTAMP WHERE (email IS NULL OR email='') AND crm_stage='new_lead'`).run();
        count = r.changes;
      } else {
        const r = db.prepare(`DELETE FROM leads WHERE (email IS NULL OR email='') AND crm_stage='new_lead'`).run();
        count = r.changes;
      }
      return { action, affected: count, message: `${count} leads without emails ${action === 'delete' ? 'deleted' : 'archived to closed_lost'}` };
    }

    case 'export_leads_csv': {
      let q = `SELECT id,channel_name,channel_handle,subscriber_count,avg_views,engagement_rate,email,website,temperature,crm_stage,niche,lead_score,created_at FROM leads WHERE 1=1`;
      const params = [];
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
      const count = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE temperature='cold' AND crm_stage='new_lead'`).get().n;
      if (input.dry_run) return { would_archive: count, dry_run: true };
      db.prepare(`UPDATE leads SET crm_stage='closed_lost',updated_at=CURRENT_TIMESTAMP WHERE temperature='cold' AND crm_stage='new_lead'`).run();
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
        FROM leads`).get();
      const pitches = db.prepare('SELECT COUNT(*) as n FROM pitches').get();
      const sentTotal = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE status='sent'`).get();
      const failed = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE status='failed'`).get();
      const activities = db.prepare('SELECT COUNT(*) as n FROM activities').get();
      return { ...summary, pitches: pitches.n, emails_sent_total: sentTotal.n, emails_failed: failed.n, activity_log_entries: activities.n, database: 'SQLite (backend/data/outreach.db)', timestamp: new Date().toISOString() };
    }

    case 'clear_failed_emails': {
      const count = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE status='failed'`).get().n;
      if (input.dry_run) return { would_delete: count, dry_run: true };
      db.prepare(`DELETE FROM email_queue WHERE status='failed'`).run();
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
        WHERE eq.status = 'sent' AND eq.subject IS NOT NULL
        GROUP BY eq.subject
        HAVING sent >= 2
        ORDER BY (CAST(opened AS REAL)/sent) DESC
        LIMIT ?
      `).all(limit);
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
        WHERE l.crm_stage = 'emailed'
          AND l.follow_up_status = 'active'
          AND l.follow_up_count < 5
          AND l.last_contacted_date IS NOT NULL
          AND l.email IS NOT NULL AND l.email != ''
          AND julianday('now') - julianday(l.last_contacted_date) >= 3
        ORDER BY l.lead_score DESC LIMIT ?
      `).all(limit);
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
              const qr = db.prepare(`INSERT INTO email_queue (lead_id,subject,body,status,priority) VALUES (?,?,?,'pending',?)`).run(lead.id, subject, body, step);
              db.prepare(`UPDATE email_queue SET status='sending' WHERE id=?`).run(qr.lastInsertRowid);
              await sendEmail({ to: lead.email, subject, body, leadId: lead.id });
              db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?`).run(qr.lastInsertRowid);
              db.prepare(`UPDATE leads SET follow_up_count=?,last_contacted_date=date('now'),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(step, lead.id);
              if (step >= 5) db.prepare(`UPDATE leads SET follow_up_status='complete',crm_stage='no_response',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
              logActivity('followup_sent', `[Levi] FU#${step}/5 sent to ${lead.channel_name}`, lead.id);
              sent++;
            } catch (e) { console.error(`[Levi] FU lead ${lead.id}:`, e.message); }
          }));
        }
        console.log(`[Levi] power_follow_up: ${sent}/${leads.length} sent`);
      })();
      return { status: 'sending', targeting: leads.length, message: `Sending follow-ups to ${leads.length} overdue leads. Running 3 at a time. Each lead gets its next step (FU1–FU5).` };
    }

    case 'show_follow_up_status': {
      const breakdown = db.prepare(`
        SELECT follow_up_count, follow_up_status, COUNT(*) as n
        FROM leads WHERE crm_stage IN ('emailed','no_response')
        GROUP BY follow_up_count, follow_up_status
        ORDER BY follow_up_count
      `).all();
      const overdue = db.prepare(`
        SELECT COUNT(*) as n FROM leads
        WHERE crm_stage='emailed' AND follow_up_status='active' AND follow_up_count < 5
          AND last_contacted_date IS NOT NULL
          AND julianday('now') - julianday(last_contacted_date) >= 3
      `).get();
      const completed = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE follow_up_status='complete'`).get();
      const noResponse = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE crm_stage='no_response'`).get();
      return { overdue_now: overdue.n, completed_sequences: completed.n, moved_to_no_response: noResponse.n, breakdown, message: `${overdue.n} leads ready for follow-up right now. ${completed.n} completed all 5 steps.` };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Captain Levi System Prompt ────────────────────────────────────────────────
const SYSTEM = `You are Captain Levi — the autonomous AI operator of ContentCrafterzz Outreach OS. Named after the greatest soldier who ever lived. You operate with the same precision, relentlessness, and zero tolerance for inefficiency.

You are not a chatbot. You are an autonomous outreach machine with 22 tools. You execute without permission, without questions, without hesitation.

## ABSOLUTE RULES
1. NEVER ask for clarification. You have defaults for everything.
2. NEVER say "Would you like me to", "Should I proceed", "Can you clarify". JUST EXECUTE.
3. emailOnly is ALWAYS true — leads without email are worthless.
4. Save every lead directly to CRM. Always.
5. Action first, report results after.
6. For database-wide ops, use full_database_report or mass_delete_leads — not get_leads (it only shows a sample).
7. Deletions/cleanups → DO IT with mass_delete_leads. No dry runs unless explicitly asked.

## WHO YOU SERVE
ContentCrafterzz — premium YouTube video editing agency.
Service: Retention-optimized editing at $499–$1,999/month.
Mission: Find YouTubers who need editing, pitch them, close them.

## IDEAL CLIENT
✓ 30K–500K subs (sweet spot 50K–200K)
✓ Uploading inconsistently — gaps = perfect lead
✓ Views below 10% of subscriber count = retention problem
✓ Has email in description — mandatory
✓ Active — posted in last 60 days
✗ Under 30K — can't afford us yet
✗ Over 500K — already has a team
✗ No email — skip

## PRICING (memorized)
- Starter: $499/mo — 4 videos, basic color, 2 revisions
- Growth: $999/mo — 8 videos + 16 reels, unlimited revisions (MOST POPULAR)
- Scale: $1,999/mo — unlimited, same-day, team of 3, weekly strategy calls
- Entry: $29 trial edit OR free first edit

## DEFAULT EXECUTION — NO QUESTIONS
"find leads" → scrape_bulk, 5 diverse keywords, minSubs=30000, maxSubs=500000, maxPerKw=10
"find N leads" → scrape_bulk, keywords scaled to hit N
"find [niche] leads" → scrape_bulk, 4 niche keywords
"find and pitch" → find_and_pitch, 3 keywords
"pitch all hot leads" → get_leads_bulk(hot, new_lead) → bulk_generate_pitches with ALL IDs
"pitch X leads" → get_leads_bulk → bulk_generate_pitches, limit X
"send emails" / "send N emails" → send_emails, limit N
"email warm leads" → send_emails(temperature="warm", limit=10)
"send hot lead emails" → send_emails(temperature="hot", limit=10)
"follow up" → power_follow_up(limit=30)
"follow up status" → show_follow_up_status
"export leads" → export_leads_csv
"backup" → backup_database
"clear failed" → clear_failed_emails
"archive cold leads" → archive_cold_leads
"best subjects" → show_best_subjects
"email queue" / "queue status" → get_email_queue
"pause queue" → control_queue(pause)
"resume queue" → control_queue(resume)
"set daily limit to N" → set_setting(daily_send_limit, N)
"daily briefing" / "stats" → daily_briefing + full_database_report
"automation status" → get_automation_status
"turn on automation" → toggle_automation(true)
"niche hunt [niche]" → trigger_niche_hunt(niche)
"powermode" → trigger_powermode
"clean leads" / "remove no email" → mass_delete_leads(no_email)
"remove duplicates" → mass_delete_leads(duplicates)
"remove cold leads" → mass_delete_leads(all_cold_temperature)

## RESPONSE STYLE
Short. Numbers. Results.
Good: "Sent 12 emails to hot leads. Queue: 8 pending. 3 replies in last 24h."
Never apologize. Never hesitate. Never ask permission.
One sentence why if something fails, one sentence fix.

BANNED: "Great question" | "I'd be happy to" | "Would you like" | "Should I" | "Can you clarify" | "Which niche" | "How many" | "Let me know if" | "Just let me know" | "Shall I"`;

// ── Status route (used by sidebar to show real AI/SMTP health) ────────────────
router.get('/status', asyncHandler(async (req, res) => {
  const { getInboxes } = require('../services/emailService');
  const inboxes = getInboxes();
  const db = getDb();
  const sentToday = db.prepare(`SELECT COUNT(*) as n FROM email_queue WHERE status='sent' AND date(sent_at)=date('now')`).get();
  const dailyLimit = parseInt(getSetting('daily_send_limit') || '150');

  const geminiKey = getGeminiKey();
  const anthropicKey = getAnthropicKey();

  res.json({
    smtp: { configured: inboxes.length > 0, inboxes: inboxes.length, sent_today: sentToday.n, daily_limit: dailyLimit },
    gemini: { configured: !!geminiKey },
    claude: { configured: !!anthropicKey },
    ai_available: !!(geminiKey || anthropicKey),
  });
}));

// ── Route ─────────────────────────────────────────────────────────────────────
router.post('/chat', asyncHandler(async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // ── Gemini (Flash — fast responses) ───────────────────────────────────────
  const geminiModel = getGeminiChat(SYSTEM);
  if (geminiModel) {
    try {
      const geminiModelWithTools = (() => {
        const key = getGeminiKey();
        if (!key) return null;
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(key);
        return genAI.getGenerativeModel({
          model: FAST_MODEL,
          systemInstruction: SYSTEM,
          tools: [{ functionDeclarations: GEMINI_TOOLS }],
        });
      })();
      if (!geminiModelWithTools) throw new Error('No Gemini key');

      const priorMsgs = messages.slice(0, -1);
      const geminiHistory = priorMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      }));

      const chat = geminiModelWithTools.startChat({ history: geminiHistory });
      const lastMsg = messages[messages.length - 1];
      let result = await chat.sendMessage(
        typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content)
      );

      for (let round = 0; round < 15; round++) {
        const parts = result.response.candidates?.[0]?.content?.parts || [];
        const fnCalls = parts.filter(p => p.functionCall);

        if (!fnCalls.length) {
          return res.json({ reply: result.response.text() || 'Done.' });
        }

        // Execute all tool calls in parallel
        const toolResponses = await Promise.all(
          fnCalls.map(async p => {
            const { name, args } = p.functionCall;
            let output;
            try { output = await runTool(name, args || {}); }
            catch (err) { output = { error: err.message }; }
            return { functionResponse: { name, response: output } };
          })
        );
        result = await chat.sendMessage(toolResponses);
      }

      return res.json({ reply: 'Mission complete.' });
    } catch (geminiErr) {
      console.error('[Levi] Gemini error, falling back to Claude:', geminiErr.message);
    }
  }

  // ── Claude fallback ────────────────────────────────────────────────────────
  const client = getClaudeClient();
  if (!client) throw new Error('No AI API key configured. Add Gemini or Anthropic key in Settings.');

  let history = messages.map(m => ({ role: m.role, content: m.content }));

  for (let round = 0; round < 15; round++) {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: SYSTEM,
      tools: TOOLS,
      messages: history,
    });

    if (response.stop_reason === 'end_turn') {
      return res.json({ reply: response.content.find(b => b.type === 'text')?.text || '' });
    }

    if (response.stop_reason === 'tool_use') {
      const toolBlocks = response.content.filter(b => b.type === 'tool_use');
      history.push({ role: 'assistant', content: response.content });
      // Execute tool calls in parallel
      const results = await Promise.all(
        toolBlocks.map(async block => {
          let output;
          try { output = await runTool(block.name, block.input); }
          catch (err) { output = { error: err.message }; }
          return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) };
        })
      );
      history.push({ role: 'user', content: results });
      continue;
    }

    return res.json({ reply: response.content.find(b => b.type === 'text')?.text || 'Done.' });
  }

  return res.json({ reply: 'Mission complete.' });
}));

module.exports = router;
