// Master keyword database — 500+ keywords across 16 niches
// Used by PowerMode to rotate fresh keywords every run

const MASTER_KEYWORDS = {
  finance: [
    'personal finance', 'investing tips', 'stock market', 'financial freedom', 'passive income',
    'make money online', 'wealth building', 'financial advisor', 'money management', 'side hustle',
    'financial independence', 'budget tips', 'real estate investing', 'crypto investing', 'day trading',
    'financial literacy', 'money mindset', 'saving money', 'wealth creation', 'finance tips',
    'financial goals', 'financial coach', 'money coach', 'wealth coach', 'frugal living',
    'early retirement', 'millionaire mindset', 'stock investing', 'forex trading', 'options trading',
    'dividend investing', 'index funds', 'debt free journey', 'multiple income streams', 'financial planning',
    'investment portfolio', 'grow wealth', 'rich mindset', 'money habits', 'financial success',
    'build wealth', 'credit score tips', 'budgeting tips', 'tax tips', 'financial education',
  ],
  business: [
    'entrepreneur tips', 'startup advice', 'business tips', 'CEO vlog', 'online business',
    'business growth', 'marketing tips', 'sales tips', 'business strategy', 'leadership tips',
    'productivity tips', 'business coaching', 'small business owner', 'ecommerce tips', 'dropshipping',
    'amazon fba', 'business ideas', 'agency owner', 'freelancing tips', 'consulting business',
    'B2B sales', 'scaling business', 'business mindset', 'solopreneur', 'digital entrepreneur',
    'personal brand', 'brand building', 'content creator business', 'creator economy', 'business automation',
    'passive income business', 'online marketing', 'social media strategy', 'youtube business',
    'business podcast', 'startup founder', 'venture capital', 'bootstrapped business', 'SaaS founder',
    'business vlog', 'entrepreneur channel', 'agency tips', 'business coach YouTube', 'startup vlog',
    'business systems', 'business operations', 'remote work tips', 'work from home business',
  ],
  fitness: [
    'workout routine', 'weight loss tips', 'gym motivation', 'nutrition tips', 'fitness coach',
    'body transformation', 'home workout', 'muscle building', 'cardio workout', 'healthy lifestyle',
    'diet tips', 'fitness tips', 'personal trainer', 'yoga for beginners', 'running tips',
    'strength training', 'HIIT workout', 'fitness journey', 'weight loss journey', 'healthy eating',
    'meal prep', 'fat loss tips', 'build muscle fast', 'fitness challenge', 'calisthenics workout',
    'powerlifting tips', 'bodybuilding', 'intermittent fasting', 'keto diet tips', 'vegan fitness',
    'women workout', 'men fitness', 'sports training', 'athletic performance', 'flexibility workout',
    'abs workout', 'chest workout', 'leg day workout', 'CrossFit', 'functional fitness',
    'online fitness coach', 'gym owner channel', 'fitness business', 'online coaching',
    'nutrition coach YouTube', 'running coach', 'marathon training', 'triathlon training',
  ],
  education: [
    'online learning', 'study tips', 'how to learn faster', 'education tips', 'teaching online',
    'tutorial channel', 'online course creator', 'skill development', 'learning hacks', 'career advice',
    'self improvement', 'personal development', 'life skills tips', 'coding tutorial', 'design tutorial',
    'writing tips channel', 'public speaking tips', 'communication skills', 'memory techniques',
    'speed reading tips', 'note taking system', 'language learning', 'online tutor', 'educational content',
    'academic tips', 'college advice', 'university tips', 'course creator YouTube', 'digital course',
    'eLearning YouTube', 'skills trainer', 'exam prep', 'tutoring channel', 'teach online',
    'homeschool channel', 'teacher YouTube', 'professor YouTube', 'knowledge channel', 'how to channel',
    'learn guitar', 'learn piano', 'art tutorial', 'photography tutorial', 'cooking tutorial',
  ],
  tech: [
    'tech review channel', 'software tutorial', 'coding tips', 'AI tools review', 'productivity apps',
    'tech news', 'web development tutorial', 'app development', 'programming tips', 'no code tools',
    'automation tools', 'SaaS review', 'tech entrepreneur', 'developer tips', 'AI tutorial',
    'machine learning basics', 'data science', 'cybersecurity tips', 'gadget review', 'smartphone tips',
    'tech for beginners', 'cloud computing', 'blockchain tips', 'web3 tutorial', 'python tutorial',
    'javascript tutorial', 'react tutorial', 'startup tech', 'product management', 'UX design tips',
    'tech vlog', 'software engineer', 'engineering channel', 'computer science', 'tech career tips',
    'AI YouTube channel', 'ChatGPT tips', 'automation YouTube', 'no-code YouTube', 'tech tools',
    'software review', 'tech comparison', 'tech unboxing', 'developer YouTube', 'coding channel',
  ],
  realestate: [
    'real estate tips', 'property investment', 'house flipping', 'rental property tips',
    'real estate agent tips', 'buying a house tips', 'real estate investing', 'commercial real estate',
    'property management tips', 'real estate market analysis', 'mortgage tips', 'first time home buyer',
    'real estate coach', 'airbnb hosting tips', 'real estate business', 'property development',
    'real estate wholesaling', 'passive income real estate', 'real estate syndication', 'multifamily investing',
    'real estate crowdfunding', 'real estate YouTube', 'realtor channel', 'property investor',
    'house flipping channel', 'real estate education', 'real estate vlog', 'landlord tips',
    'tenant tips', 'home buying tips', 'home selling tips', 'real estate market', 'investing in property',
  ],
  health: [
    'health tips', 'mental health tips', 'wellness tips', 'mindfulness practice', 'meditation tips',
    'stress management', 'sleep tips', 'healthy habits', 'natural health remedies', 'holistic health',
    'anxiety management', 'depression tips', 'health coach', 'nutrition coach', 'wellness coach',
    'gut health tips', 'immune system boost', 'longevity tips', 'biohacking tips', 'functional medicine',
    'alternative health', 'mental wellness', 'therapy tips', 'psychology tips', 'brain health',
    'hormone health', 'womens health', 'mens health', 'doctor YouTube', 'physician channel',
    'naturopath YouTube', 'chiropractor channel', 'dietitian YouTube', 'nurse YouTube', 'pharmacist YouTube',
    'health educator', 'wellness educator', 'health vlog', 'chronic illness channel', 'recovery tips',
  ],
  cooking: [
    'cooking tips', 'easy recipes', 'meal prep ideas', 'healthy cooking', 'quick dinner recipes',
    'cooking for beginners', 'food vlog', 'chef tips', 'baking from scratch', 'vegetarian recipes',
    'vegan cooking', 'keto recipes', 'food review', 'home cooking tips', 'restaurant style cooking',
    'street food', 'food travel', 'budget cooking', 'meal planning', 'cooking channel',
    'food blogger', 'dessert recipes', 'breakfast ideas', 'lunch recipes', 'BBQ tips',
    'grilling tips', 'baking channel', 'pastry chef', 'cocktail recipes', 'coffee channel',
    'food science', 'cooking science', 'food chemistry', 'ethnic food', 'international cooking',
    'meal kit review', 'grocery haul', 'what I eat in a day', 'food challenge', 'eating show',
  ],
  motivation: [
    'daily motivation', 'inspirational channel', 'success mindset', 'life advice', 'self help tips',
    'personal growth', 'mindset tips', 'success tips', 'motivational speaker', 'life coach',
    'mental toughness', 'confidence tips', 'positive thinking', 'law of attraction', 'manifestation tips',
    'goal setting', 'discipline tips', 'morning routine', 'success habits', 'millionaire habits',
    'think and grow rich', 'mindset coach', 'life transformation', 'success journey', 'breakthrough channel',
    'vision board', 'growth mindset', 'empowerment channel', 'mindset training', 'success formula',
    'overcoming failure', 'resilience tips', 'hard work motivation', 'grind channel', 'hustle culture',
  ],
  marketing: [
    'digital marketing tips', 'social media marketing', 'content marketing', 'SEO tips',
    'email marketing tips', 'facebook ads tutorial', 'google ads tips', 'influencer marketing',
    'marketing strategy', 'growth hacking', 'copywriting tips', 'video marketing', 'youtube marketing',
    'tiktok marketing tips', 'instagram marketing', 'linkedin marketing', 'affiliate marketing',
    'dropshipping marketing', 'ecommerce marketing', 'brand strategy', 'marketing agency',
    'digital marketing agency', 'content strategy', 'social media tips', 'paid ads tutorial',
    'conversion optimization', 'funnel building', 'lead generation tips', 'marketing automation',
    'marketing analytics', 'brand awareness', 'viral marketing', 'community building', 'podcast marketing',
  ],
  lifestyle: [
    'lifestyle vlog', 'minimalist lifestyle', 'luxury lifestyle', 'digital nomad', 'work from home tips',
    'van life', 'travel vlog', 'solo travel', 'budget travel', 'productivity lifestyle',
    'morning routine vlog', 'night routine', 'apartment tour', 'room makeover', 'fashion tips',
    'style tips', 'beauty tips', 'skincare routine', 'makeup tutorial', 'fashion vlog',
    'GRWM vlog', 'day in my life', 'weekly vlog', 'family vlog', 'couple vlog',
    'college lifestyle', 'student vlog', 'city living', 'rural living', 'homesteading channel',
    'zero waste lifestyle', 'sustainable living', 'eco friendly tips', 'tiny house living',
  ],
  podcast: [
    'podcast tips', 'podcasting for beginners', 'how to start podcast', 'podcast growth',
    'interview podcast', 'business podcast', 'true crime podcast', 'comedy podcast',
    'educational podcast', 'self improvement podcast', 'entrepreneurship podcast', 'marketing podcast',
    'podcast on YouTube', 'video podcast channel', 'podcast equipment review', 'podcast monetization',
    'podcast editing tips', 'podcast audience building', 'niche podcast', 'podcast strategy',
  ],
  saas: [
    'SaaS tips', 'software startup', 'product led growth', 'SaaS marketing', 'B2B SaaS',
    'SaaS metrics', 'churn reduction', 'customer success SaaS', 'SaaS pricing', 'SaaS sales',
    'startup SaaS', 'micro SaaS', 'SaaS founder', 'build in public', 'indie hacker',
    'software product', 'API business', 'developer tools', 'SaaS growth', 'product management SaaS',
  ],
  gaming: [
    'gaming tips', 'gaming channel', 'game review', 'esports channel', 'gaming vlog',
    'game walkthrough', 'gaming setup', 'streamer tips', 'Twitch tips', 'gaming career',
    'gaming business', 'content creator gaming', 'game developer', 'indie game developer',
    'gaming news', 'retro gaming', 'mobile gaming', 'PC gaming tips', 'console gaming',
  ],
  design: [
    'graphic design tips', 'UI UX design', 'web design tips', 'logo design', 'brand design',
    'Figma tutorial', 'design process', 'freelance design', 'design business', 'creative career',
    'illustration tips', 'motion graphics', 'video editing tips', 'After Effects tutorial',
    'design portfolio', 'design resources', 'design inspiration', 'design critique', 'design vlog',
  ],
  travel: [
    'travel tips', 'solo travel', 'travel vlog', 'budget travel', 'luxury travel',
    'travel photography', 'travel hacks', 'digital nomad travel', 'travel business', 'travel channel',
    'backpacking tips', 'travel gear review', 'van life', 'travel planning', 'travel deals',
    'international travel', 'travel abroad', 'expat channel', 'moving abroad', 'travel lifestyle',
  ],
};

