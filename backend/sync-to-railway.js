/**
 * Syncs local master_leads to Railway production
 * Run: node sync-to-railway.js
 * Needs: RAILWAY_URL and ADMIN_TOKEN in .env or as env vars
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: false });

const Database = require('better-sqlite3');
const axios = require('axios');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data/outreach.db');
const RAILWAY_URL = process.env.RAILWAY_URL || process.env.APP_URL;
const ADMIN_TOKEN = process.env.SYNC_TOKEN; // JWT token from logging in as admin

if (!RAILWAY_URL) {
  console.error('Set RAILWAY_URL=https://your-app.railway.app in .env');
  process.exit(1);
}
if (!ADMIN_TOKEN) {
  console.error('Set SYNC_TOKEN=<your admin JWT> in .env');
  console.error('Get it from: browser devtools → Network → any /api request → Authorization header');
  process.exit(1);
}

async function main() {
  const db = new Database(DB_PATH);
  const leads = db.prepare(`
    SELECT channel_id, channel_name, channel_handle, subscriber_count, avg_views,
           email, website, channel_description, lead_score, temperature, country, niche
    FROM master_leads
    WHERE email IS NOT NULL AND email != ''
  `).all();

  console.log(`\nSyncing ${leads.length} leads with emails to ${RAILWAY_URL}`);

  const BATCH = 200;
  let total = 0;

  for (let i = 0; i < leads.length; i += BATCH) {
    const batch = leads.slice(i, i + BATCH);
    try {
      const { data } = await axios.post(`${RAILWAY_URL}/api/leads/master/bulk-import`, { leads: batch }, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        timeout: 30000,
      });
      total += data.inserted;
      process.stdout.write(`\r  Synced: ${total} / ${leads.length} | Railway total: ${data.total}`);
    } catch (e) {
      console.error(`\nBatch ${i}-${i + BATCH} failed:`, e.response?.data?.error || e.message);
    }
  }

  console.log(`\n\nDone! ${total} leads pushed to Railway master_leads`);
}

main().catch(console.error);
