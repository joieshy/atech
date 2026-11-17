# Deploy sa VPS (Ubuntu 22.04 / 24.04)

Step-by-step para mapatakbo ang ATECH sa VPS mo. Ang example domain ay `atech.example.com` — palitan ng totoong domain o IP.

## 1. Requirements

- Ubuntu 22.04/24.04 VPS (1 vCPU, 1 GB RAM ay okay na; dagdagan ang disk para sa installers)
- Domain na naka-point sa IP ng VPS (A record)
- SSH access

## 2. Install Node.js 22 LTS

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git nginx
node -v   # dapat v22.x
```

## 3. Gumawa ng app user at ilagay ang code

```bash
sudo adduser --disabled-password --gecos "" atech
sudo mkdir -p /var/www/atech
sudo chown -R atech:atech /var/www/atech
sudo -u atech git clone https://github.com/<username>/<repo>.git /var/www/atech
cd /var/www/atech
sudo -u atech npm ci --omit=dev
```

Kung private ang repo, gumawa ng deploy key o `gh auth login` bilang `atech` user, o i-`scp`/`rsync` ang project.

## 4. Configure ang `.env`

```bash
cd /var/www/atech
sudo -u atech cp .env.example .env
sudo -u atech nano .env
```

Palitan:

```env
PORT=3000
HOST=127.0.0.1
ADMIN_PASSWORD=<malakas-na-password>
SESSION_SECRET=<random-64-hex>
MAX_UPLOAD_MB=2048
SEED_DEMO=false
```

Generate ng secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `SEED_DEMO=false` kung ayaw mo ng sample entries. Kung `true`, pwede mong i-delete ang demo sa admin mamaya.

## 5. Test run

```bash
sudo -u atech node server.js
```

Buksan sa browser: `http://<vps-ip>:3000` at `/admin`. Kung gumagana, `Ctrl+C`.

## 6A. Systemd (recommended)

```bash
sudo cp deploy/atech.service /etc/systemd/system/atech.service
sudo nano /etc/systemd/system/atech.service
# palitan ang User at WorkingDirectory kung iba ang path
sudo systemctl daemon-reload
sudo systemctl enable --now atech
sudo systemctl status atech
sudo journalctl -u atech -f
```

## 6B. PM2 (alternative)

```bash
sudo npm install -g pm2
cd /var/www/atech
sudo -u atech pm2 start ecosystem.config.cjs
sudo -u atech pm2 save
sudo env PATH=$PATH pm2 startup systemd -u atech --hp /home/atech
```

## 7. Nginx reverse proxy

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/atech
sudo nano /etc/nginx/sites-available/atech
# palitan ang server_name at client_max_body_size
sudo ln -s /etc/nginx/sites-available/atech /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Importante:

- `client_max_body_size` dapat **katumbas o mas malaki** sa `MAX_UPLOAD_MB`.
- Naka-`proxy_buffering off` at mahahabang timeout para hindi maputol ang malalaking download/upload.

## 8. HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d atech.example.com
sudo certbot renew --dry-run
```

Pagkatapos, automatic nang mag-se-set ng `Secure` flag ang admin cookie kapag HTTPS.

## 9. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Hindi kailangang buksan ang port `3000` sa public — localhost lang ito sa Nginx.

## 10. Backups

I-backup ang dalawang bagay:

```bash
# Database (safe kahit running dahil WAL mode, pero mas okay kung i-stop sandali)
sqlite3 /var/www/atech/data/atech.db ".backup '/backup/atech-$(date +%F).db'"

# Installer files
rsync -a /var/www/atech/storage/installers/ /backup/installers/
```

O simpleng cron:

```bash
crontab -e
# araw-araw 3 AM
0 3 * * * tar czf /backup/atech-$(date +\%F).tar.gz -C /var/www atech/data atech/storage/installers
```

## 11. Update flow

```bash
cd /var/www/atech
sudo -u atech git pull
sudo -u atech npm ci --omit=dev
sudo systemctl restart atech
```

Hindi maaapektuhan ang `data/` at `storage/` kasi hindi sila kasama sa git.

## 12. Common issues

| Problema | Solusyon |
| --- | --- |
| `502 Bad Gateway` | Patay ang Node process. `sudo systemctl status atech` / `journalctl -u atech -n 50` |
| Upload fails at ~1 MB | Kulang ang `client_max_body_size` sa Nginx |
| Upload fails at 2048 MB | Taasan ang `MAX_UPLOAD_MB` sa `.env` **at** `client_max_body_size` |
| Hindi maka-login | Mali ang `ADMIN_PASSWORD` sa `.env`, o hindi naka-restart pagkatapos palitan |
| Na-`429` sa login | Rate limit (10 attempts / 15 min). Maghintay o i-restart ang app |
| File not found sa download | Nabura/nailipat ang file sa `storage/installers/`; i-re-upload sa admin |
| Masyadong mababa ang download speed | Normal lang sa VPS bandwidth; i-enable ang Nginx `sendfile`/`tcp_nopush` (nasa sample config) |

## 13. Disk planning

Ang installers ang kakain ng space. Halimbawa, 20 files × 500 MB = 10 GB. Mag-`df -h` regularly at mag-alis ng lumang version sa admin kung kailangan.
