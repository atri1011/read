# English Reader MVP

Self-hosted English reading app: TXT/MD/PDF upload, vision-LLM layout restore, annotations, and bilingual dictionary lookup.

## Features (MVP)

- Email/password auth and personal + public shelves  
- Upload TXT / Markdown / PDF; PDF parse via vision-capable OpenAI-compatible API  
- Markdown review → publish → reader with highlights, underlines, notes  
- Bilingual word lookup (EN definitions + ZH gloss) with Redis/memory cache  
- Dark mode, reader font size / measure, sticky TOC  

## Quick start (local)

1. Copy env defaults:

```bash
cp .env.example .env
```

2. Fill in `LLM_API_KEY` and change `SESSION_SECRET` (and prefer a non-default `POSTGRES_PASSWORD`) in `.env`.

3. Start the stack:

```bash
docker compose up --build
```

App: [http://localhost:3000](http://localhost:3000)

Services: `web` (Next.js), `worker` (Python PDF/text parser), `db` (Postgres 16), `redis` (queue + dict cache).

### Local web-only development

If Postgres/Redis already run via Compose:

```bash
docker compose up -d db redis
cd apps/web
# point DATABASE_URL / REDIS_URL at localhost in .env
npm install
npm run dev
```

Worker (optional, for PDF jobs):

```bash
cd workers/parser
# install per workers/parser README / pyproject
```

## Dictionary API

`GET /api/dictionary?q=word` (session required)

- **EN senses:** [Free Dictionary API](https://dictionaryapi.dev/)  
- **ZH gloss:** [MyMemory](https://mymemory.translated.net/) for the headword (rate-limited; best-effort)  
- **Cache:** Redis key `dict:{q}` TTL 7 days when `REDIS_URL` works; in-process `Map` fallback  

## Deploy on a VPS

See **[docs/deploy-vps.md](./docs/deploy-vps.md)** for:

- Caddy/Nginx reverse proxy to `127.0.0.1:3000`  
- Production Compose port binding  
- `pg_dump` + uploads volume backup  

Minimal Caddy example:

```caddy
reader.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

On a real host, terminate TLS at the reverse proxy and **do not publish Postgres/Redis** to the public internet.

## Repo layout

```text
apps/web          Next.js app (API + UI)
workers/parser    Python job worker
docs/             Deploy and planning notes
docker-compose.yml
DESIGN.md
```

## Design

See [DESIGN.md](./DESIGN.md) for product scope, data model, and non-goals.
