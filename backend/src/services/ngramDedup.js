// Phase 4 — N-Gram Dedup Gate
// Prevents near-duplicate emails being sent to different leads in the same bulk session.
// Uses Jaccard similarity on word trigrams; threshold 0.55 catches template repetition.

function extractTrigrams(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
  const trigrams = new Set();
  for (let i = 0; i < words.length - 2; i++) {
    trigrams.add(`${words[i]}|${words[i + 1]}|${words[i + 2]}`);
  }
  return trigrams;
}

function jaccardSimilarity(setA, setB) {
  if (!setA.size && !setB.size) return 1;
  let intersection = 0;
  for (const g of setA) { if (setB.has(g)) intersection++; }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Per-user in-memory store of recently generated emails' trigram fingerprints.
// Cleared when a bulk session ends or after SESSION_TTL.
const sessionStore = new Map();
const SESSION_TTL = 2 * 60 * 60 * 1000; // 2 hours

function prune() {
  const now = Date.now();
  for (const [k, v] of sessionStore.entries()) {
    if (now - v.createdAt > SESSION_TTL) sessionStore.delete(k);
  }
}

function checkAndRegister(userId, emailBody, threshold = 0.55) {
  prune();
  const key = String(userId);
  if (!sessionStore.has(key)) sessionStore.set(key, { emails: [], createdAt: Date.now() });

  const store = sessionStore.get(key);
  const trigrams = extractTrigrams(emailBody);

  for (const prev of store.emails) {
    const sim = jaccardSimilarity(trigrams, prev);
    if (sim >= threshold) {
      return { isDuplicate: true, similarity: parseFloat(sim.toFixed(2)) };
    }
  }

  store.emails.push(trigrams);
  if (store.emails.length > 200) store.emails.shift();
  return { isDuplicate: false, similarity: 0 };
}

function clearSession(userId) {
  sessionStore.delete(String(userId));
}

module.exports = { checkAndRegister, clearSession };
