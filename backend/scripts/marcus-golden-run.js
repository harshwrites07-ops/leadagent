// Marcus V2, Part 7 — Golden test set runner.
// Run after ANY change to prompts, gates, or examples. Diffs against the
// previous report (manually, by reading the saved markdown files) — no
// change ships if the golden run got worse.
//
// Usage: node backend/scripts/marcus-golden-run.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env'), override: false });
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const fs = require('fs');
const path = require('path');
const { initializeDatabase, getDb } = require('../src/models/database');
const { buildCreatorIntelligencePack } = require('../src/services/channelAnalyzer');
const { selectAngle } = require('../src/services/angleEngine');
const { buildMARCUSPrompt, completeSmart } = require('../src/services/claudeService');
const { runCodeGate, describeViolation } = require('../src/services/codeGate');
const { runQualityGate, buildCreatorData } = require('../src/qualityGate');

const TEST_USER = { full_name: 'Prathvi', service_type: 'professional video editing' };
const TEST_VOICE_DNA = {
  name: 'Prathvi',
  service: 'professional video editing',
  confidence_register: 'direct',
  voice_summary: 'casual, direct, peer-to-peer — writes like texting a friend who happens to run a YouTube channel',
  best_result: 'helped a gaming channel grow from 50K to 200K subs in 3 months with better editing',
};
const TEST_VOICE_SAMPLE = `Hey, saw your last video — the intro dragged a bit before you got to the point. I've edited channels in your exact niche before, took one from posting every 3 weeks to weekly because the editing bottleneck was gone. Happy to send a sample cut of one of your videos if you want to see the difference. No pressure either way.`;

const estimateTokens = (text) => Math.ceil((text || '').length / 4);

// ── Golden lead selection — 10 categories per Part 7 ────────────────────────
async function selectGoldenLeads(db) {
  const picked = new Map();
  const add = async (label, sql) => {
    if (picked.size >= 10) return;
    const rows = await db.all(sql);
    for (const r of rows) {
      if (!picked.has(r.id) && picked.size < 10) { picked.set(r.id, { ...r, category: label }); break; }
    }
  };

  // 1. Burnout grinder — long upload gap + a standout best video vs recent avg
  await add('Burnout grinder (long gap, strong best video)', `
    SELECT * FROM leads WHERE subscriber_count IS NOT NULL AND channel_name IS NOT NULL
    AND upload_frequency_days IS NOT NULL AND julianday('now') - julianday(last_upload_date) > 30
    ORDER BY subscriber_count DESC LIMIT 5`);

  // 2. Job-post-detected lead
  await add('Job-post detected (hiring signal)', `
    SELECT * FROM leads WHERE subscriber_count IS NOT NULL AND channel_name IS NOT NULL
    AND (channel_description LIKE '%looking for%' OR channel_description LIKE '%hiring%' OR channel_description LIKE '%editor wanted%' OR channel_description LIKE '%need a%')
    ORDER BY RANDOM() LIMIT 5`);

  // 3. Small breakout channel (<10K, active)
  await add('Small breakout channel (<10K subs)', `
    SELECT * FROM leads WHERE subscriber_count IS NOT NULL AND channel_name IS NOT NULL
    AND subscriber_count < 10000 AND subscriber_count > 500
    ORDER BY RANDOM() LIMIT 5`);

  // 4. Plateaued mid-size (100K+)
  await add('Plateaued mid-size (100K+)', `
    SELECT * FROM leads WHERE subscriber_count IS NOT NULL AND channel_name IS NOT NULL
    AND subscriber_count BETWEEN 100000 AND 500000
    ORDER BY RANDOM() LIMIT 5`);

  // 5. Declining big channel (500K+)
  await add('Declining big channel (500K+)', `
    SELECT * FROM leads WHERE subscriber_count IS NOT NULL AND channel_name IS NOT NULL
    AND subscriber_count > 500000
    ORDER BY RANDOM() LIMIT 5`);

  // 6. Perfectionist — low video count, long gaps
  await add('Perfectionist (low volume, long gaps)', `
    SELECT * FROM leads WHERE subscriber_count IS NOT NULL AND channel_name IS NOT NULL
    AND total_videos IS NOT NULL AND total_videos < 50
    AND julianday('now') - julianday(last_upload_date) > 20
    ORDER BY RANDOM() LIMIT 5`);

  // 7. Shorts-gap lead — approximate via mid-size long-form-heavy channel
  await add('Shorts-gap lead (long-form strong)', `
    SELECT * FROM leads WHERE subscriber_count IS NOT NULL AND channel_name IS NOT NULL
    AND subscriber_count BETWEEN 20000 AND 150000
    ORDER BY RANDOM() LIMIT 5`);

  // 8. Non-English-market creator
  await add('Non-English-market creator', `
    SELECT * FROM leads WHERE subscriber_count IS NOT NULL AND channel_name IS NOT NULL
    AND country IS NOT NULL AND country NOT IN ('US','GB','CA','AU','NZ','IE')
    ORDER BY RANDOM() LIMIT 5`);

  // 9. Sparse-data lead — missing fields (graceful degradation test)
  await add('Sparse-data lead (missing fields)', `
    SELECT * FROM leads WHERE channel_name IS NOT NULL AND subscriber_count IS NOT NULL
    AND (channel_description IS NULL OR channel_description = '' OR recent_videos IS NULL OR recent_videos = '[]' OR most_viewed_video IS NULL)
    ORDER BY RANDOM() LIMIT 5`);

  // 10. Just-went-viral lead — capacity strain signal
  await add('Just-went-viral (capacity strain)', `
    SELECT * FROM leads WHERE subscriber_count IS NOT NULL AND channel_name IS NOT NULL
    AND avg_views IS NOT NULL AND avg_views > 0
    ORDER BY RANDOM() LIMIT 5`);

  // Pad with random usable leads if any category came up empty
  while (picked.size < 10) {
    const rows = await db.all(`SELECT * FROM leads WHERE subscriber_count IS NOT NULL AND channel_name IS NOT NULL AND channel_name != '' ORDER BY RANDOM() LIMIT 10`);
    let added = false;
    for (const r of rows) {
      if (!picked.has(r.id) && picked.size < 10) { picked.set(r.id, { ...r, category: 'Padding (random usable lead)' }); added = true; break; }
    }
    if (!added) break; // DB exhausted
  }

  return Array.from(picked.values());
}

