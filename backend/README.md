# Backend — Open Innovation Self-Evaluation

A small Node service that receives anonymized response data from the evaluation widget, stores it in Postgres, and exposes token-protected export endpoints.

## What gets stored

Per submission:

| column | type | notes |
|---|---|---|
| `id` | serial pk | |
| `created_at` | timestamptz | server-side timestamp |
| `client_ts` | text | timestamp from the client |
| `industry` | text | from the demographics dropdown |
| `company_size` | text | from the demographics dropdown |
| `score_sourcing` | real | 1–5 |
| `score_acquiring` | real | 1–5 |
| `score_selling` | real | 1–5 |
| `score_revealing` | real | 1–5 |
| `answers` | jsonb | raw item-level answers, in case you ever rephrase items |

**Not stored on the server**: the executive's role, and the four optional free-text reflections. Both stay in their browser only. This is deliberate — reflections can contain identifying detail and aren't analytically useful at the aggregate level.

## Deploying on Railway

1. **New project → Postgres** (Railway provisions a `DATABASE_URL` env var).
2. **New service → Deploy from GitHub repo** → pick this repo.
3. In the new service settings, set **Root Directory** to `backend`. Railway will detect Node, run `npm install`, and `npm start`.
4. **Variables tab** on the service:
   - `EXPORT_TOKEN` → a long random string. Generate one with `openssl rand -hex 32`. Without this, the export endpoints reject everything.
   - `ALLOWED_ORIGINS` (optional) → comma-separated list of frontend origins permitted to POST. Defaults to `https://linuxius-blip.github.io,http://localhost:8000,http://localhost:5173`.
5. **Settings → Networking → Generate Domain**. Railway gives you a public URL like `https://oi-evaluation-production-XXXX.up.railway.app`.

Paste that URL (no trailing slash) into the `DATA_ENDPOINT` constant near the top of `oi-evaluation.html`, append `/responses`, commit, push.

## Endpoints

- `GET /` — service info
- `GET /health` — health probe
- `POST /responses` — accepts the JSON the widget sends (CORS-restricted to allowed origins)
- `GET /responses` — all rows, JSON. Requires `X-Export-Token` header.
- `GET /responses.csv` — all rows, CSV download. Requires `X-Export-Token` header.
- `GET /stats` — quick aggregates (overall and by industry). Requires `X-Export-Token` header.

## Pulling the data

```bash
# JSON
curl -H "X-Export-Token: $EXPORT_TOKEN" https://YOUR-RAILWAY-URL/responses

# CSV
curl -H "X-Export-Token: $EXPORT_TOKEN" https://YOUR-RAILWAY-URL/responses.csv -o oi-responses.csv

# Quick aggregate stats
curl -H "X-Export-Token: $EXPORT_TOKEN" https://YOUR-RAILWAY-URL/stats
```

You can also paste `https://YOUR-RAILWAY-URL/responses.csv?token=YOUR_TOKEN` into a browser — but URL-token leaves the token in browser history, so prefer the header form for routine use.

## Local development

```bash
cd backend
npm install
DATABASE_URL=postgres://... EXPORT_TOKEN=devtoken node server.js
```
