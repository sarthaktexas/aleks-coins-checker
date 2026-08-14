# ALEKS Points Portal

Web app for tracking ALEKS daily progress and running a coin-based reward system (student portal + multi-user admin).

## Quick Start

```bash
git clone <repository-url>
cd aleks-coins-checker
npm install
npm run dev
```

Requires Node 18+ (see `.nvmrc`).

### Environment Variables

Minimum for local admin login (with Postgres):

```bash
ADMIN_PASSWORD="your-secure-bootstrap-pin"
ADMIN_SESSION_SECRET="generate-a-long-random-string"
POSTGRES_URL="postgres://..."
```

Without Postgres, the student portal still runs on demo data; staff accounts need a database.

Full variable list (Resend, ALEKS sync tokens, GitHub PAT, etc.): see [`ENVIRONMENT_SETUP.md`](./ENVIRONMENT_SETUP.md).

## What’s Included

### Student portal
- Look up progress by student ID across exam periods
- Daily calendar, coin totals, and redemptions (assignment / quiz replacements)
- Override requests (reviewed topics or manual)
- Optional PII anonymization when enabled in admin settings
- Leaderboard and analytics views

### Admin
- **Staff accounts**: username + PIN, roles (`professor` | `ta`), session cookies
- **Profile**: self-service display name and PIN changes
- **Upload**: manual Excel upload, or automated ALEKS sync (auto/manual modes)
- **Periods**: exam periods organized by semester, with dialog editing
- **Requests**: approve/reject redemptions and overrides; coin adjustments finalize on approve
- **Overrides / coins**: condensed lists; day overrides and coin adjustments
- **Extras**: leaderboard, email students, bug reports (Resend), settings (incl. PII hide)

Timestamps show in the viewer’s local timezone with a zone label.

## ALEKS Automated Sync

GitHub Actions download ALEKS **Time and Topic** Excel reports and import them nightly. A second job verifies **reviewed-topics** overrides on each student’s Timeline (reviews are not in the Excel export).

| Workflow | Schedule | Purpose |
|---|---|---|
| `ALEKS daily sync` | ~7 AM Central | Playwright → Excel → `/api/admin/aleks-sync/import` |
| `ALEKS review overrides` | ~1 hour later | Auto-approve reviewed-topics when minutes ≥ 31 and topics ≥ 1 |

Admins can also trigger Excel sync from **Admin → Upload → Pull from ALEKS now** (needs `GITHUB_SYNC_PAT`).

**Setup summary**

1. Generate a shared token: `openssl rand -hex 32`
2. Set `IMPORT_API_TOKEN` on Vercel and as a GitHub Actions secret
3. Add GitHub secrets: `ALEKS_USERNAME`, `ALEKS_PASSWORD`, `APP_URL`, `IMPORT_API_TOKEN`
4. Optional: `GITHUB_SYNC_PAT` + `GITHUB_REPO` for the admin pull button

Details, local Playwright testing, and troubleshooting: [`scripts/aleks-sync/README.md`](./scripts/aleks-sync/README.md).

## Architecture

| Layer | Stack |
|---|---|
| App | Next.js 14 (App Router), TypeScript, Tailwind, Radix UI |
| Data | PostgreSQL (Neon recommended; Vercel Postgres is deprecated) |
| Charts / Excel | D3.js, SheetJS (`xlsx`) |
| Automation | Playwright + GitHub Actions |

### Project layout

```
app/
├── page.tsx                 # Student portal
├── analytics/               # Class analytics
├── admin/                   # Dashboard, upload, requests, periods, staff, …
└── api/
    ├── student/             # Lookup, requests, leaderboard
    ├── admin/               # Auth, upload, periods, ALEKS sync, …
    ├── analytics/
    └── bug-report/

components/                  # Calendar, redemption modal, charts, UI
lib/                         # Auth, Excel helpers, periods, caching
scripts/aleks-sync/          # Playwright sync + review verification
.github/workflows/           # Nightly ALEKS jobs
```

## Database (overview)

Tables are created with `CREATE TABLE IF NOT EXISTS` on use. Core ones:

| Table | Role |
|---|---|
| `student_data` | Uploaded/synced Excel payloads (JSONB) per period/section |
| `student_requests` | Redemptions + override requests |
| `admin_users` | Staff accounts (hashed PIN, role) |
| `coin_adjustments` | Manual / redemption-linked adjustments (`is_active` soft-delete) |
| `student_day_overrides` | Per-student day force qualify/disqualify |
| `exam_periods` | Period keys, date ranges, excluded dates |

See older schema snippets in git history if you need full DDL; runtime migrations live next to the API routes that need them.

## Coin calculation (summary)

Per period:

1. Base coins = qualified working days (minutes ≥ 31 and topics ≥ 1)
2. Plus exempt-day credits when an excluded day would have qualified (also counts toward extra credit %)
3. Plus coins-only exempt credits when a coins-only exempt day would have qualified (coin only — does **not** count toward extra credit %)
4. Plus/minus active `coin_adjustments` for that period

Total coins = sum across periods. Approved day overrides rewrite qualification before totals.

## Auth & security

- Staff sign in with **username + PIN**. Sessions are **httpOnly** cookies signed with `ADMIN_SESSION_SECRET`.
- First professor account is bootstrapped from `ADMIN_PASSWORD` (username `admin`) when `admin_users` is empty.
- Professors manage TAs under **Admin → Staff**.
- Students look up by ID only (no login); enable PII hide in settings for demos/screenshares.
- ALEKS import endpoints require `IMPORT_API_TOKEN` — not an ALEKS credential.

## Deployment

Deploy on Vercel (this repo is linked as project `student-points-website`).

```bash
# Required on Vercel
vercel env add ADMIN_PASSWORD
vercel env add ADMIN_SESSION_SECRET
vercel env add POSTGRES_URL

# For ALEKS sync
vercel env add IMPORT_API_TOKEN
# optional: GITHUB_SYNC_PAT, GITHUB_REPO, APP_URL, RESEND_API_KEY, …
```

Prefer Neon for Postgres ([setup notes](./ENVIRONMENT_SETUP.md)).

### GitHub Environments / Deployments

Vercel posts deployment records to GitHub Environments. Stale environments from old project links can be removed in **Settings → Environments**, or via API:

```bash
gh api -X DELETE "repos/OWNER/REPO/environments/ENVIRONMENT_NAME"
```

Deleting an environment removes its deployment history there. Active Vercel production usually appears as `Production – <vercel-project-name>`.

## Docs

| Doc | Contents |
|---|---|
| [`ENVIRONMENT_SETUP.md`](./ENVIRONMENT_SETUP.md) | Env vars, Neon, troubleshooting login |
| [`scripts/aleks-sync/README.md`](./scripts/aleks-sync/README.md) | Playwright sync, review verification, secrets |

## License

Private and proprietary. All rights reserved.