// ── Per-lead pipeline run: full production path — generation → code gate →
// runQualityGate orchestrator (AI-gate score → surgical retry → angle-switch
// if needed). Reports both the first-draft score and the final shipped score
// so the report shows what the gate actually fixed. ─────────────────────────
async function runOnLead(lead) {
  const t0 = Date.now();
  const intelligencePack = buildCreatorIntelligencePack(lead);
  const angleResult = selectAngle(intelligencePack, { ...TEST_USER, voice_dna: TEST_VOICE_DNA });

  const user = { ...TEST_USER, voice_sample_1: TEST_VOICE_SAMPLE };
  let promptTokens = 0;
  let generated = null;
  let codeGateViolations = [];
  let codeGateAttempts = 0;
  let previousFeedback = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildMARCUSPrompt(lead, user, TEST_VOICE_DNA, intelligencePack, angleResult, previousFeedback);
    if (attempt === 1) promptTokens = estimateTokens(prompt);
    try {
      const raw = await completeSmart(prompt, '', 1200);
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)[0]);
      if (!parsed.subject || !parsed.body) throw new Error('Missing subject/body');
      const gate = runCodeGate(parsed, intelligencePack);
      if (gate.passed) { generated = parsed; codeGateViolations = []; break; }
      codeGateAttempts++;
      codeGateViolations = gate.violations;
      if (attempt === 3) { generated = parsed; break; }
      previousFeedback = describeViolation(gate.violations[0]);
    } catch (e) {
      previousFeedback = 'the response could not be parsed as valid JSON with "subject" and "body" fields.';
      if (attempt === 3) generated = { subject: '(generation failed)', body: `Error: ${e.message}` };
    }
  }

  const firstDraft = { subject: generated.subject, body: generated.body };
  let gateResult = null;
  try {
    gateResult = await runQualityGate(
      `Subject: ${generated.subject}\n\n${generated.body}`,
      buildCreatorData(lead), TEST_VOICE_DNA, null,
      intelligencePack, angleResult, lead, user,
    );
  } catch (e) {
    gateResult = { quality: { score: 0, error: e.message }, attempts: 0, regenerated: false, warning: true, qualityStatus: 'ERROR' };
  }

  return {
    lead, intelligencePack, angleResult, firstDraft,
    final: gateResult.email,
    quality: gateResult.quality,
    attempts: gateResult.attempts,
    regenerated: gateResult.regenerated,
    qualityStatus: gateResult.qualityStatus,
    codeGateViolations, codeGateAttempts,
    promptTokens,
    timeMs: Date.now() - t0,
  };
}

