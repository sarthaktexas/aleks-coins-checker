# Database Fix Scripts

This directory contains scripts to fix data inconsistencies in the database.

## fix-missing-overrides.js

This script fixes a bug where approved override requests weren't creating corresponding entries in the `student_day_overrides` table.

### What it does:

1. **Finds missing overrides**: Searches for approved override requests that don't have corresponding entries in the `student_day_overrides` table
2. **Creates missing overrides**: Generates the missing override entries with the correct data
3. **Reports results**: Shows what was fixed and any errors that occurred

### How to run:

```bash
# Using pnpm script (recommended)
pnpm run fix-overrides

# Or directly with node
node scripts/fix-missing-overrides.js
```

### Web Interface:

You can also run the fix script directly from the admin interface:
1. Go to the Admin Requests page (`/admin/requests`)
2. Click the "Fix Missing Overrides" button in the header
3. The script will run and show you the results

### What the script will show:

- List of approved override requests without overrides
- Progress as it creates each override
- Summary of successful and failed operations
- Details of what was created

### Safety features:

- **Read-only first**: The script first shows what it will do before making changes
- **Conflict handling**: Uses `ON CONFLICT` to handle duplicate entries gracefully
- **Error handling**: Continues processing even if individual overrides fail
- **Detailed logging**: Shows exactly what was created or failed

### Example output:

```
🔍 Finding approved override requests without corresponding overrides...
Found 3 approved override requests without overrides:

1. Request ID: 123
   Student: John Doe (john.doe@school.edu)
   Day: 15
   Date: 2024-01-15
   Details: Technical issues with internet connection
   Admin Notes: Approved due to documented technical issues
   Processed: 2024-01-16 10:30:00

🔧 Creating 3 missing overrides...

Creating override for John Doe - Day 15...
✅ Created override ID: 456

📊 SUMMARY:
==================================================
✅ Successfully created: 3 overrides
❌ Failed to create: 0 overrides

✅ Successfully created overrides:
   - John Doe (john.doe@school.edu) - Day 15 - Override ID: 456
   - Jane Smith (jane.smith@school.edu) - Day 12 - Override ID: 457
   - Bob Johnson (bob.johnson@school.edu) - Day 8 - Override ID: 458

🎉 Override fix script completed!
```

### When to run this script:

- After deploying the fix for the override creation bug
- If you notice that approved override requests aren't showing up in the calendar
- As part of regular database maintenance

### Prerequisites:

- Database connection must be configured (POSTGRES_URL or DATABASE_URL)
- The script uses the same database connection as your Next.js app
