// Rate-limited background backfill for leads missing video data (Marcus v2
// data-quality fix, part c). Iterates leads where recent_videos/recent_video_title
// are both empty, fetches live from YouTube respecting the key-pool quota,
// and writes video_data_status so unfetchable leads (channel_gone) stop
// being retried forever while transient failures (fetch_failed) get another
// shot on a future run.
//
// Priority order: leads someone actually tried to generate a pitch for
// recently (crm_stage='needs_research' — set exactly when the pitch-gen gate
// blocks a lead) first, then by how recently the owning user was active.
//
// Designed to run either as a one-off CLI (scripts/backfillMissingVideoData.js)
// or triggered on-demand from the running server via the admin route in
// routes/leads.js — both call runVideoBackfill() and share this in-memory
// progress state, so only one can run at a time.

const { getDb } = require('../models/database');

const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  processed: 0,
  ok: 0,
  fetchFailed: 0,
  channelGone: 0,
  total: 0,
  lastLead: null,
  stopped: false,
};

function getBackfillStatus() {
  return { ...state };
}

function stopBackfill() {
  state.stopped = true;
}

async function runVideoBackfill({ concurrency = 3, batchDelayMs = 1500, quotaPauseMs = 30 * 60 * 1000 } = {}) {
  if (state.running) return { alreadyRunning: true, ...state };
  const { fetchVideoData, applyVideoDataToLead, isQuotaExhausted } = require('./youtubeService');

  const db = getDb();
  const leads = await db.all(`
    SELECT l.id, l.channel_id, l.channel_name, l.user_id, l.crm_stage
    FROM leads l
    JOIN users u ON u.id = l.user_id
    WHERE (l.recent_videos IS NULL OR l.recent_videos = '[]' OR l.recent_videos = '')
      AND (l.recent_video_title IS NULL OR l.recent_video_title = '')
      AND (l.video_data_status IS NULL OR l.video_data_status = 'fetch_failed')
      AND l.channel_id IS NOT NULL AND l.channel_id != ''
    ORDER BY (CASE WHEN l.crm_stage = 'needs_research' THEN 1 ELSE 0 END) DESC, u.last_login DESC
  `);

  Object.assign(state, {
    running: true, startedAt: new Date().toISOString(), finishedAt: null,
    processed: 0, ok: 0, fetchFailed: 0, channelGone: 0,
    total: leads.length, lastLead: null, stopped: false,
  });

  console.log(`[VideoBackfill] Starting — ${leads.length} leads to enrich (concurrency=${concurrency})`);

  for (let i = 0; i < leads.length; i += concurrency) {
    if (state.stopped) { console.log('[VideoBackfill] Stopped by request'); break; }

    if (isQuotaExhausted()) {
      console.log(`[VideoBackfill] Quota exhausted at ${state.processed}/${state.total} — pausing ${Math.round(quotaPauseMs / 60000)} min`);
      await new Promise(r => setTimeout(r, quotaPauseMs));
      i -= concurrency; // retry this same batch once quota may have reset
      continue;
    }

    const batch = leads.slice(i, i + concurrency);
    await Promise.all(batch.map(async lead => {
      try {
        const result = await fetchVideoData(lead.channel_id);
        await applyVideoDataToLead(db, lead.id, result);
        if (result.status === 'ok') state.ok++;
        else if (result.status === 'channel_gone') state.channelGone++;
        else state.fetchFailed++;
      } catch (e) {
        state.fetchFailed++;
        console.warn(`[VideoBackfill] lead ${lead.id} (${lead.channel_name}) threw:`, e.message);
      }
      state.processed++;
      state.lastLead = lead.channel_name;
    }));

    if (state.processed % 50 < concurrency || i + concurrency >= leads.length) {
      console.log(`[VideoBackfill] ${state.processed}/${state.total} — ok=${state.ok} fetch_failed=${state.fetchFailed} channel_gone=${state.channelGone}`);
    }
    if (batchDelayMs > 0 && i + concurrency < leads.length) await new Promise(r => setTimeout(r, batchDelayMs));
  }

  state.running = false;
  state.finishedAt = new Date().toISOString();
  console.log(`[VideoBackfill] Done — ok=${state.ok} fetch_failed=${state.fetchFailed} channel_gone=${state.channelGone} of ${state.total}`);
  return { ...state };
}

module.exports = { runVideoBackfill, getBackfillStatus, stopBackfill };
