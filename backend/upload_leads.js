require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('better-sqlite3')('./data/outreach.db');
const axios = require('axios');

const leads = db.prepare(`
  SELECT channel_id, channel_name, channel_handle, subscriber_count, avg_views,
         email, website, lead_score, temperature, country, niche
  FROM master_leads WHERE email IS NOT NULL AND email != ''
`).all();

console.log('Uploading', leads.length, 'email-verified leads to Railway...');

async function run() {
  const loginRes = await axios.post('https://app.quelro.com/api/auth/login',
    { email: 'harshwrites07@gmail.com', password: 'prathviharsh@13' });
  const cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0];
  if (!cookie) { console.log('Login failed — no session cookie'); process.exit(1); }
  console.log('Logged in as harshwrites07@gmail.com');

  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  let total = 0;
  const batchSize = 200;

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    try {
      const r = await axios.post('https://app.quelro.com/api/auth/admin/seed-master-leads',
        { leads: batch }, { headers, timeout: 30000 });
      total += r.data.inserted;
      console.log(`Batch ${Math.floor(i/batchSize)+1}: +${r.data.inserted} | DB total=${r.data.total} | with email=${r.data.withEmail}`);
    } catch(e) {
      console.log(`Batch ${Math.floor(i/batchSize)+1} failed:`, e.response?.data?.error || e.message);
    }
  }
  console.log(`\nDONE — ${total} new leads uploaded to Railway production`);
}

run().catch(e => { console.error(e.message); process.exit(1); });
