# Environment Variables Setup

## Required Environment Variables

Create a `.env.local` file in your project root with the following variables:

```bash
# Database Configuration
POSTGRES_URL="postgres://username:password@host:port/database"
# OR
DATABASE_URL="postgres://username:password@host:port/database"

# Admin Authentication
ADMIN_PASSWORD="your-secure-admin-password-here"

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
   # For development, you can use this default
   ADMIN_PASSWORD="admin123"
   NODE_ENV="development"
   
   # Add your database URL when you have one
   # POSTGRES_URL="your-database-url-here"
   ```

3. **Test the admin login:**
   - Go to `/admin/dashboard`
   - Use the password you set for `ADMIN_PASSWORD`

## Environment Variables Explained

### Required Variables

- **`ADMIN_PASSWORD`**: Server-side password for all admin operations (dashboard login, upload, periods management)
- **`POSTGRES_URL`** or **`DATABASE_URL`**: Database connection string

### Optional Variables

- **`NODE_ENV`**: Set to "development" for local development

## Database Setup

If you don't have a database yet, the application will still work but:
- Student data uploads will fail
- Student lookups will show demo data only

### Vercel Postgres (Recommended)

1. Go to your Vercel dashboard
2. Navigate to Storage → Postgres
3. Create a new database
4. Copy the connection string to `POSTGRES_URL`

### Local Development Without Database

The app will work with demo data. Just set:
```bash
ADMIN_PASSWORD="admin123"
NODE_ENV="development"
```

## Security Notes

- Never commit `.env.local` to version control
- Use different passwords for development and production
- Keep database credentials secure
- All environment variables are server-side only (no public variables)

## Troubleshooting

### Can't login to admin dashboard?
- Check that `ADMIN_PASSWORD` is set correctly in your `.env.local` file
- Make sure you're using `.env.local` (not `.env`)
- The password is now securely validated server-side

### Database connection issues?
- Verify your `POSTGRES_URL` or `DATABASE_URL` is correct
- Check that your database is accessible
- The app will show demo data if no database is configured
