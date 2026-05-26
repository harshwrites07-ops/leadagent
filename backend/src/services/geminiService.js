const { GoogleGenerativeAI } = require('@google/generative-ai');

const geminiKeys = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean);

console.log(`[Gemini] Loaded ${geminiKeys.length} API keys`);

const exhaustedKeys = new Map();

function getNextKey() {
  const now = Date.now();
  for (const key of geminiKeys) {
    const exhaustedAt = exhaustedKeys.get(key);
    if (!exhaustedAt || now - exhaustedAt > 60000) {
      exhaustedKeys.delete(key);
      return key;
    }
  }
  return null;
}

function markExhausted(key) {
  exhaustedKeys.set(key, Date.now());
  console.warn(`[Gemini] Key exhausted, rotating. ${geminiKeys.length - exhaustedKeys.size} keys remaining`);
}

async function generateWithGemini(prompt, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const key = getNextKey();

    if (!key) {
      console.warn('[Gemini] All keys exhausted, waiting 60s...');
      await new Promise(r => setTimeout(r, 60000));
      continue;
    }

    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (!text || text.length < 10) {
        throw new Error('Empty or too short response');
      }

      return text;

    } catch (error) {
      console.error(`[Gemini] Attempt ${attempt} failed:`, error.message);

      if (error.message?.includes('quota') ||
          error.message?.includes('429') ||
          error.message?.includes('rate') ||
          error.status === 429) {
        markExhausted(key);
        continue;
      }

      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  console.warn('[Gemini] All attempts failed, using template');
  return null;
}

module.exports = { generateWithGemini };
