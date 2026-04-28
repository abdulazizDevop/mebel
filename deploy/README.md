# Mebel — Deploy guide (Ubuntu 22.04 / 24.04)

End-to-end recipe to bring the storefront live on a fresh Ubuntu droplet:
- Docker Compose stack: **postgres + fastapi + nginx (with built React bundle)**
- HTTPS via Let's Encrypt (certbot, host nginx)
- TimeWeb Cloud Storage (S3-compatible) for product images

The compose stack assumes domain `your-domain.tld` is pointed at the
server's public IP via an A record. Replace it with the real domain
everywhere below.

---

## 1. One-time server prep

```bash
# As root or via sudo
apt update && apt -y upgrade
apt -y install ca-certificates curl gnupg ufw

# Docker (official repo)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Firewall — only let in HTTP(S) and SSH.
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

Create a non-root deploy user (recommended) and add to `docker` group:

```bash
adduser deploy
usermod -aG docker deploy
mkdir -p /home/deploy/mebel
chown -R deploy:deploy /home/deploy/mebel
```

Switch to that user (`su - deploy`) for the steps below.

---

## 2. Pull the project

```bash
cd ~/mebel
git clone https://github.com/your-org/mebel.git .
# OR rsync from your laptop:
#   rsync -av --exclude node_modules --exclude .venv ~/Developer/Mebel/ \
#         deploy@your-server:~/mebel/
```

---

## 3. Configure environment

There are **two** env files — kept separate so DB creds and app secrets
rotate independently.

### `.env` at the repo root (compose-level)

```bash
cp .env.compose.example .env
$EDITOR .env       # set POSTGRES_PASSWORD to a long random string
```

### `backend/.env` (FastAPI app)

```bash
cp backend/.env.example backend/.env
$EDITOR backend/.env
```

Fill in:

| key | value |
| --- | --- |
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `CORS_ORIGINS` | `https://your-domain.tld` (no trailing slash) |
| `BOOTSTRAP_ADMIN_PASSWORD` | strong password — rotated on first login |
| `VAPID_*` | run inside container after first build: `docker compose run --rm api python -m app.gen_vapid` and paste output |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | TimeWeb keys |
| `AWS_REGION` | `ru-1` (TimeWeb default) |
| `S3_BUCKET` | your bucket name |
| `S3_ENDPOINT_URL` | `https://s3.twcstorage.ru` |
| `S3_PUBLIC_URL_PREFIX` | `https://s3.twcstorage.ru/<bucket>` |

**Do not commit** either `.env` — both are in `.gitignore`.

---

## 4. First boot

```bash
docker compose pull            # base images
docker compose build           # api + web
docker compose up -d db        # bring postgres up first
docker compose run --rm api alembic upgrade head      # create tables
docker compose run --rm api python -m app.seed       # seed bootstrap admin
docker compose up -d           # start everything (api + web + db)
```

Check it:

```bash
docker compose ps              # all healthy
docker compose logs -f api     # tail backend
curl -s http://localhost/api/health
```

Visit `http://your-server-ip/` — you should see the storefront.

> The compose stack publishes port 80 only. The next step swaps it behind a host nginx with TLS.

---

### Deploying before the domain arrives — IP-only mode

If you want to test the live server before the domain DNS is ready (e.g.
`72.56.33.218` is yours but `your-domain.tld` isn't pointed yet):

1. In `backend/.env` set:
   ```
   CORS_ORIGINS=http://72.56.33.218
   ```
2. Skip section 5 (HTTPS / certbot) for now — keep `docker-compose.yml`
   publishing `web` on `80:80`.
3. Visit `http://72.56.33.218/` directly.

**Caveats while running on a bare IP**:
- **Web Push won't work** — browsers gate `PushManager` to HTTPS-or-localhost.
  Once the domain + TLS land, push starts working without any code change.
- Service workers similarly require HTTPS, so the offline-style chat
  notifications are silently disabled until certbot runs.
- The rest (real-time WebSocket chat, catalog, orders, admin) works fine.

When the domain arrives, swap `CORS_ORIGINS` to `https://your-domain.tld`,
restart the api (`docker compose restart api`), and follow section 5 below.

---

## 5. HTTPS via certbot (host nginx)

The compose `web` container speaks HTTP on port 80. We put a tiny
host-level nginx in front that owns TLS and forwards to the container.

```bash
# Free up port 80 on the host first.
docker compose stop web
sudo apt -y install nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/mebel > /dev/null <<'EOF'
server {
    listen 80;
    server_name your-domain.tld;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/mebel /etc/nginx/sites-enabled/mebel
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Now expose the compose `web` on `127.0.0.1:8080` instead of `:80`. Edit
`docker-compose.yml`:

```yaml
  web:
    ports:
      - "127.0.0.1:8080:80"     # was "80:80"
```

…and bring it back up:

```bash
docker compose up -d web
```

Get a certificate:

```bash
sudo certbot --nginx -d your-domain.tld --redirect --agree-tos -m owner@your-domain.tld
```

Certbot rewrites the nginx config to serve TLS and adds a renew cron.

---

## 6. Day-2 ops

| task | command |
| --- | --- |
| Pull new code | `git pull && docker compose build && docker compose up -d` |
| Apply DB migrations | `docker compose run --rm api alembic upgrade head` |
| Seed catalog (one-shot) | `docker compose run --rm api python -m app.seed` &nbsp;then on a workstation: `npm run seed` |
| Backup postgres | `docker compose exec db pg_dump -U mebel mebel | gzip > backup-$(date +%F).sql.gz` |
| Tail logs | `docker compose logs -f` |
| Restart api | `docker compose restart api` |
| VAPID key rotation | regenerate, paste into `backend/.env`, restart api — every browser will re-prompt for notifications |
| Reset a forgotten admin password | `docker compose exec api python -c "from app.database import SessionLocal; from app.models import User; from app.security import hash_password; db=SessionLocal(); u=db.query(User).filter_by(name='admin').one(); u.password_hash=hash_password('new-strong-pw'); db.commit()"` |

---

## 7. Sanity checklist before going live

- [ ] `JWT_SECRET` is unique, ≥ 64 chars
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` was changed via the in-app Settings tab on first login
- [ ] `CORS_ORIGINS` contains only `https://your-domain.tld` (no `*`)
- [ ] `POSTGRES_PASSWORD` is a fresh, long random string
- [ ] HTTPS works (`curl -I https://your-domain.tld`)
- [ ] Push notifications fire across two devices
- [ ] First product upload lands on TimeWeb (admin → product form → check the URL)
- [ ] Postgres backup cron in place (sample: `0 3 * * * cd /home/deploy/mebel && docker compose exec -T db pg_dump -U mebel mebel | gzip > backups/$(date +\%F).sql.gz`)
