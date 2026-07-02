const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const { URL } = require('url');
const { ZipArchive } = require('archiver');

const BASE_URL = 'https://qount.io';
const OUTPUT_DIR = path.join(__dirname, 'qount_site');

const visited = new Set();
const queue = [BASE_URL];
const downloadedAssets = new Set();

const stats = {
  pages: 0,
  css: 0,
  js: 0,
  images: 0,
  other: 0,
};

const axiosInstance = axios.create({
  timeout: 20000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  },
  maxRedirects: 5,
});

function isInternal(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'qount.io' || u.hostname === 'www.qount.io';
  } catch {
    return false;
  }
}

function toAbsolute(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function urlToLocalPath(url) {
  try {
    const u = new URL(url);
    let p = u.pathname;
    if (p === '/' || p === '') return path.join(OUTPUT_DIR, 'index.html');
    if (p.endsWith('/')) p += 'index.html';
    else if (!path.extname(p)) p += '/index.html';
    return path.join(OUTPUT_DIR, p.replace(/^\//, ''));
  } catch {
    return null;
  }
}

function assetLocalPath(url) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).toLowerCase();
    const name = path.basename(u.pathname) || 'file';

    if (['.css'].includes(ext)) return path.join(OUTPUT_DIR, 'css', name);
    if (['.js', '.mjs'].includes(ext)) return path.join(OUTPUT_DIR, 'js', name);
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.avif'].includes(ext))
      return path.join(OUTPUT_DIR, 'images', name);
    return path.join(OUTPUT_DIR, 'assets', name);
  } catch {
    return null;
  }
}

function assetRelativePath(url, pageUrl) {
  const local = assetLocalPath(url);
  if (!local) return url;
  return path.relative(path.dirname(urlToLocalPath(pageUrl) || OUTPUT_DIR), local).replace(/\\/g, '/');
}

async function downloadAsset(url) {
  if (downloadedAssets.has(url)) return;
  downloadedAssets.add(url);
  const localPath = assetLocalPath(url);
  if (!localPath) return;

  try {
    const res = await axiosInstance.get(url, { responseType: 'arraybuffer' });
    await fs.ensureDir(path.dirname(localPath));
    await fs.writeFile(localPath, res.data);
    const ext = path.extname(localPath).toLowerCase();
    if (ext === '.css') stats.css++;
    else if (ext === '.js' || ext === '.mjs') stats.js++;
    else if (['.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.avif'].includes(ext)) stats.images++;
    else stats.other++;
    console.log(`  [asset] ${path.basename(localPath)}`);
  } catch (e) {
    console.warn(`  [skip asset] ${url} — ${e.message}`);
  }
}

async function scrapePage(pageUrl) {
  if (visited.has(pageUrl)) return;
  visited.add(pageUrl);

  let html;
  try {
    const res = await axiosInstance.get(pageUrl);
    html = res.data;
  } catch (e) {
    console.warn(`[skip page] ${pageUrl} — ${e.message}`);
    return;
  }

  const $ = cheerio.load(html);
  const assetPromises = [];

  // Download CSS
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const abs = toAbsolute(href, pageUrl);
    if (!abs) return;
    assetPromises.push(downloadAsset(abs));
    $(el).attr('href', assetRelativePath(abs, pageUrl));
  });

  // Download JS
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;
    const abs = toAbsolute(src, pageUrl);
    if (!abs) return;
    assetPromises.push(downloadAsset(abs));
    $(el).attr('src', assetRelativePath(abs, pageUrl));
  });

  // Download images
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      const abs = toAbsolute(src, pageUrl);
      if (abs) {
        assetPromises.push(downloadAsset(abs));
        $(el).attr('src', assetRelativePath(abs, pageUrl));
      }
    }
    const srcset = $(el).attr('srcset');
    if (srcset) {
      const newSrcset = srcset.split(',').map(part => {
        const [u, ...rest] = part.trim().split(/\s+/);
        const abs = toAbsolute(u, pageUrl);
        if (!abs) return part;
        assetPromises.push(downloadAsset(abs));
        return [assetRelativePath(abs, pageUrl), ...rest].join(' ');
      }).join(', ');
      $(el).attr('srcset', newSrcset);
    }
  });

  // Collect internal page links and rewrite
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    const abs = toAbsolute(href, pageUrl);
    if (!abs) return;
    if (isInternal(abs)) {
      const cleanUrl = abs.split('#')[0].split('?')[0];
      if (!visited.has(cleanUrl) && !queue.includes(cleanUrl)) queue.push(cleanUrl);
      const localTarget = urlToLocalPath(cleanUrl);
      if (localTarget) {
        const rel = path.relative(path.dirname(urlToLocalPath(pageUrl) || OUTPUT_DIR), localTarget).replace(/\\/g, '/');
        $(el).attr('href', rel);
      }
    }
  });

  await Promise.all(assetPromises);

  const localPath = urlToLocalPath(pageUrl);
  if (localPath) {
    await fs.ensureDir(path.dirname(localPath));
    await fs.writeFile(localPath, $.html(), 'utf8');
    stats.pages++;
    console.log(`[page ${stats.pages}] ${pageUrl}`);
  }
}

async function zipFolder() {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(__dirname, 'qount_site.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(OUTPUT_DIR, 'qount_site');
    archive.finalize();
  });
}

async function main() {
  console.log('=== Qount.io Scraper Starting ===');
  await fs.ensureDir(OUTPUT_DIR);

  while (queue.length > 0) {
    const url = queue.shift();
    const clean = url.split('#')[0].split('?')[0];
    if (visited.has(clean)) continue;
    await scrapePage(clean);
    await new Promise(r => setTimeout(r, 300)); // polite delay
  }

  console.log('\n=== Scraping complete. Zipping... ===');
  const zipPath = await zipFolder();

  const totalFiles = stats.pages + stats.css + stats.js + stats.images + stats.other;
  const zipSize = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);

  const manifest = {
    pages_downloaded: stats.pages,
    css_files: stats.css,
    js_files: stats.js,
    images: stats.images,
    other_assets: stats.other,
    total_files: totalFiles,
    zip_size_mb: parseFloat(zipSize),
    timestamp: new Date().toISOString(),
    output_folder: OUTPUT_DIR,
    zip_file: zipPath,
  };

  await fs.writeJson(path.join(OUTPUT_DIR, 'manifest.json'), manifest, { spaces: 2 });
  await fs.writeJson(path.join(__dirname, 'qount_manifest.json'), manifest, { spaces: 2 });

  console.log('\n=== MANIFEST ===');
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`\nZip saved to: ${zipPath} (${zipSize} MB)`);
}

main().catch(console.error);