// ── Report ───────────────────────────────────────────────────────────────
function renderReport(results) {
  const lines = [];
  lines.push(`# Marcus V2 — Golden Run Report`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Pipeline: generation → code gate → runQualityGate (AI-gate score → surgical retry → angle-switch)\n`);

  const avgScore = Math.round(results.reduce((s, r) => s + (r.quality?.score || 0), 0) / results.length);
  const avgTokens = Math.round(results.reduce((s, r) => s + r.promptTokens, 0) / results.length);
  const avgTime = Math.round(results.reduce((s, r) => s + r.timeMs, 0) / results.length);
  const codeGateCleanFirstTry = results.filter(r => r.codeGateAttempts === 0).length;
  const shipped85 = results.filter(r => (r.quality?.score || 0) >= 85).length;
  const needsReview = results.filter(r => r.qualityStatus === 'NEEDS_REVIEW').length;
  const regenerated = results.filter(r => r.regenerated).length;

  lines.push(`## Summary`);
  lines.push(`- Leads run: ${results.length}`);
  lines.push(`- Average final AI-gate score: ${avgScore}/100`);
  lines.push(`- Shipped at 85+: ${shipped85}/${results.length}`);
  lines.push(`- NEEDS_REVIEW (still <70 after gate): ${needsReview}/${results.length}`);
  lines.push(`- Gate regenerated/retried: ${regenerated}/${results.length}`);
  lines.push(`- Average prompt tokens (estimated, first draft): ${avgTokens}`);
  lines.push(`- Average time per email (full pipeline): ${avgTime}ms`);
  lines.push(`- Code-gate clean on first draft: ${codeGateCleanFirstTry}/${results.length}\n`);

  lines.push(`## Per-lead results\n`);
  lines.push(`| # | Lead | Category | First Draft | Final Score | Status | Gate Attempts | Code Gate | Tokens | Time |`);
  lines.push(`|---|------|----------|-------------|-------------|--------|----------------|-----------|--------|------|`);
  results.forEach((r, i) => {
    const cgStatus = r.codeGateAttempts === 0 ? 'clean' : `${r.codeGateAttempts} retry(s)`;
    lines.push(`| ${i + 1} | ${r.lead.channel_name} | ${r.lead.category} | — | ${r.quality?.score ?? '?'} | ${r.qualityStatus} | ${r.attempts} | ${cgStatus} | ${r.promptTokens} | ${r.timeMs}ms |`);
  });

  lines.push(`\n## Full emails (final, as-shipped)\n`);
  results.forEach((r, i) => {
    lines.push(`### ${i + 1}. ${r.lead.channel_name} — ${r.lead.category}`);
    lines.push(`**Angle:** ${r.angleResult.selected_angle} · **Final score:** ${r.quality?.score ?? '?'}/100 (${r.qualityStatus}) · **Gate attempts:** ${r.attempts} · **Regenerated:** ${r.regenerated ? 'yes' : 'no'} · **Code gate on first draft:** ${r.codeGateViolations.length ? r.codeGateViolations.map(v => v.type).join(', ') : 'clean'}\n`);
    lines.push('```');
    lines.push(r.final);
    lines.push('```');
    if (r.quality?.weakest_sentence) {
      lines.push(`\n_Weakest sentence still flagged: "${r.quality.weakest_sentence}" — ${r.quality.fix_direction}_`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

(async () => {
  await initializeDatabase();
  const db = getDb();

  console.log('Selecting 10 golden leads...');
  const leads = await selectGoldenLeads(db);
  console.log(`Selected ${leads.length} leads:`);
  leads.forEach((l, i) => console.log(`  ${i + 1}. [${l.id}] ${l.channel_name} — ${l.category}`));

  if (leads.length < 10) {
    console.warn(`\nWARNING: only found ${leads.length}/10 usable leads in this database — running with what's available.\n`);
  }

  console.log('\nRunning Marcus V2 pipeline on each lead...\n');
  const results = [];
  for (const lead of leads) {
    process.stdout.write(`  ${lead.channel_name}... `);
    try {
      const r = await runOnLead(lead);
      results.push(r);
      console.log(`score=${r.aiGate?.score ?? '?'} tokens=${r.promptTokens} time=${r.timeMs}ms`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  const report = renderReport(results);
  const outPath = path.join(__dirname, '../golden-run-report.md');
  fs.writeFileSync(outPath, report, 'utf-8');
  console.log(`\nReport written to ${outPath}\n`);
  console.log(report);
  process.exit(0);
})().catch(e => {
  console.error('Golden run failed:', e);
  process.exit(1);
});
