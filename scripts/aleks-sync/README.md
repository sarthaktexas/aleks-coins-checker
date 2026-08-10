# ALEKS daily sync (GitHub Actions)

Automates downloading **Time and Topic** Excel reports from ALEKS and importing them into this app.

## What is `IMPORT_API_TOKEN`?

It is **not** from ALEKS. You invent it — a long random password that proves the GitHub Action is allowed to write into your app.

```bash
# generate one
openssl rand -hex 32
```

Put the **same value** in:

1. **Vercel** env → `IMPORT_API_TOKEN`
2. **GitHub** secret → `IMPORT_API_TOKEN`

Without it, `/api/admin/aleks-sync/*` returns 401/503.

## How it works

1. GitHub Actions runs daily (or via **Run workflow**)
2. Playwright logs into ALEKS, opens each configured class, downloads Time and Topic `.xlsx`
3. Date range = exam period start → today (Central), capped at period end  
   - If today is **after** the period end → sync is skipped
4. Each file is `POST`ed to `/api/admin/aleks-sync/import`

Manual admin upload still works as a fallback.

## One-time setup

### 1. App env (Vercel)

Add:

```bash
IMPORT_API_TOKEN="generate-a-long-random-string"
```

Redeploy after adding it.

### 2. GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions** → New repository secret:

| Secret | Value |
|---|---|
| `ALEKS_USERNAME` | ALEKS login name |
| `ALEKS_PASSWORD` | ALEKS password |
| `APP_URL` | Production URL, e.g. `https://your-app.vercel.app` |
| `IMPORT_API_TOKEN` | Same value as Vercel `IMPORT_API_TOKEN` |
| `EXAM_PERIOD` | Period key from Admin → Manage Periods, e.g. `fall2025` |
| `ALEKS_CLASSES` | JSON array (see below) |

#### `ALEKS_CLASSES` example

```json
[
  {"aleksName": "Exact class name in ALEKS dropdown", "sectionNumber": "001", "archived": false},
  {"aleksName": "Another class", "sectionNumber": "002", "archived": true}
]
```

- `aleksName` must match (or uniquely contain) the label in the ALEKS Class dropdown
- `sectionNumber` is your portal section (same as manual upload)
- `archived: true` opens the Archived list first (useful while classes are archived)

### 3. Enable the workflow

Push to `main` (or merge this branch). Then:

**Actions → ALEKS daily sync → Run workflow**

On failure, download the `aleks-sync-debug` artifact (screenshots + any partial downloads) to see where the UI selector broke.

## Local test

```bash
cd scripts/aleks-sync
npm install
npx playwright install chromium

export ALEKS_USERNAME=...
export ALEKS_PASSWORD=...
export APP_URL=http://localhost:3000
export IMPORT_API_TOKEN=...
export EXAM_PERIOD=fall2025
export ALEKS_CLASSES='[{"aleksName":"My Class","sectionNumber":"001","archived":true}]'

# Optional: watch the browser / skip posting
HEADED=1 DRY_RUN=1 npm run sync
```

## Updating period / classes

When a new exam period starts, update the `EXAM_PERIOD` secret.  
When class names or sections change, update `ALEKS_CLASSES`. No code change required.
