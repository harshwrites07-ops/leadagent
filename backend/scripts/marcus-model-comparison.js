// Load env from project root (.env lives one level above /backend)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env'), override: true });

const { initializeDatabase, getDb } = require('../src/models/database');
const { runQualityGate, generateInitialDraft, buildCreatorData } = require('../src/qualityGate');

const MODEL_A = 'claude-sonnet-4-6';
const MODEL_B = 'claude-opus-4-8';

// Pricing per million tokens (USD)
const PRICING = {
  [MODEL_A]: { input: 3.00,  output: 15.00 },
  [MODEL_B]: { input: 15.00, output: 75.00 },
};

function calcCost(model, inputTokens, outputTokens) {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

function printEmailBox(email) {
  console.log('  ┌' + '─'.repeat(62) + '┐');
  (email || '(empty)').split('\n').forEach(line => {
    const truncated = line.length > 60 ? line.slice(0, 57) + '...' : line;
    console.log(`  │ ${truncated.padEnd(60)} │`);
  });
  console.log('  └' + '─'.repeat(62) + '┘');
}

async function generateWithModel(creatorData, voiceDNA, model) {
  const usage = { inputTokens: 0, outputTokens: 0 };

  console.log(`\n  [${model}] Generating initial draft...`);
  const initialDraft = await generateInitialDraft(creatorData, voiceDNA, model, usage);

  console.log(`  [${model}] Running quality gate (up to 3 attempts)...`);
  const gateResult = await runQualityGate(
    initialDraft,
    creatorData,
    voiceDNA,
    async (attemptNum, _email, evalResult) => {
      const icon = evalResult.score >= 85 ? '✅' : evalResult.score >= 70 ? '⚠️ ' : '⛔';
      console.log(`    Attempt ${attemptNum}: ${evalResult.score}/100 ${icon}`);
    },
    model,
    usage,
  );

  return { gateResult, usage };
}

async function main() {
  await initializeDatabase();
  const db = getDb();

  // ── Pick one random creator ──────────────────────────────────────────────────
  const lead = await db.get(`
    SELECT * FROM leads
    WHERE subscriber_count IS NOT NULL
      AND subscriber_count > 0
      AND channel_name IS NOT NULL
      AND channel_name != ''
    ORDER BY RANDOM()
    LIMIT 1
  `);

  if (!lead) {
    console.error('\n[ERROR] No leads found in the database. Import some leads first.\n');
    process.exit(1);
  }

  // ── Load voiceDNA from first user who has one, fall back to test DNA ─────────
  let voiceDNA = {};
  const userRow = await db.get(
    `SELECT voice_dna, full_name FROM users WHERE voice_dna IS NOT NULL AND voice_dna != '{}' LIMIT 1`
  );
  if (userRow?.voice_dna) {
    try { voiceDNA = JSON.parse(userRow.voice_dna); } catch {}
    if (!voiceDNA.name && userRow.full_name) voiceDNA.name = userRow.full_name.split(' ')[0];
  }
  if (!voiceDNA.name) {
    voiceDNA = {
      name: 'Prathvi',
      service: 'professional video editing',
      caseStudy: 'Helped a gaming channel grow from 50K to 200K subs in 3 months by restructuring hooks — watch time hit 68% average',
      communicationStyle: 'casual, direct, peer-to-peer',
      uniqueDifference: 'we edit videos that make viewers subscribe, not just watch',
      nicheExperience: 'gaming, education, finance, lifestyle',
    };
  }

  const creatorData = buildCreatorData(lead);

  // ── Header ───────────────────────────────────────────────────────────────────
  console.log('\n╔' + '═'.repeat(70) + '╗');
  console.log('║' + '  MARCUS MODEL COMPARISON — Sonnet 4.6 vs Opus 4.8'.padEnd(70) + '║');
  console.log('╚' + '═'.repeat(70) + '╝');

  console.log('\n📺 CREATOR:');
  console.log(`   Channel:        ${creatorData.channelTitle}`);
  console.log(`   Subscribers:    ${Number(creatorData.subscriberCount || 0).toLocaleString()}`);
  console.log(`   Niche:          ${creatorData.niche || 'Unknown'}`);
  console.log(`   Avg Views:      ${Number(creatorData.avgViews || 0).toLocaleString()}`);
  console.log(`   View/Sub Ratio: ${creatorData.viewSubRatio}`);
  console.log(`   Recent Video:   ${creatorData.recentVideoTitle || 'Unknown'}`);
  console.log(`   Upload Freq:    ${creatorData.uploadFrequency}`);
  console.log(`   Intent Signal:  ${creatorData.intentSignal}`);

  console.log('\n👤 VOICE DNA:');
  console.log(`   Name:      ${voiceDNA.name}`);
  console.log(`   Service:   ${voiceDNA.service || 'Unknown'}`);
  console.log(`   Case Study: ${(voiceDNA.caseStudy || voiceDNA.case_study || 'None').slice(0, 80)}`);

  console.log('\n' + '─'.repeat(72));
  console.log('🚀 GENERATING EMAILS IN PARALLEL...\n');

  // ── Generate with both models in parallel ────────────────────────────────────
  const [resultA, resultB] = await Promise.all([
    generateWithModel(creatorData, voiceDNA, MODEL_A),
    generateWithModel(creatorData, voiceDNA, MODEL_B),
  ]);

  const { gateResult: gateA, usage: usageA } = resultA;
  const { gateResult: gateB, usage: usageB } = resultB;

  const scoreA  = gateA?.quality?.score ?? 0;
  const scoreB  = gateB?.quality?.score ?? 0;
  const bdA     = gateA?.quality?.breakdown || {};
  const bdB     = gateB?.quality?.breakdown || {};
  const costA   = calcCost(MODEL_A, usageA.inputTokens, usageA.outputTokens);
  const costB   = calcCost(MODEL_B, usageB.inputTokens, usageB.outputTokens);

  const dims = [
    ['Personalization', 'personalization', 20],
    ['Hook / Opener',   'hook',            15],
    ['Specificity',     'specificity',     15],
    ['Value Prop',      'value_prop',      15],
    ['CTA',             'cta',             15],
    ['Tone / Voice',    'tone',            12],
    ['Spam Flag',       'spam_flag',        8],
  ];

  // ── Email A ──────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log(`  EMAIL A  —  ${MODEL_A}`);
  console.log('═'.repeat(72));
  printEmailBox(gateA?.email);

  // ── Email B ──────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log(`  EMAIL B  —  ${MODEL_B}`);
  console.log('═'.repeat(72));
  printEmailBox(gateB?.email);

  // ── Quality breakdown table ───────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  QUALITY SCORE BREAKDOWN');
  console.log('═'.repeat(72));

  const col0 = 18, col1 = 24, col2 = 24;
  const hdr = `  ${'Dimension'.padEnd(col0)}  ${'SONNET A'.padEnd(col1)}  ${'OPUS B'.padEnd(col2)}`;
  console.log(hdr);
  console.log('  ' + '─'.repeat(col0 + col1 + col2 + 4));

  let winsA = 0, winsB = 0, ties = 0;
  dims.forEach(([name, key, max]) => {
    const pA = bdA[key]?.points ?? 0;
    const pB = bdB[key]?.points ?? 0;
    const winA = pA > pB ? ' ◄' : '  ';
    const winB = pB > pA ? ' ◄' : '  ';
    if (pA > pB) winsA++;
    else if (pB > pA) winsB++;
    else ties++;
    const cellA = `${String(pA).padStart(2)}/${max}${winA}`;
    const cellB = `${String(pB).padStart(2)}/${max}${winB}`;
    console.log(`  ${name.padEnd(col0)}  ${cellA.padEnd(col1)}  ${cellB.padEnd(col2)}`);
  });

  console.log('  ' + '─'.repeat(col0 + col1 + col2 + 4));
  const totA = `${scoreA}/100${scoreA > scoreB ? ' ◄' : '  '}`;
  const totB = `${scoreB}/100${scoreB > scoreA ? ' ◄' : '  '}`;
  console.log(`  ${'TOTAL SCORE'.padEnd(col0)}  ${totA.padEnd(col1)}  ${totB.padEnd(col2)}`);

  const passA = scoreA >= 85 ? '✅ PASS' : scoreA >= 70 ? '⚠️  WARN' : '⛔ BLOCKED';
  const passB = scoreB >= 85 ? '✅ PASS' : scoreB >= 70 ? '⚠️  WARN' : '⛔ BLOCKED';
  console.log(`  ${'Status'.padEnd(col0)}  ${passA.padEnd(col1)}  ${passB.padEnd(col2)}`);

  // ── Overall feedback ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  OVERALL FEEDBACK');
  console.log('═'.repeat(72));
  console.log(`\n  [Sonnet A]`);
  console.log(`  ${gateA?.quality?.overall_feedback || 'No feedback'}`);
  console.log(`\n  [Opus B]`);
  console.log(`  ${gateB?.quality?.overall_feedback || 'No feedback'}`);

  // ── Generation stats ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  GENERATION STATS');
  console.log('═'.repeat(72));
  console.log(`  ${''.padEnd(col0)}  ${'SONNET A'.padEnd(col1)}  ${'OPUS B'.padEnd(col2)}`);
  console.log('  ' + '─'.repeat(col0 + col1 + col2 + 4));
  console.log(`  ${'Attempts used'.padEnd(col0)}  ${String(gateA?.attempts ?? '?').padEnd(col1)}  ${gateB?.attempts ?? '?'}`);
  console.log(`  ${'Regenerated'.padEnd(col0)}  ${String(gateA?.regenerated ? 'Yes' : 'No').padEnd(col1)}  ${gateB?.regenerated ? 'Yes' : 'No'}`);

  // ── Token usage + cost ────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  TOKEN USAGE & COST');
  console.log('═'.repeat(72));
  console.log(`  ${''.padEnd(col0)}  ${'SONNET A'.padEnd(col1)}  ${'OPUS B'.padEnd(col2)}`);
  console.log('  ' + '─'.repeat(col0 + col1 + col2 + 4));
  console.log(`  ${'Input tokens'.padEnd(col0)}  ${String(usageA.inputTokens.toLocaleString()).padEnd(col1)}  ${usageB.inputTokens.toLocaleString()}`);
  console.log(`  ${'Output tokens'.padEnd(col0)}  ${String(usageA.outputTokens.toLocaleString()).padEnd(col1)}  ${usageB.outputTokens.toLocaleString()}`);
  console.log(`  ${'Total tokens'.padEnd(col0)}  ${String((usageA.inputTokens + usageA.outputTokens).toLocaleString()).padEnd(col1)}  ${(usageB.inputTokens + usageB.outputTokens).toLocaleString()}`);
  console.log(`  ${'Cost (USD)'.padEnd(col0)}  ${'$' + costA.toFixed(6).padEnd(col1 - 1)}  ${'$' + costB.toFixed(6)}`);
  console.log(`  ${'Pricing'.padEnd(col0)}  ${'$3/$15 per MTok in/out'.padEnd(col1)}  $15/$75 per MTok in/out`);

  // ── Winner summary ────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  WINNER SUMMARY');
  console.log('═'.repeat(72));

  dims.forEach(([name, key]) => {
    const pA = bdA[key]?.points ?? 0;
    const pB = bdB[key]?.points ?? 0;
    if (pA > pB)      console.log(`  🔵 Sonnet wins on ${name.padEnd(18)} (${pA} vs ${pB})`);
    else if (pB > pA) console.log(`  🟣 Opus wins on   ${name.padEnd(18)} (${pB} vs ${pA})`);
    else              console.log(`  🟰 Tie on         ${name.padEnd(18)} (${pA} pts each)`);
  });

  console.log(`\n  Sonnet won ${winsA}/7 dimensions | Opus won ${winsB}/7 | Ties: ${ties}`);

  const winner =
    scoreA > scoreB ? `🏆 OVERALL WINNER: claude-sonnet-4-6  (${scoreA} vs ${scoreB})`
    : scoreB > scoreA ? `🏆 OVERALL WINNER: claude-opus-4-8  (${scoreB} vs ${scoreA})`
    : `🏆 OVERALL: TIE  (${scoreA} vs ${scoreB})`;

  console.log('\n  ' + winner);
  console.log('\n' + '═'.repeat(72) + '\n');
}

main()
  .catch(err => { console.error('\n[FATAL]', err.message, '\n', err.stack); process.exit(1); })
  .finally(() => process.exit(0));
