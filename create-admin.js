// Run this once from the project root:
// node create-admin.js
require('dotenv').config({ path: '.env' });
const Database = require('./backend/node_modules/better-sqlite3');
const bcrypt = require('./backend/node_modules/bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'backend/data/outreach.db');
if (!fs.existsSync(DB_PATH)) {
  console.error('DB not found at', DB_PATH, '— run the server at least once first.');
  process.exit(1);
}

const db = new Database(DB_PATH);
const email = 'harshwrites07@gmail.com';
const password = 'Admin@Quelro2026';
const hash = bcrypt.hashSync(password, 12);

const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
if (existing) {
  db.prepare('UPDATE users SET password=?, is_admin=1, plan="agency", plan_status="active", email_verified=1, onboarding_completed=1 WHERE id=?').run(hash, existing.id);
  console.log('✓ Existing account promoted to admin. id=' + existing.id);
} else {
  const r = db.prepare(`INSERT INTO users (email,password,full_name,is_admin,plan,plan_status,email_verified,onboarding_completed) VALUES (?,?,?,1,'agency','active',1,1)`).run(email, hash, 'Harsh');
  console.log('✓ Admin account created. id=' + r.lastInsertRowid);
}

console.log('\nLogin details:');
console.log('  Email:    ' + email);
console.log('  Password: ' + password);
console.log('\nGo to app.quelro.com/login and sign in.');
