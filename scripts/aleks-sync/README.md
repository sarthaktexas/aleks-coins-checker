# ALEKS daily sync (GitHub Actions)

Automates downloading **Time and Topic** Excel reports from ALEKS and importing them into this app.

## What is `IMPORT_API_TOKEN`?

It is **not** from ALEKS. You invent it — a long random password that proves the GitHub Action is allowed to write into your app.

```bash
openssl rand -hex 32
```

Put the **same value** in:

1. **Vercel** env → `IMPORT_API_TOKEN`
2. **GitHub** secret → `IMPORT_API_TOKEN`

Without it, `/api/admin/aleks-sync/*` returns 401/503.

## How it works

1. GitHub Actions runs daily (or via Admin → **Pull from ALEKS now** / Actions → Run workflow)
2. App config API picks the **active exam period** whose date range includes today (Central); if none, the most recent period that already ended
3. Playwright logs into ALEKS and scrapes the **Class** dropdown (active + archived)
4. For each class: Reports → Time and Topic → date range (period start → today, or period end if earlier) → download `.xlsx`
5. Each file is `POST`ed to `/api/admin/aleks-sync/import`

Section numbers are derived from the ALEKS class name (e.g. “Section 003” → `003`), preferring values that already exist for that period in the DB.

Manual admin upload still works as a fallback.

## One-time setup

### 1. App env (Vercel)

```bash
IMPORT_API_TOKEN="…"          # shared with GitHub
GITHUB_SYNC_PAT="…"           # optional; enables Admin pull button
GITHUB_REPO="owner/repo"      # optional if Vercel git metadata exists
APP_URL="https://aleks-coins.vercel.app"
```

### 2. GitHub repository secrets

| Secret | Value |
|---|---|
| `ALEKS_USERNAME` | ALEKS login name |
| `ALEKS_PASSWORD` | ALEKS password |
| `APP_URL` | Production URL |
| `IMPORT_API_TOKEN` | Same as Vercel |

### 3. Deploy + run

Deploy so `/api/admin/aleks-sync/config` is live, then:

**Actions → ALEKS daily sync → Run workflow**  
or Admin → **Pull from ALEKS now**

On failure, download the `aleks-sync-debug` artifact (screenshots).

## Local test

```bash
cd scripts/aleks-sync
npm install
npx playwright install chromium

export ALEKS_USERNAME=...
export ALEKS_PASSWORD=...
export APP_URL=http://localhost:3000
export IMPORT_API_TOKEN=...

HEADED=1 DRY_RUN=1 npm run sync
```
