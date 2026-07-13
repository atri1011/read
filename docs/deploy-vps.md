# Deploy English Reader on a VPS

This guide covers a typical single-VPS setup: Docker Compose for app + Postgres + Redis + worker, with **Caddy** (or Nginx) on the host terminating TLS and reverse-proxying to the web container.

## Architecture

```text
Internet → Caddy/Nginx (:443) → 127.0.0.1:3000 (web)
                                      │
                         ┌────────────┼────────────┐
                         ▼            ▼            ▼
                      Postgres      Redis       worker
                      (internal)  (internal)   (PDF / LLM)
                         │
                    volume: pgdata
                    volume: uploads
```

- Do **not** publish Postgres (`5432`) or Redis (`6379`) to the public internet in production.
- Keep `LLM_API_KEY` and `SESSION_SECRET` only in host `.env` / secrets; never embed them in client bundles.

## Prerequisites

- Linux VPS with Docker Engine + Docker Compose plugin
- Domain DNS A/AAAA record pointing at the VPS
- Open ports **80** and **443** for the reverse proxy
- Optional: `git` to clone this repo

## 1. Prepare the host

```bash
# example
sudo mkdir -p /opt/english-reader
sudo chown "$USER":"$USER" /opt/english-reader
cd /opt/english-reader
git clone <your-fork-or-mirror> .
cp .env.example .env
```

Edit `.env` at minimum:

| Variable | Notes |
|----------|--------|
| `POSTGRES_PASSWORD` | Strong random password; update `DATABASE_URL` to match |
| `DATABASE_URL` | Use service hostname `db` when containers talk to each other: `postgresql://reader:<pass>@db:5432/reader` |
| `REDIS_URL` | `redis://redis:6379/0` inside Compose |
| `SESSION_SECRET` | Long random string (≥ 32 chars) |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | Vision-capable OpenAI-compatible endpoint |
| `NEXT_PUBLIC_APP_URL` | Public origin, e.g. `https://reader.example.com` |
| `UPLOAD_DIR` | Keep `/data/uploads` when using Compose volume |

## 2. Harden Compose for production (recommended)

For production, prefer **not** publishing DB/Redis ports. Example override file `docker-compose.prod.yml`:

```yaml
services:
  db:
    ports: !reset []
  redis:
    ports: !reset []
  web:
    ports:
      - "127.0.0.1:3000:3000"
```

Then:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

If your Compose version does not support `!reset`, edit `docker-compose.yml` manually: remove `5432`/`6379` host mappings and bind web as `127.0.0.1:3000:3000` only.

## 3. Start the stack

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f web worker
```

App listens on host `http://127.0.0.1:3000` (or `:3000` if left open for local debug).

Apply DB schema if your image does not auto-migrate (project uses Drizzle; run migrations from the web container or CI as you prefer):

```bash
docker compose exec web npx drizzle-kit migrate
# or the project's documented migrate command if different
```

## 4. Caddy reverse proxy (TLS automatic)

Install Caddy on the **host** (not inside Compose). Example Caddyfile:

```caddy
reader.example.com {
  encode gzip
  reverse_proxy 127.0.0.1:3000
}
```

Reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains and renews Let's Encrypt certificates automatically when DNS points at the VPS and ports 80/443 are open.

### Nginx alternative (sketch)

```nginx
server {
  listen 443 ssl http2;
  server_name reader.example.com;

  # ssl_certificate / ssl_certificate_key managed by certbot or your CA

  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 5. Firewall sketch

```bash
# allow SSH + HTTP/HTTPS only
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 6. Backups

Two durable pieces of state matter:

1. **PostgreSQL** — users, documents metadata, revisions, annotations, jobs  
2. **Uploads volume** — original TXT/MD/PDF files under `/data/uploads`

### Postgres dump

```bash
# timestamped logical dump
mkdir -p /opt/backups/reader
docker compose exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > "/opt/backups/reader/pg_$(date +%F_%H%M).sql.gz"
```

Restore (destructive — practice on a spare instance first):

```bash
gunzip -c /opt/backups/reader/pg_YYYY-MM-DD_HHMM.sql.gz \
  | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

### Uploads volume

Compose volume name is typically `<project>_uploads`. Copy it while containers are stopped or use a consistent snapshot:

```bash
# stop writers briefly for a clean copy (optional but safer)
docker compose stop web worker

docker run --rm \
  -v "$(basename $(pwd))_uploads:/data:ro" \
  -v /opt/backups/reader:/backup \
  alpine tar czf "/backup/uploads_$(date +%F_%H%M).tar.gz" -C /data .

docker compose start web worker
```

If the project directory name differs, list volumes with `docker volume ls | grep uploads`.

### Suggested cron (host)

```cron
15 3 * * * cd /opt/english-reader && docker compose exec -T db pg_dump -U reader -d reader | gzip > /opt/backups/reader/pg_$(date +\%F).sql.gz
30 3 * * 0 cd /opt/english-reader && docker run --rm -v english-reader_uploads:/data:ro -v /opt/backups/reader:/backup alpine tar czf /backup/uploads_$(date +\%F).tar.gz -C /data .
```

Keep at least 7 daily DB dumps and 4 weekly upload archives off-box (S3, another VPS, or encrypted sync).

## 7. Updates

```bash
cd /opt/english-reader
git pull
docker compose up -d --build
docker compose logs -f --tail=100 web worker
```

## 8. Health checks

- Browser: `https://reader.example.com` → login / shelf  
- `docker compose ps` — `db`, `redis`, `web`, `worker` healthy/running  
- Upload a small `.txt`, confirm review → publish → read  
- Dictionary: double-click a word while logged in (needs outbound HTTPS to Free Dictionary + MyMemory)

## 9. Security notes

- Change default `POSTGRES_PASSWORD` / `SESSION_SECRET` before any shared host  
- Do not expose Redis or Postgres ports publicly  
- Restrict who can register if the instance is private (future hardening: invite-only / rate limits)  
- Treat uploaded PDFs as untrusted input; keep worker isolated and disk quotas in mind  

## Related

- Product design: [`DESIGN.md`](../DESIGN.md)  
- Root quick start: [`README.md`](../README.md)
