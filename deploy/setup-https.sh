#!/usr/bin/env bash
# =============================================================================
# ATECH — one-shot HTTPS setup (Nginx + Let's Encrypt via Cloudflare DNS-01)
#
# Usage:
#   cd ~/atech
#   sudo bash deploy/setup-https.sh
#
# Requirements:
#   - Domain DNS managed by Cloudflare
#   - Cloudflare *User API Token* (starts with cfut_) with Zone → DNS → Edit
#   - Oracle Cloud Security List: TCP 443 open
# =============================================================================

set -euo pipefail

DOMAIN="murangpisowifi.online"
WWW="www.murangpisowifi.online"
APP_PORT="3040"
APP_USER="joieshy"
APP_DIR="/home/joieshy/atech"

if [ "$(id -u)" -ne 0 ]; then
  echo "Patakbuhin gamit ang sudo:"
  echo "  sudo bash deploy/setup-https.sh"
  exit 1
fi

echo "=============================================="
echo " ATECH HTTPS setup — $DOMAIN"
echo "=============================================="
echo

read -r -p "Let's Encrypt email: " LE_EMAIL
if [ -z "$LE_EMAIL" ]; then
  echo "Kailangan ng email para sa Let's Encrypt."
  exit 1
fi

read -r -s -p "Cloudflare API token (cfut_... / Zone.DNS.Edit): " CF_TOKEN
echo
if [ -z "$CF_TOKEN" ]; then
  echo "Kailangan ng Cloudflare API token."
  exit 1
fi

case "$CF_TOKEN" in
  cfk_*)
    echo "ERROR: Global API Key ang naipaste mo (cfk_)."
    echo "Gumawa ng scoped User API Token sa https://dash.cloudflare.com/profile/api-tokens"
    echo "Template: Edit zone DNS → Zone Resources: murangpisowifi.online"
    exit 1
    ;;
esac

echo
echo "==> [1/7] Installing Nginx, Certbot at Cloudflare DNS plugin..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-dns-cloudflare

echo
echo "==> [2/7] Saving Cloudflare credentials (root-only)..."
install -d -m 700 /etc/letsencrypt
cat > /etc/letsencrypt/cloudflare.ini <<EOF
dns_cloudflare_api_token = $CF_TOKEN
EOF
chmod 600 /etc/letsencrypt/cloudflare.ini

echo
echo "==> [3/7] Issuing Let's Encrypt certificate via DNS-01..."
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 \
  -d "$DOMAIN" \
  -d "$WWW" \
  --email "$LE_EMAIL" \
  --agree-tos \
  --non-interactive \
  --keep-until-expiring

echo
echo "==> [4/7] Writing Nginx config..."
cat > /etc/nginx/sites-available/atech <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN $WWW;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN $WWW;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 2048M;
    client_body_timeout 3600s;

    # Security headers (the app also sets its own)
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Malalaking installer: huwag i-buffer sa nginx
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF

ln -sfn /etc/nginx/sites-available/atech /etc/nginx/sites-enabled/atech
rm -f /etc/nginx/sites-enabled/default

echo
echo "==> [5/7] Testing at starting Nginx..."
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo
echo "==> [6/7] Firewall + certificate renewal timer..."
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save
fi
systemctl enable --now certbot.timer

echo
echo "==> [7/7] PM2 autostart..."
if command -v pm2 >/dev/null 2>&1; then
  env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null 2>&1 || true
  sudo -u "$APP_USER" pm2 save >/dev/null 2>&1 || true
fi

echo
echo "==> Local checks..."
curl -s -o /dev/null -w "app   http://127.0.0.1:$APP_PORT  -> %{http_code}\n" "http://127.0.0.1:$APP_PORT/"
curl -sk -o /dev/null -w "https https://$DOMAIN (local) -> %{http_code}\n" --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/"

echo
echo "=============================================="
echo " TAPOS!"
echo " Buksan na lang ang TCP 443 sa Oracle Cloud"
echo " Security List, tapos i-open ang:"
echo
echo "   https://$DOMAIN"
echo "   https://$DOMAIN/admin"
echo "=============================================="
