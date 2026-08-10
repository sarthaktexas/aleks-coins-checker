# Environment Variables Setup

## Required Environment Variables

Create a `.env.local` file in your project root with the following variables:

```bash
# Database Configuration
POSTGRES_URL="postgres://username:password@host:port/database"
# OR
DATABASE_URL="postgres://username:password@host:port/database"

# Admin Authentication (multi-user PIN + session cookies)
# Used once to bootstrap the first professor account (username: admin) if admin_users is empty
ADMIN_PASSWORD="your-secure-bootstrap-pin-here"
# Long random string used to sign httpOnly session cookies (required in production)
ADMIN_SESSION_SECRET="generate-a-long-random-string"

# Optional bootstrap overrides
# ADMIN_BOOTSTRAP_USERNAME="admin"
# ADMIN_BOOTSTRAP_NAME="Admin"
# ADMIN_BOOTSTRAP_PIN="override-pin-if-different-from-ADMIN_PASSWORD"

# Application Environment
NODE_ENV="development"
```

## Quick Setup for Development

1. **Create `.env.local` file:**
   ```bash
   touch .env.local
   ```

2. **Add the minimum required variables:**
   ```bash
   ADMIN_PASSWORD="admin123"
   ADMIN_SESSION_SECRET="dev-session-secret-change-me"
   NODE_ENV="development"
   
   # Add your database URL when you have one
   # POSTGRES_URL="your-database-url-here"
   ```

3. **Test the admin login:**
   - Go to `/admin/dashboard`
   - Sign in with username `admin` and PIN = your `ADMIN_PASSWORD` (or `ADMIN_BOOTSTRAP_PIN`)
   - Professors can add TAs under **Staff**

## Environment Variables Explained

### Required Variables

- **`ADMIN_PASSWORD`**: Bootstrap PIN for the first professor account when `admin_users` is empty (legacy name kept for compatibility)
- **`ADMIN_SESSION_SECRET`**: Signs httpOnly admin session cookies. Prefer a dedicated secret so rotating bootstrap/password env vars does not invalidate sessions
- **`POSTGRES_URL`** or **`DATABASE_URL`**: Database connection string

### Optional Variables

- **`ADMIN_BOOTSTRAP_USERNAME`**: Username for the first account (default `admin`)
- **`ADMIN_BOOTSTRAP_NAME`**: Display name for the first account (default `Admin`)
- **`ADMIN_BOOTSTRAP_PIN`**: PIN for the first account (defaults to `ADMIN_PASSWORD`)
- **`NODE_ENV`**: Set to "development" for local development
- **`BUG_REPORT_EMAIL`**: Defaults to `sarthaktexas@gmail.com` if unset
- **`RESEND_API_KEY`**: Required for email notifications — free at [resend.com](https://resend.com). Without it, bug reports still save to Admin → Bugs
- **`BUG_REPORT_FROM_EMAIL`**: Optional From address (defaults to `onboarding@resend.dev`). With Resend's free onboarding domain you can only send **to** the email on your Resend account (verify `sarthaktexas@gmail.com` there, or add a custom domain)
- **`IMPORT_API_TOKEN`**: A random secret **you generate** (e.g. `openssl rand -hex 32`). Not an ALEKS credential. Same value goes in Vercel and the GitHub `IMPORT_API_TOKEN` secret so Actions can POST reports to `/api/admin/aleks-sync/import`. See `scripts/aleks-sync/README.md`
- **`GITHUB_SYNC_PAT`** (optional): GitHub PAT with Actions write access so Admin → “Pull from ALEKS now” can dispatch the workflow. Pair with `GITHUB_REPO=owner/repo` if not on Vercel git metadata.
- **`GITHUB_REPO`** (optional): `owner/repo` for the sync trigger button
- **`APP_URL`** (optional on Vercel): Production URL used by docs/local tooling; GitHub Actions reads `APP_URL` from repo secrets

GitHub Actions also needs secrets `ALEKS_USERNAME` and `ALEKS_PASSWORD`. Exam period and class list are discovered automatically (DB + ALEKS Class menu).

## Database Setup

If you don't have a database yet, the application will still work but:
- Student data uploads will fail
- Student lookups will show demo data only
- Staff accounts cannot be created (admin auth needs Postgres)

### Postgres (Recommended: Neon free tier)

Vercel Postgres is deprecated. For a free always-on database that fits this app's size:

1. Create a free project at [neon.tech](https://neon.tech) (or use an existing Neon DB already linked in Vercel)
2. Copy the connection string to `POSTGRES_URL`
3. In Vercel → Project → Settings → Environment Variables, set the same value for Production

This app's data footprint is small (course-scale JSON uploads), so Neon's free tier is typically enough. No need for a paid DB plan.

### Local Development Without Database

Student demo mode still works, but admin login requires a database for `admin_users`.

## Security Notes

- Never commit `.env.local` to version control
- Use different secrets for development and production
- Keep database credentials secure
- Admin sessions are httpOnly cookies (PIN is not stored in `localStorage`)
- Manage staff PINs from Admin → Staff (professors only)
- Set `ADMIN_SESSION_SECRET` in Vercel for Production/Preview

## Troubleshooting

### Can't login to admin dashboard?
- First account is username `admin` with PIN = `ADMIN_PASSWORD` (until you create others)
- Ensure Postgres is configured — staff accounts live in the `admin_users` table
- Check `ADMIN_SESSION_SECRET` is set (falls back to `ADMIN_PASSWORD` if missing)
- Make sure you're using `.env.local` (not `.env`)

### Database connection issues?
- Verify your `POSTGRES_URL` or `DATABASE_URL` is correct
- Check that your database is accessible
- The app will show demo data if no database is configured
