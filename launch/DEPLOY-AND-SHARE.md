# PayFairEU — $0 Deployment & Ethical Launch Guide

> **Mandatory Legal Disclaimer:** `PayFairEU` is a statistical and HR readiness pre-flight tool aligned with **Directive (EU) 2023/970**. It does **NOT** constitute labour law counsel, certified payroll auditing, or an official filing with national equality bodies. Zero employee payroll PII leaves the browser in static `$0` mode.

## 1. Zero-Budget Static Hosting (`Cloudflare Workers Static Assets — $0`)
Because `src/core/` shares identical browser + Node 22 TypeScript logic, the compiled static bundle runs completely offline inside your browser via `window.localStorage`:

```bash
npm ci
npm run build
npx wrangler login
npx wrangler deploy
```

Pre-configured in `wrangler.jsonc` (`assets.directory = "./dist"`, SPA fallback routing enabled).

## 2. Self-Hosted Server (`Node 22 + node:sqlite WAL`)
When multi-dossier persistence, atomic `PAYF-YYYY-0001` counters, saved employer profiles, public read-only links (`/r/:slugOrCode`), or server-side Markdown/HTML/BOM CSV downloads are desired:

### Option A: Docker Compose
```bash
docker compose up -d --build
```
Maps `127.0.0.1:4211:4211` backed by persistent volume `payfaireu_data`.

### Option B: Bare Metal Node 22 + systemd + Caddy
1. Copy `deploy/.env.example` -> `.env` and configure `PORT=4211` and `PAYFAIREU_DATA_DIR`.
2. Start with `node --no-warnings server/index.mjs` and schedule `deploy/backup-sqlite.sh` daily (`VACUUM INTO`, 14-day retention).
3. Terminate TLS via `deploy/Caddyfile`.

## 3. Ethical Compliance & HR Community Distribution (`$0`, No Spam)
- **Audience**: EU People Operations & Total Rewards leads preparing compensation bands before **`2026-06-07`**, European SMEs (`100–249` / `250+` staff) testing `FTE`-normalized quartile and category gaps without uploading employee PII to external cloud SaaS, and recruiters verifying Article 5 pay-range & salary-history compliance.
- **Value-First Topics**:
  - How the **Article 10** `>= 5%` Joint Pay Assessment trigger evaluates all three cumulative prongs together (`|gap| >= 5%` + no objective gender-neutral justification + unremedied within `6` months).
  - Why normalizing base and variable compensation to `1.0 FTE` (`fteRatio`) prevents skewed part-time distortion across quartiles `Q1–Q4`.
  - Protecting individual identity in small teams (`< 3` workers per sex cohort) during **Article 7** individual pay-info responses (`<= 2 months` calendar SLA).
