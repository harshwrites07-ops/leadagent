#!/usr/bin/env node
// Generates public/sitemap.xml at build time from the list of public marketing
// routes below. Authenticated app routes (/dashboard, /leads, /crm, etc.) are
// intentionally excluded — they require login and shouldn't be indexed.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SITE_URL = 'https://quelro.com';

const PUBLIC_ROUTES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
];

const today = new Date().toISOString().slice(0, 10);

const urls = PUBLIC_ROUTES.map(({ path: p, changefreq, priority }) => `  <url>
    <loc>${SITE_URL}${p}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const outPath = path.join(__dirname, '../public/sitemap.xml');
fs.writeFileSync(outPath, xml);
console.log(`[sitemap] wrote ${PUBLIC_ROUTES.length} URLs to ${outPath}`);
