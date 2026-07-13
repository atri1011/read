# English Reader MVP

Self-hosted English reading app with EPUB/PDF upload, vocabulary tracking, and LLM-assisted learning.

## Quick start

1. Copy env defaults:

```bash
cp .env.example .env
```

2. Fill in `LLM_API_KEY` and change `SESSION_SECRET` in `.env`.

3. Start the stack:

```bash
docker compose up --build
```

App: [http://localhost:3000](http://localhost:3000)

> Note: `apps/web` and `workers/parser` are added in later tasks. Until then, the `web` and `worker` services will fail to build.

## Host reverse proxy

This compose stack binds ports for local development only. On a real host, put a reverse proxy (Caddy, Nginx, or Traefik) in front of `web:3000`, terminate TLS there, and keep Postgres/Redis internal. See [DESIGN.md](./DESIGN.md) for deployment and reverse-proxy notes.
