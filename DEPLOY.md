# Deploy sa VPS (Ubuntu 24.04+)

Step-by-step para mapatakbo ang ATECH sa VPS. Nasa ibaba ang **totoong setup ng live server** para alam agad kung saan hahanapin ang bawat bagay.

## 0. Live server cheat sheet

| Bagay | Value |
| --- | --- |
| Domain | `https://murangpisowifi.online` |
| VPS | `134.185.83.22` (Ubuntu 26.04 LTS) |
| SSH | `ssh vergie` (naka-set sa `~/.ssh/config`) |
| App user | `joieshy` |
| App path | `/home/joieshy/atech` |
| Process manager | **PM2**, app name `atech` |
| Node listen port | **3040** (`.env` → `PORT=3040`) |
| Nginx site | `/etc/nginx/sites-enabled/atech` |
| HTTPS | Let's Encrypt (`certbot --nginx`) |

> Ang `DEPLOY.md` sa repo ay naka-commit, kaya `git pull` lang sa server at updated din ang docs.

## 1. Requirements

- Ubuntu 22.04/24.04/26.04 VPS (1 vCPU, 1 GB RAM ay okay na; dagdagan ang disk para sa installers)
- Domain na naka-point sa IP ng VPS (A record)
- SSH access

## 2. Install Node.js 22 LTS

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git nginx
node -v   # dapat v22.x (live server: v24.x)
```

## 3. Gumawa ng app user at ilagay ang code

```bash
sudo adduser --disabled-password --gecos "" joieshy
git clone https://github.com/joieshy/atech.git /home/joieshy/atech
cd /home/joieshy/atech
npm ci --omit=dev
```

Kung private ang repo, gumawa ng deploy key o `gh auth login` bilang app user, o i-`scp`/`rsync` ang project.

## 4. Configure ang `.env`

```bash
cd /home/joieshy/atech
cp .env.example .env
nano .env
```

Halaga sa live server (huwag i-commit ang `.env`):

```env
PORT=3040
HOST=0.0.0.0
ADMIN_PASSWORD=<malakas-na-password>
SESSION_SECRET=<random-64-hex>
MAX_UPLOAD_MB=8192
MAX_COVER_MB=8
SEED_DEMO=false
```

Generate ng secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `SEED_DEMO=false` kung ayaw mo ng sample entries. Kung `true`, pwede mong i-delete ang demo sa admin mamaya.

## 5. Test run

```bash
cd /home/joieshy/atech
node server.js
```

Buksan sa browser: `http://<vps-ip>:3040` at `/admin`. Kung gumagana, `Ctrl+C`.

## 6. PM2 (ito ang ginagamit sa live)

```bash
sudo npm install -g pm2
cd /home/joieshy/atech
pm2 start ecosystem.config.cjs
pm2 save
sudo env PATH=$PATH pm2 startup systemd -u joieshy --hp /home/joieshy
```

Useful commands:

```bash
pm2 list                 # status ng apps
pm2 logs atech --lines 50
pm2 restart atech --update-env
pm2 describe atech       # script path, cwd, port
```

<details>
<summary>Alternative: systemd (`deploy/atech.service`)</summary>

```bash
sudo cp deploy/atech.service /etc/systemd/system/atech.service
sudo nano /etc/systemd/system/atech.service   # palitan ang User at WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now atech
sudo systemctl status atech
```

Huwag paganahin ang dalawa (PM2 + systemd) para walang port conflict.
</details>

## 7. Nginx reverse proxy

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/atech
sudo nano /etc/nginx/sites-available/atech
# palitan ang server_name at proxy_pass (dapat tumugma sa PORT sa .env)
sudo ln -s /etc/nginx/sites-available/atech /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Importante:

- `proxy_pass` dapat `http://127.0.0.1:3040` (o kung anong `PORT` sa `.env`).
- `client_max_body_size` dapat **katumbas o mas malaki** sa `MAX_UPLOAD_MB` (live: `8192M`).
- Naka-`proxy_buffering off` at mahahabang timeout para hindi maputol ang malalaking download/upload.

## 8. HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d murangpisowifi.online -d www.murangpisowifi.online
sudo certbot renew --dry-run
```

Pagkatapos, automatic nang nagsi-set ng `Secure` flag ang admin cookie kapag HTTPS.

## 9. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Hindi kailangang buksan ang port `3040` sa public — localhost lang ito sa Nginx.

## 10. Backups

I-backup ang dalawang bagay:

```bash
# Database (safe kahit running dahil WAL mode, pero mas okay kung i-stop sandali)
sqlite3 /home/joieshy/atech/data/atech.db ".backup '/backup/atech-$(date +%F).db'"

# Installer files
rsync -a /home/joieshy/atech/storage/installers/ /backup/installers/
rsync -a /home/joieshy/atech/storage/covers/ /backup/covers/
```

O simpleng cron:

```bash
crontab -e
# araw-araw 3 AM
0 3 * * * tar czf /backup/atech-$(date +\%F).tar.gz -C /home/joieshy atech/data atech/storage/installers atech/storage/covers
```

## 11. Update flow (deploy ng bagong code)

Galing sa local machine:

```bash
git add -A && git commit -m "..." && git push origin main
```

Sa server:

```bash
ssh vergie
cd ~/atech
git pull --ff-only
npm ci --omit=dev        # kailangan lang kung may nabagong dependency
pm2 restart atech --update-env
```

Isang linya lang kung walang dependency change:

```bash
ssh vergie "cd ~/atech && git pull --ff-only && pm2 restart atech --update-env"
```

Hindi maaapektuhan ang `data/` at `storage/` kasi hindi sila kasama sa git.

> Nagbabago ang CSS/JS? I-bump ang `?v=` sa `public/index.html` (styles.css at site.js) para hindi magamit ng browser ang lumang cache.

## 12. Common issues

| Problema | Solusyon |
| --- | --- |
| `502 Bad Gateway` | Patay ang Node process. `pm2 list` / `pm2 logs atech --lines 50` |
| `502` pero `online` ang PM2 | Mali ang port: tignan ang `PORT` sa `.env` vs `proxy_pass` sa Nginx |
| Bagong design pero luma pa rin | Old cache — i-bump ang `?v=` sa `index.html` at i-hard refresh |
| Upload fails at ~1 MB | Kulang ang `client_max_body_size` sa Nginx |
| Upload fails at 8192 MB | Taasan ang `MAX_UPLOAD_MB` sa `.env` **at** `client_max_body_size` |
| Hindi maka-login | Mali ang `ADMIN_PASSWORD` sa `.env`, o hindi naka-restart pagkatapos palitan |
| Na-`429` sa login | Rate limit (10 attempts / 15 min). Maghintay o i-restart ang app |
| File not found sa download | Nabura/nailipat ang file sa `storage/installers/`; i-re-upload sa admin |
| Masyadong mababa ang download speed | Normal lang sa VPS bandwidth; i-enable ang Nginx `sendfile`/`tcp_nopush` |

## 13. Disk planning

Ang installers ang kakain ng space. Halimbawa, 20 files × 500 MB = 10 GB. Mag-`df -h` regularly at mag-alis ng lumang version sa admin kung kailangan.
