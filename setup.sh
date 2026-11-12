#!/bin/bash
# Quelro server setup — Part 1 (install everything). Safe to re-run.
set -e
export DEBIAN_FRONTEND=noninteractive
APP=/home/ubuntu/leadagent
IP=$(curl -s -4 ifconfig.me)

echo "=== 1/7 System update ==="
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y curl git build-essential ca-certificates gnupg ssl-cert debian-keyring debian-archive-keyring apt-transport-https

echo "=== 2/7 Swap (extra memory safety) ==="
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "=== 3/7 Node.js 20 + pm2 ==="
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2

echo "=== 4/7 PostgreSQL 18 ==="
sudo apt-get install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt-get install -y postgresql-18
if [ ! -f /home/ubuntu/.dbpass ]; then
  openssl rand -hex 16 > /home/ubuntu/.dbpass
  sudo -u postgres psql -c "CREATE USER quelro WITH PASSWORD '$(cat /home/ubuntu/.dbpass)';"
  sudo -u postgres psql -c "CREATE DATABASE quelro OWNER quelro;"
fi

echo "=== 5/7 Caddy (auto HTTPS) ==="
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -y && sudo apt-get install -y caddy
fi
TESTDOMAIN="$(echo $IP | tr . -).sslip.io"
echo "$TESTDOMAIN {
  reverse_proxy localhost:3001
}" | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy || sudo systemctl restart caddy

echo "=== 6/7 Download + build app ==="
[ -d $APP ] || git clone https://github.com/harshwrites07-ops/leadagent $APP
cd $APP && git pull
# Crash fix: log unhandled promise errors instead of killing the whole server
perl -0pi -e "s/console\.error\('\[FATAL\] Unhandled rejection:', reason\?\.message \|\| reason\);\n  process\.exit\(1\);/console.error('[ERROR] Unhandled rejection (kept running):', reason?.message || reason);/" backend/server.js
npm install --prefix backend
npm install --prefix frontend && npm run build --prefix frontend

echo "=== 7/7 Base .env ==="
if [ ! -f $APP/.env ]; then
  echo "NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://quelro:$(cat /home/ubuntu/.dbpass)@localhost:5432/quelro
APP_URL=https://$TESTDOMAIN
FRONTEND_URL=https://$TESTDOMAIN" > $APP/.env
fi

echo ""
echo "=============================================="
echo " PART 1 DONE ✅"
echo " Test address: https://$TESTDOMAIN"
echo " Send Claude a screenshot of this message."
echo "=============================================="
