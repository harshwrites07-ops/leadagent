// Load env from project root (.env lives one level above /backend)
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env'), override: false });

const { initializeDatabase, getDb } = require('../models/database');
const { runQualityGate, generateInitialDraft, buildCreatorData } = require('../qualityGate');

const TEST_VOICE_DNA = {
  name: 'Prathvi',
  service: 'professional video editing',
  caseStudy: 'Helped GrowthEdits (gaming channel) grow from 50K to 200K subs in 3 months by restructuring hooks in the first 15 seconds — their watch time hit 68% average',
  best_result: 'helped a gaming channel grow from 50K to 200K subs in 3 months with better editing',
  communicationStyle: 'casual, direct, peer-to-peer',
  uniqueDifference: 'we edit videos that make viewers subscribe, not just watch',
  nicheExperience: 'gaming, education, finance, lifestyle',
};

async function testTenEmails() {
  await initializeDatabase();
  const db = getDb();

  const leads = await db.all(`
    SELECT * FROM leads
    WHERE subscriber_count IS NOT NULL
      AND channel_name IS NOT NULL
      AND channel_name != ''
    ORDER BY RANDOM()
    LIMIT 10
  `);

  if (!leads.length) {
    console.log('No leads found in the database. Import some leads first.');
    process.exit(0);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('QUELRO QUALITY GATE — 10 EMAIL TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  const results = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const creatorData = buildCreatorData(lead);

    console.log(`\n[${i + 1}/${leads.length}] ${creatorData.channelTitle}`);
    console.log(`  Subs:   ${Number(creatorData.subscriberCount || 0).toLocaleString()}`);
    console.log(`  Niche:  ${creatorData.niche || 'Unknown'}`);
    console.log(`  Signal: ${creatorData.intentSignal || 'None'}`);
    console.log('  ─────────────────────────────────────────────────────');

    let initialDraft;
    try {
      initialDraft = await generateInitialDraft(creatorData, TEST_VOICE_DNA);
      console.log('  Initial draft generated. Running quality gate...');
    } catch (err) {
      console.log(`  Initial draft FAILED: ${err.message}`);
      results.push({ channel: creatorData.channelTitle, score: 0, passed: false, attempts: 0, regenerated: false, warning: true });
      continue;
    }

    let gateResult;
    try {
      gateResult = await runQualityGate(
        initialDraft,
        creatorData,
        TEST_VOICE_DNA,
        async (attemptNum, _email, evalResult) => {
          const status = evalResult.score >= 85 ? '✅' : evalResult.score >= 70 ? '⚠️' : '⛔';
          console.log(`  Attempt ${attemptNum}: ${evalResult.score}/100 ${status}`);
        }
      );
    } catch (err) {
      console.log(`  Quality gate FAILED: ${err.message}`);
      results.push({ channel: creatorData.channelTitle, score: 0, passed: false, attempts: 0, regenerated: false, warning: true });
      continue;
    }

    const { score, breakdown = {}, overall_feedback, passed } = gateResult.quality;
    const finalStatus = score >= 85 ? '✅ PASS' : score >= 70 ? '⚠️  WARN' : '⛔ BLOCKED';

    console.log(`\n  FINAL SCORE: ${score}/100  ${finalStatus}`);
    console.log(`  Regenerated: ${gateResult.regenerated ? `Yes (${gateResult.attempts} attempt${gateResult.attempts !== 1 ? 's' : ''})` : 'No (1st attempt)'}`);
    console.log('\n  BREAKDOWN:');
    console.log(`    Personalization  ${String(breakdown.personalization?.points ?? '?').padStart(2)}/20  ${breakdown.personalization?.feedback ?? ''}`);
    console.log(`    Hook             ${String(breakdown.hook?.points ?? '?').padStart(2)}/15  ${breakdown.hook?.feedback ?? ''}`);
    console.log(`    Specificity      ${String(breakdown.specificity?.points ?? '?').padStart(2)}/15  ${breakdown.specificity?.feedback ?? ''}`);
    console.log(`    Value Prop       ${String(breakdown.value_prop?.points ?? '?').padStart(2)}/15  ${breakdown.value_prop?.feedback ?? ''}`);
    console.log(`    CTA              ${String(breakdown.cta?.points ?? '?').padStart(2)}/15  ${breakdown.cta?.feedback ?? ''}`);
    console.log(`    Tone             ${String(breakdown.tone?.points ?? '?').padStart(2)}/12  ${breakdown.tone?.feedback ?? ''}`);
    console.log(`    Spam Flag        ${String(breakdown.spam_flag?.points ?? '?').padStart(2)}/8   ${breakdown.spam_flag?.feedback ?? ''}`);
    console.log(`\n  FEEDBACK: ${overall_feedback}`);
    console.log('\n  FINAL EMAIL:');
    console.log('  ┌──────────────────────────────────────────────────────┐');
    gateResult.email.split('\n').forEach(line => console.log(`  │ ${line}`));
    console.log('  └──────────────────────────────────────────────────────┘');

    results.push({
      channel: creatorData.channelTitle,
      score,
      passed: score >= 85,
      attempts: gateResult.attempts,
      regenerated: gateResult.regenerated,
      warning: gateResult.warning,
      email: gateResult.email,
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');

  results.forEach((r, i) => {
    const icon = r.score >= 85 ? '✅' : r.score >= 70 ? '⚠️ ' : '⛔';
    const regen = r.regenerated ? ` (${r.attempts} attempts)` : ' (1st pass)';
    console.log(`  ${icon} [${String(i + 1).padStart(2)}] ${r.channel.padEnd(35)} ${String(r.score).padStart(3)}/100${regen}`);
  });

  const validResults = results.filter(r => r.attempts > 0);
  const pass85   = validResults.filter(r => r.score >= 85).length;
  const warn70   = validResults.filter(r => r.score >= 70 && r.score < 85).length;
  const blocked  = validResults.filter(r => r.score < 70).length;
  const avgScore = validResults.length
    ? Math.round(validResults.reduce((s, r) => s + r.score, 0) / validResults.length)
    : 0;
  const avgAttempts = validResults.length
    ? (validResults.reduce((s, r) => s + r.attempts, 0) / validResults.length).toFixed(1)
    : '0';

  console.log('\n  ─────────────────────────────────────────────────────');
  console.log(`  Average Score:     ${avgScore}/100`);
  console.log(`  Average Attempts:  ${avgAttempts}`);
  console.log(`  ✅ 85+ (Pass):     ${pass85}/${validResults.length}`);
  console.log(`  ⚠️  70-84 (Warn):  ${warn70}/${validResults.length}`);
  console.log(`  ⛔ <70 (Blocked):  ${blocked}/${validResults.length}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── All final emails ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('ALL 10 FINAL EMAILS');
  console.log('═══════════════════════════════════════════════════════════');

  results.forEach((r, i) => {
    const icon = r.score >= 85 ? '✅' : r.score >= 70 ? '⚠️' : '⛔';
    console.log(`\n${icon} [${i + 1}] ${r.channel} — ${r.score}/100`);
    console.log('─────────────────────────────────────────────────────────');
    console.log(r.email || '[no email generated]');
    console.log('─────────────────────────────────────────────────────────');
  });
}

testTenEmails()
  .catch(err => { console.error('\n[FATAL]', err.message); process.exit(1); })
  .finally(() => process.exit(0));
