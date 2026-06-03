const { getDb } = require('../models/database');

function buildVoiceDNA(user) {
  const traits   = (() => { try { return JSON.parse(user.personality_traits || '[]'); } catch { return []; } })();
  const niches   = (() => { try { return JSON.parse(user.target_niches || '[]'); } catch { return []; } })();
  const name     = (user.full_name || 'the sender').split(' ')[0];

  // Communication style from personality traits
  let communicationStyle = 'natural and genuine';
  if (traits.includes('Direct and no-nonsense'))       communicationStyle = 'direct, concise, no fluff — gets to the point immediately';
  else if (traits.includes('Warm and friendly'))        communicationStyle = 'warm, conversational, approachable — like talking to a friend';
  else if (traits.includes('Analytical and data-driven')) communicationStyle = 'data-focused, logical, precise — leads with numbers and evidence';
  else if (traits.includes('Funny and casual'))         communicationStyle = 'casual, light, occasionally uses dry humour';
  else if (traits.includes('Professional and polished')) communicationStyle = 'professional, refined, confident — zero fluff';
  else if (traits.includes('Bold and confident'))       communicationStyle = 'bold, assertive, commanding — speaks like an expert';
  else if (traits.includes('Creative and energetic'))   communicationStyle = 'energetic, vivid, enthusiastic without being over the top';

  // Multi-trait modifier
  const writingMods = [];
  if (traits.includes('Direct and no-nonsense'))      writingMods.push('No padding. Every sentence earns its place.');
  if (traits.includes('Analytical and data-driven'))  writingMods.push('Reference specific numbers and data when available.');
  if (traits.includes('Funny and casual'))            writingMods.push('Light humour is welcome if it flows naturally.');
  if (traits.includes('Warm and friendly'))           writingMods.push('Show genuine interest in the creator as a person.');
  if (traits.includes('Bold and confident'))          writingMods.push('Speak with authority. No hedging, no "just reaching out".');

  // Email tone from pricing
  let emailTone = 'conversational and genuine';
  const price = user.pricing_range || '';
  if (price.includes('7,000') || price.includes('7000')) emailTone = 'premium and authoritative — this person delivers serious results';
  else if (price.includes('3,500') || price.includes('3500')) emailTone = 'professional and capable — proven track record';
  else if (price.includes('1,500') || price.includes('1500')) emailTone = 'confident and value-focused';
  else if (price.includes('500'))                             emailTone = 'approachable and eager to prove value';

  // Social proof — use best_result or construct from service
  const serviceLC = (user.service_type || 'their growth').toLowerCase();
  const socialProof = user.best_result
    ? user.best_result.trim()
    : `helping YouTube creators with ${serviceLC}`;

  // Identity
  const identity = user.one_liner
    ? user.one_liner.trim()
    : `${user.full_name || name} who offers ${(user.service_type || 'services').toLowerCase()} to YouTube creators`;

  // CTA style from outreach goal
  let ctaStyle = 'a low-commitment conversational question';
  if (user.outreach_goal === 'book_call')     ctaStyle = 'a question that naturally leads toward a discovery call';
  else if (user.outreach_goal === 'close_deal') ctaStyle = 'a direct question that moves toward a decision';

  const dna = {
    name,
    fullName: user.full_name,
    service: (user.service_type || 'services').toLowerCase(),
    identity,
    communicationStyle,
    emailTone,
    socialProof,
    traits,
    targetNiches: niches,
    outreachGoal: user.outreach_goal || 'get_reply',
    ctaStyle,
    originStory: user.origin_story || null,
    uniqueDifference: user.unique_difference || null,
    experienceLevel: user.experience_years || null,
    pricingTier: user.pricing_range || null,
    writingInstructions: [
      `Write exactly like ${user.full_name || name} — their real voice, not a template.`,
      `Communication style: ${communicationStyle}`,
      `Email tone: ${emailTone}`,
      ...writingMods,
      user.outreach_goal === 'book_call'   ? 'End goal is a discovery call — but NEVER ask for it directly in email 1. Plant the seed.' : '',
      user.outreach_goal === 'get_reply'   ? 'Optimise entirely for a reply. ONE question. Nothing else.' : '',
      user.outreach_goal === 'close_deal'  ? 'Be direct about value but don\'t mention pricing.' : '',
    ].filter(Boolean).join('\n      '),
    builtAt: new Date().toISOString(),
  };

  return dna;
}

async function getOrBuildVoiceDNA(userId) {
  if (!userId) return null;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  // If DNA exists and profile has enough data, return cached
  try {
    const cached = JSON.parse(user.voice_dna || '{}');
    if (cached.builtAt && user.service_type) return cached;
  } catch {}

  // Build fresh
  const dna = buildVoiceDNA(user);
  try {
    db.prepare('UPDATE users SET voice_dna = ? WHERE id = ?').run(JSON.stringify(dna), userId);
  } catch {}

  return dna;
}

async function rebuildVoiceDNA(userId) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const dna = buildVoiceDNA(user);
  db.prepare('UPDATE users SET voice_dna = ? WHERE id = ?').run(JSON.stringify(dna), userId);
  return dna;
}

module.exports = { buildVoiceDNA, getOrBuildVoiceDNA, rebuildVoiceDNA };
