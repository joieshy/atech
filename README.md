# ATECH — Installer Hub

Public download site + web admin para sa mga installer ng **PisoWiFi**, **PisoNet**, **PisoTab** at iba pang shop tools. Naka-Node.js + Express at **SQLite** (zero-config database), at ang mga file ay naka-save mismo sa VPS.

![stack](https://img.shields.io/badge/Node.js-20%2B-3c873a) ![db](https://img.shields.io/badge/SQLite-better--sqlite3-22d3ee) ![license](https://img.shields.io/badge/use-personal%20%26%20shop-8b5cf6)

## Ano ang kasama

- **Public site** (`/`) — hero, categories, search, filter, sort, details modal, download counter, FAQ at social links.
- **Web admin** (`/admin`) — split-screen login page, overview dashboard na may 7-day download chart, installer table, upload/edit/delete, publish/draft toggle at site settings.
- **SQLite database** — `data/atech.db`, awtomatikong ginagawa sa first run. Walang MySQL/Postgres na kailangan.
- **Direct downloads** — `/download/:slug` ang nag-stream ng file mula sa `storage/installers/` at nagbibilang ng downloads.
- **Security basics** — HttpOnly signed session cookie, password check, login rate limit, CSP headers, file type whitelist at upload size limit. May **Change password** form sa admin Settings.
- **Sample entries** — may 6 demo installers para makita agad ang design. Pwede silang i-delete sa admin at palitan ng totoong files.

## Requirements

- Node.js **20 o mas bago** (recommended: Node 22/24 LTS)
- Windows, Linux (Ubuntu/Debian VPS) o macOS
- Disk space para sa installer files (ideally 2x ng total file size para sa headroom)

## Quick start (local)

```bash
npm install
npm start
```

Pag-first run, gagawa ito ng `.env` na may random admin password at ipi-print sa terminal:

```
  ATECH installer hub is running
  Local:    http://localhost:3000
  Admin:    http://localhost:3000/admin
  Generated admin password: xxxxxxxxxxxxxxxx
```

1. Buksan ang <http://localhost:3000> para sa public site.
2. Buksan ang <http://localhost:3000/admin> at i-login gamit ang generated password.
3. I-delete ang mga **sample** entries at i-upload ang totoong installers mo.

> Palitan ang password anumang oras sa `.env` → `ADMIN_PASSWORD=...` tapos i-restart ang server.

## Paano mag-upload ng installer

1. Pumunta sa `/admin` → **New upload**.
2. I-drop o i-click ang file (APK, APKS, XAPK, EXE, MSI, MSIX, ZIP, RAR, 7Z, XZ, ISO, IMG, TAR, GZ, BIN, DMG, DEB, RUN, PDF, at split archives `.001` / `.r00` / `.z01`).
3. Punan ang title, category, version at description.
4. Piliin kung **Published** (visible agad sa site) o **Featured** (lalabas sa unahan).
5. I-submit. Naka-save na ang file sa `storage/installers/` at ang record sa SQLite.

Ang default max upload size ay **2048 MB**. Palitan sa `.env`:

```env
MAX_UPLOAD_MB=4096
```

Kung gagamit ka ng mas malaking file (hal. `.img` na 4–8 GB), taasan din ang Nginx limit:

```bash
sudo sed -i 's/client_max_body_size 2048M;/client_max_body_size 8192M;/' /etc/nginx/sites-available/atech
sudo nginx -t && sudo systemctl reload nginx
```

Tapos i-restart ang app: `pm2 restart atech`.

## Palitan ang admin password

1. Pumunta sa `/admin` → **Settings**
2. Sa **Admin password** panel, ilagay ang current password, bagong password (minimum 10 characters), at confirm
3. Click **I-save ang password**

Naka-save ito sa `.env` (mode `600`) at agad na nag-eepekto — hindi na kailangan mag-restart. Automatic ding ma-invalidate ang lahat ng ibang sessions pagkatapos palitan.

## Project structure

```
ATECHWEB/
├─ server.js                 # entry point
├─ src/
│  ├─ app.js                 # express app + middleware
│  ├─ config.js              # .env loader / auto-generate
│  ├─ db.js                  # SQLite schema, categories, demo seed
│  ├─ auth.js                # session cookie, password, rate limit
│  ├─ upload.js              # multer storage + file whitelist
│  ├─ utils.js               # slug, serializers
│  ├─ demo-zip.js            # sample installer generator
│  └─ routes/
│     ├─ public.js           # /api/site, /api/installers, /download/:slug
│     └─ admin.js            # /api/admin/*
├─ public/
│  ├─ index.html             # public site
│  ├─ admin.html             # web admin
│  ├─ license.html           # License at Terms page
│  ├─ 404.html
│  └─ assets/
│     ├─ css/styles.css
│     ├─ css/admin.css
│     ├─ js/site.js
│     └─ js/admin.js
├─ storage/installers/       # uploaded installer files (hindi naka-commit)
├─ data/atech.db             # SQLite database (hindi naka-commit)
├─ deploy/                   # nginx + systemd samples
├─ ecosystem.config.cjs      # PM2 config (optional)
└─ DEPLOY.md                 # VPS deployment guide
```

## Where the data lives

| Ano | Saan |
| --- | --- |
| Installer files | `storage/installers/` |
| Database (metadata, downloads, settings) | `data/atech.db` (+ `-wal`, `-shm`) |
| Admin password / config | `.env` |

I-backup ang `data/` at `storage/installers/` para hindi mawala ang files at stats. Automatic na naka-`WAL` mode ang SQLite.

## Categories

Naka-seed na: `pisowifi`, `pisonet`, `others`. Para magdagdag o mag-rename, i-edit ang `CATEGORIES` sa `src/db.js` at i-restart ang server — naka-upsert ito (safe sa existing data).

## API (para sa integrations)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/site` | Site settings, stats, categories |
| GET | `/api/installers?q=&category=&sort=` | Published installers |
| GET | `/download/:slug` | Download + counter |
| POST | `/api/admin/login` | Admin login |
| POST | `/api/admin/change-password` | Palitan ang admin password |
| GET | `/api/admin/overview` | Dashboard stats |
| GET | `/api/admin/installers` | Lahat ng installers (admin) |
| POST | `/api/admin/installers` | Upload (multipart) |
| PATCH | `/api/admin/installers/:id` | Edit / publish / replace file |
| DELETE | `/api/admin/installers/:id` | Delete record + file |
| GET/PUT | `/api/admin/settings` | Site settings |
| GET | `/healthz` | Health check |

## Deploy sa VPS

Tingnan ang **[DEPLOY.md](DEPLOY.md)** para sa step-by-step (Ubuntu + Nginx + systemd/PM2 + HTTPS + backups).

## Notes

- Ang demo files ay maliliit na ZIP na may README — para lang makita ang download flow. I-delete sa admin bago i-launch publicly.
- Walang user accounts ang public site; download lang ang kaya nilang gawin.
- Kung magpapa-public ka, siguraduhing malakas ang `ADMIN_PASSWORD` at naka-HTTPS ang admin.

## Security

- **HTTPS** sa domain (Let's Encrypt) at HSTS header kapag naka-HTTPS.
- **Admin auth**: password + opaque, database-backed session cookie. `HttpOnly`, `SameSite=Lax`, `Secure` kapag HTTPS, 12-hour expiry. Naka-hash (SHA-256) lang ang session token sa database.
- **Login rate limit** (10 attempts / 15 min) at **change-password limit** (8 / 15 min).
- **CSRF guard**: lahat ng state-changing admin requests ay kailangang same-origin (`Sec-Fetch-Site`) o may `X-Requested-With: XMLHttpRequest` header.
- **Session control**: makikita sa Settings → Active sessions; pwedeng i-logout ang ibang devices. Pag pinalitan ang password, lahat ng sessions maliban sa kasalukuyan ay revoked.
- **CSP**, `X-Frame-Options`, `nosniff`, Referrer-Policy; prepared SQLite statements; upload extension whitelist; files sa labas ng public web root.

Walang website na 100% unhackable. Para sa mas mahigpit na setup: gumamit ng malakas at unique admin password, i-update regularly ang OS/dependencies, gumawa ng backups, at huwag i-share ang `/admin` link.

## License

Proprietary — tingnan ang [LICENSE](LICENSE). Ang website code, design at content ay hindi pwedeng i-reuse o ibenta nang walang pahintulot. Ang installer files ay ibinibigay “as is” para sa personal/shop use; ang third-party software at trademarks ay pag-aari ng kani-kanilang may-ari.

May public na **License at Terms** page sa `/license`, at naka-link ito sa footer ng site.
