require('dotenv').config({ path: require('path').join(__dirname, '../../../.env'), override: false });

const { initializeDatabase, getDb } = require('../models/database');
const { getNextKey } = require('../services/youtubeService');

async function backfillRecentVideos() {
  await initializeDatabase();
  const db = getDb();

  // Step 1: fill from existing recent_videos JSON (free, no API calls)
  const withJson = await db.all(`
    SELECT id, recent_videos FROM leads
    WHERE recent_video_title IS NULL
      AND recent_videos IS NOT NULL
      AND recent_videos != '[]'
      AND recent_videos != ''
  `);

  let fromJson = 0;
  for (const row of withJson) {
    try {
      const vids = JSON.parse(row.recent_videos || '[]');
      const title = vids[0]?.title || null;
      if (title) {
        await db.run('UPDATE leads SET recent_video_title = ? WHERE id = ?', [title, row.id]);
        fromJson++;
      }
    } catch {}
  }
  console.log(`[Step 1] Filled ${fromJson} leads from existing recent_videos JSON (no API used)`);

  // Step 2: remaining NULL — call YouTube Search API
  const needApi = await db.all(`
    SELECT id, channel_id, channel_name FROM leads
    WHERE recent_video_title IS NULL
      AND channel_id IS NOT NULL
      AND channel_id != ''
    LIMIT 500
  `);

  console.log(`[Step 2] ${needApi.length} leads need YouTube API calls. Starting...`);

  let fromApi = 0, failed = 0;

  for (let i = 0; i < needApi.length; i++) {
    const lead = needApi[i];
    const apiKey = getNextKey();

    if (!apiKey) {
      console.log('[Step 2] No YouTube API key available — stopping.');
      break;
    }

    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${lead.channel_id}&order=date&maxResults=1&type=video&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        if (data.error.code === 403) {
          console.log(`[Step 2] Quota exceeded on key. Stopping.`);
          break;
        }
        failed++;
        continue;
      }

      const title = data.items?.[0]?.snippet?.title || null;
      if (title) {
        await db.run('UPDATE leads SET recent_video_title = ? WHERE id = ?', [title, lead.id]);
        fromApi++;
        console.log(`  [${i + 1}/${needApi.length}] ${lead.channel_name} → "${title}"`);
      } else {
        failed++;
      }

      // Respect API rate limits
      await new Promise(r => setTimeout(r, 60));
    } catch (err) {
      console.error(`  [${i + 1}] Failed for ${lead.channel_name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[Done] From JSON: ${fromJson} | From API: ${fromApi} | Failed: ${failed}`);

  // Final count
  const remaining = await db.all(`SELECT COUNT(*) AS c FROM leads WHERE recent_video_title IS NULL`);
  console.log(`Leads still without video title: ${remaining[0]?.c || 0}`);
}

backfillRecentVideos()
  .catch(err => { console.error('[FATAL]', err.message); process.exit(1); })
  .finally(() => process.exit(0));
