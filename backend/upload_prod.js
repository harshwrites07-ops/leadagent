/**
 * One-time script: uploads local master_leads to production Railway DB
 * Run: node upload_prod.js YOUR_PASSWORD
 */
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

const PROD = 'https://app.quelro.com';
const EMAIL = 'harshwrites07@gmail.com';
const PASS = process.argv[2];

async function main() {
  if (!PASS) { console.error('Usage: node upload_prod.js <password>'); process.exit(1); }

  console.log('Logging in to production...');
  const loginRes = await axios.post(`${PROD}/api/auth/login`, { email: EMAIL, password: PASS });
  const rawCookies = loginRes.headers['set-cookie'];
  if (!rawCookies) { console.error('Login failed — wrong password?'); process.exit(1); }
  const cookie = rawCookies.map(c => c.split(';')[0]).join('; ');
  console.log('Logged in ✓');

  const db = new Database(path.join(__dirname, 'data/outreach.db'));
  const leads = db.prepare(`
    SELECT channel_id, channel_name, channel_handle, subscriber_count, avg_views,
           email, website, channel_description, lead_score, temperature, country, niche
    FROM master_leads WHERE email IS NOT NULL AND email != ''
  `).all();
  console.log(`${leads.length} leads to upload`);

  const CHUNK = 500;
  for (let i = 0; i < leads.length; i += CHUNK) {
    const batch = leads.slice(i, i + CHUNK);
    const { data } = await axios.post(
      `${PROD}/api/auth/admin/seed-master-leads`,
      { leads: batch },
      { headers: { Cookie: cookie } }
    );
    console.log(`Chunk ${Math.floor(i/CHUNK)+1}/${Math.ceil(leads.length/CHUNK)} — +${data.inserted} new | DB total: ${data.total}`);
  }
  console.log('\nDone! All leads uploaded to production.');
}

main().catch(e => { console.error('Error:', e.response?.data || e.message); process.exit(1); });
