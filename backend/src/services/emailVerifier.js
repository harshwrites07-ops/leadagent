const axios = require('axios');
const { hasMxRecord } = require('./emailService');

// Pluggable verification drivers. Each takes an email string and returns
// { status: 'valid'|'invalid'|'risky'|'unknown', provider }. Adding a new
// provider (ZeroBounce, etc.) is one more entry in this map plus an env var
// check in resolveDriver() — never hard-fail a send on provider outage,
// always degrade to 'unknown' rather than blocking or crashing.

async function mxOnlyDriver(email) {
  const domain = (email.split('@')[1] || '').toLowerCase();
  if (!domain) return { status: 'invalid', provider: 'mx-only' };
  try {
    const ok = await hasMxRecord(domain);
    return { status: ok ? 'unknown' : 'invalid', provider: 'mx-only' };
  } catch {
    return { status: 'unknown', provider: 'mx-only' };
  }
}

// MillionVerifier single-check API: https://www.millionverifier.com/api/
async function millionVerifierDriver(email) {
  const apiKey = process.env.MILLIONVERIFIER_API_KEY;
  try {
    const { data } = await axios.get('https://api.millionverifier.com/api/v3/', {
      params: { api: apiKey, email, timeout: 10 },
      timeout: 12000,
    });
    // MillionVerifier result codes: ok (deliverable), catch_all, unknown,
    // disposable, invalid, error. Map conservatively — anything not clearly
    // valid/invalid degrades to risky/unknown rather than guessing.
    const result = (data?.result || '').toLowerCase();
    if (result === 'ok') return { status: 'valid', provider: 'millionverifier' };
    if (result === 'invalid' || result === 'disposable') return { status: 'invalid', provider: 'millionverifier' };
    if (result === 'catch_all') return { status: 'risky', provider: 'millionverifier' };
    return { status: 'unknown', provider: 'millionverifier' };
  } catch (e) {
    console.warn(`[EmailVerifier] MillionVerifier check failed for domain of ${email}: ${e.message} — degrading to unknown`);
    return { status: 'unknown', provider: 'millionverifier' };
  }
}

function resolveDriver() {
  if (process.env.MILLIONVERIFIER_API_KEY) return millionVerifierDriver;
  return mxOnlyDriver;
}

async function verify(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { status: 'invalid', checked_at: new Date().toISOString(), provider: 'format' };
  }
  const driver = resolveDriver();
  let result;
  try {
    result = await driver(email);
  } catch (e) {
    console.error(`[EmailVerifier] Driver threw unexpectedly for ${email}: ${e.message} — degrading to unknown`);
    result = { status: 'unknown', provider: 'error' };
  }
  return { ...result, checked_at: new Date().toISOString() };
}

// Batch verification job — picks 'unchecked' emails in priority order
// (quality_leads HOT, then WARM, then hot leads, then everything else),
// rate-limited, budget-capped by the admin `daily_verify_limit` setting
// (default 500/day). Updates every row across leads/master_leads/
// quality_leads that shares the same email (pool-wide, not per-row) so a
// once-verified address doesn't get re-billed against the budget elsewhere.
async function runEmailVerificationBatch(limitOverride = null) {
  const { getDb, getSetting } = require('../models/database');
  const db = getDb();
  const limit = limitOverride ?? parseInt(getSetting('daily_verify_limit') || '500');

  const candidates = await db.all(`
    SELECT email, 1 as priority FROM quality_leads WHERE email_status = 'unchecked' AND email IS NOT NULL AND email != '' AND intent_tier = 'HOT'
    UNION
    SELECT email, 2 as priority FROM quality_leads WHERE email_status = 'unchecked' AND email IS NOT NULL AND email != '' AND intent_tier = 'WARM'
    UNION
    SELECT email, 3 as priority FROM leads WHERE email_status = 'unchecked' AND email IS NOT NULL AND email != '' AND temperature = 'hot'
    UNION
    SELECT email, 4 as priority FROM leads WHERE email_status = 'unchecked' AND email IS NOT NULL AND email != ''
    UNION
    SELECT email, 5 as priority FROM master_leads WHERE email_status = 'unchecked' AND email IS NOT NULL AND email != '' AND (email_corrupt IS NULL OR email_corrupt = 0)
    ORDER BY priority ASC
    LIMIT ?
  `, [limit]);

  let checked = 0, valid = 0, invalid = 0, risky = 0, unknown = 0;

  for (const row of candidates) {
    const result = await verify(row.email);
    checked++;
    if (result.status === 'valid') valid++;
    else if (result.status === 'invalid') invalid++;
    else if (result.status === 'risky') risky++;
    else unknown++;

    for (const table of ['leads', 'master_leads', 'quality_leads']) {
      try {
        await db.run(`UPDATE ${table} SET email_status = ?, email_checked_at = ? WHERE email = ?`, [result.status, result.checked_at, row.email]);
      } catch {}
    }

    // Be polite to whichever provider is active — mx-only is local DNS
    // (cheap), millionverifier is a paid external API.
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[EmailVerifier] Batch complete — checked=${checked} valid=${valid} invalid=${invalid} risky=${risky} unknown=${unknown}`);
  return { checked, valid, invalid, risky, unknown, limit };
}

module.exports = { verify, runEmailVerificationBatch };
