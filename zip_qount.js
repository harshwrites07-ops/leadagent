const AdmZip = require('adm-zip');
const fs = require('fs-extra');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'qount_site');
const ZIP_PATH = path.join(__dirname, 'qount_site.zip');

console.log('Zipping qount_site/ ...');
const zip = new AdmZip();
zip.addLocalFolder(OUTPUT_DIR, 'qount_site');
zip.writeZip(ZIP_PATH);

const sizeMB = (fs.statSync(ZIP_PATH).size / 1024 / 1024).toFixed(2);
console.log(`Done! Zip saved to: ${ZIP_PATH} (${sizeMB} MB)`);

// Update manifest
const manifestPath = path.join(__dirname, 'qount_manifest.json');
if (fs.existsSync(manifestPath)) {
  const m = fs.readJsonSync(manifestPath);
  m.zip_file = ZIP_PATH;
  m.zip_size_mb = parseFloat(sizeMB);
  fs.writeJsonSync(manifestPath, m, { spaces: 2 });
  console.log('\n=== FINAL MANIFEST ===');
  console.log(JSON.stringify(m, null, 2));
}