const NICHE_ALIASES = {
  'finance': 'finance', 'business': 'business', 'fitness': 'fitness',
  'education': 'education', 'edu': 'education', 'tech': 'tech', 'saas': 'saas',
  'realestate': 'realestate', 'real estate': 'realestate',
  'health': 'health', 'cooking': 'cooking', 'motivation': 'motivation',
  'marketing': 'marketing', 'lifestyle': 'lifestyle', 'podcast': 'podcast',
  'gaming': 'gaming', 'design': 'design', 'travel': 'travel',
  // Old scraper niche names
  'Business': 'business', 'Finance': 'finance', 'Real Estate': 'realestate',
  'Fitness': 'fitness', 'SaaS & Tech': 'saas', 'Law': 'health', 'Health': 'health',
  'Education': 'education', 'Podcasters': 'podcast',
};

function resolveNiche(name) {
  return NICHE_ALIASES[name] || name.toLowerCase();
}

function getKeywordsByNiche(niche) {
  const resolved = resolveNiche(niche);
  return MASTER_KEYWORDS[resolved] || [];
}

function getAllKeywords() {
  return Object.entries(MASTER_KEYWORDS).flatMap(([niche, keywords]) =>
    keywords.map(k => ({ keyword: k, niche }))
  );
}

function getRandomKeywords(niche, count = 10) {
  const resolved = resolveNiche(niche);
  const keywords = MASTER_KEYWORDS[resolved] || [];
  if (!keywords.length) return [];
  const shuffled = [...keywords].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getKeywordsForNiches(niches, perNiche = 10) {
  const all = [];
  const seen = new Set();
  for (const niche of niches) {
    const kws = getRandomKeywords(niche, perNiche);
    for (const kw of kws) {
      if (!seen.has(kw)) { seen.add(kw); all.push({ keyword: kw, niche: resolveNiche(niche) }); }
    }
  }
  return all;
}

function totalKeywordCount() {
  return Object.values(MASTER_KEYWORDS).reduce((sum, arr) => sum + arr.length, 0);
}

module.exports = { MASTER_KEYWORDS, getKeywordsByNiche, getAllKeywords, getRandomKeywords, getKeywordsForNiches, resolveNiche, totalKeywordCount };
