# Badge System Documentation

## Overview

The badge system rewards students for maintaining consistent streaks of completing their daily ALEKS requirements. It includes four badges with different rewards:

1. **10-Day Streak Badge** - Awards 10 bonus coins (one-time per exam period, up to 3)
2. **25-Day Streak Badge** - Grants a permanent 2x multiplier on ALL future daily coins
3. **Holiday Badges** - Separate designs per break (Thanksgiving turkey, Winter tree, July 4 fireworks, Spring flower); each holiday day pays 5 coins total (not 6)
4. **Grand Master Badge** - Unlocks at 100+ coins across an entire semester (wizard with staff)

## Features

### Badge Types

#### 10-Day Streak Badge 🔥
- **Requirement**: Complete ALEKS 10 days in a row
- **Reward**: 10 bonus coins added to the student's account
- **Type**: One-time reward
- **Display**: Shows on badge shelf and leaderboard

#### 25-Day Streak Badge ⭐
- **Requirement**: Complete ALEKS 25 days in a row
- **Reward**: Permanent 2x multiplier on daily coins from the unlock day forward
- **Type**: Permanent benefit
- **Important**: The multiplier remains active even if the streak breaks. Days before the unlock date stay at 1x — it is not retroactive.
- **Display**: Shows on badge shelf, leaderboard, and coin display

#### Holiday Badges 🦃🎄🎆🌸
- **Requirement**: Qualify on a holiday special day tagged with that break type
- **Designs**: Thanksgiving (turkey), Winter Break (tree), July 4th (fireworks), Spring Break (flower)
- **Reward**: 5 coins total for each holiday day completed (not 1 + 5 = 6)
- **Type**: One permanent unlock per design; coins are paid per holiday day via daily coin math
- **Important**: Holiday days are optional — skipping never hurts progress or streaks
- **Visibility**: Admins see every design; students only see designs they have unlocked
- **Display**: Earned holiday shields stack on the student shelf; holiday coin chip on the student page

#### Grand Master Badge 🧙
- **Requirement**: Earn 100+ coins across all exam periods in a single semester
- **Coin total**: Same as the student-facing semester total — daily coins after day overrides, with 2x only on days on/after the 25-day unlock date, plus period-specific coin adjustments (not redemptions)
- **Reward**: Wizard-with-staff badge (no extra coins)
- **Type**: Permanent unlock (once ever)
- **Display**: Shows on badge shelf with semester coin progress; unlocks when the threshold is met even if badge processing has not run yet

### Streak Calculation

Streaks are calculated based on consecutive qualifying days in the daily log:
- **Qualifying Day**: A day where the student met the ALEKS requirements (31+ minutes and 1+ topic), **or** a day overridden as `qualified` / `double_coins`
- **Excluded Days**: Don't count toward or against streaks (holidays, exempt days)
- **Missed Days**: Break the streak and reset the counter (including days overridden as `not_qualified`)
- **Day Overrides**: Always included in 10-day and 25-day badge streak math (same as coins/calendar)

The system tracks:
- **Current Streak**: Consecutive qualifying days from the most recent day backward
- **Max Streak**: The longest streak achieved in the current period

### Coin Multiplier

The 25-day badge grants a permanent 2x multiplier that:
- Applies only to daily coins earned on/after the day the streak hit 25
- Earlier days in the semester stay at 1x
- Covers qualified days, exempt credits, double-coin days, and holiday coins from that date forward
- Is calculated BEFORE adjustments (coin adjustments are added after, never doubled)
- Persists across all future periods
- Cannot be removed or lost
- Is checked globally (once earned in any period, it applies to later days everywhere)

**Example Calculation**:
```
Days before unlock: 80 base coins → stay 80
Days on/after unlock: 10 base coins → 20 with 2x
Plus adjustments: 80 + 20 + 10 = 110 total coins
```

## Database Schema

### `student_badges` Table

```sql
CREATE TABLE student_badges (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(255) NOT NULL,
  badge_type VARCHAR(50) NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  streak_count INTEGER NOT NULL,
  period VARCHAR(100) NOT NULL,
  section_number VARCHAR(50) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(student_id, badge_type, period, section_number)
)
```

### Indexes

```sql
CREATE INDEX idx_student_badges_student_id ON student_badges(student_id);
CREATE INDEX idx_student_badges_badge_type ON student_badges(badge_type);
```

## API Endpoints

### Get Student Badges
```
GET /api/badges?studentId={studentId}
```

Returns all badges earned by a student across all periods.

### Process Badges (Admin Only)
```
POST /api/badges/process
Body: { studentId?, period?, sectionNumber? }
```

Processes badges for:
- A specific student (if studentId, period, sectionNumber provided)
- All students across all periods (if no parameters)

Returns:
```json
{
  "success": true,
  "processedCount": 150,
  "badgesAwarded": 25,
  "coinsAwarded": 120
}
```

## UI Components

### Badge Shelf (`components/badge-shelf.tsx`)

Displays all available badges with:
- Lock icon for unearned badges (greyed out)
- Progress bars showing streak progress
- Current streak and max streak display
- Active multiplier indicator for 25-day badge
- Visual distinction between earned and unearned badges

### Student Dashboard Integration

The badge shelf appears on the main student page:
- Shows right after the student header
- Displays current and max streak
- Shows progress toward each badge
- Highlights active 2x multiplier

### Leaderboard Integration

Badges appear in the leaderboard:
- 2x multiplier badge is shown next to coin counts
- Badge data is included in leaderboard rankings
- Coin calculations reflect multiplier bonuses

## Admin Features

### Badge Management Page (`/admin/badges`)

Admin interface for badge processing:
- View badge system information
- Process badges retroactively for all students
- See statistics on badge awards
- One-click batch processing
- Safe to run multiple times (prevents duplicates)

### Retroactive Processing

The badge processor:
1. Scans all student data across all periods
2. Calculates streak data from daily logs
3. Awards badges to qualifying students
4. Does not add coins. The +10 bonus is paid once per exam period, up to 3 periods, and only by the daily pull when the current streak is exactly 10
5. Enables multipliers for 25-day badges
6. Handles duplicates gracefully (no double-awards)

## Implementation Details

### Core Functions (`lib/badges.ts`)

#### `calculateStreaks(dailyLog)`
Analyzes a daily log and returns:
```typescript
{
  currentStreak: number,
  maxStreak: number,
  maxStreakEndIndex: number
}
```

#### `processBadgesForStudent(studentId, ...)`
Main processing function that:
- Applies day overrides onto the daily log before streak math
- Calculates streaks from the override-aware daily log
- Checks for badge eligibility
- Awards badges if not already earned
- Creates a +10 coin adjustment only when `awardCoins` is allowed and the current streak is exactly 10
- Returns list of badges earned and coins awarded

#### `reprocessBadgesForStudent(studentId, ...)`
Re-runs badge processing for every period/section a student appears in.
Called automatically after day overrides are saved or override requests are approved so newly qualified days can unlock badges.

#### `hasStreakMultiplier(studentId)`
Checks if a student has the 25-day badge across ALL periods.
Used to apply the 2x multiplier globally.

### Integration Points

1. **Student API** (`/api/student/route.ts`)
   - Loads badge data for each student
   - Applies 2x multiplier to coins
   - Returns streak data and badges

2. **Leaderboard API** (`/api/student/leaderboard/route.ts`)
   - Applies multipliers when calculating rankings
   - Includes badge data for display

3. **Admin Leaderboard** (`/api/admin/leaderboard/route.ts`)
   - Shows badges in admin view
   - Applies multipliers in calculations

## Testing

### Manual Testing Steps

1. **Test Badge Schema Creation**
   - Visit any page that loads badges
   - Verify `student_badges` table is created

2. **Test Badge Processing**
   - Go to `/admin/badges`
   - Click "Process All Badges"
   - Verify badges are awarded based on streaks

3. **Test 10-Day Badge**
   - Find a student with 10+ day streak
   - Process badges
   - Verify 10 coins added via coin_adjustments
   - Check badge appears on student page

4. **Test 25-Day Badge**
   - Find a student with 25+ day streak
   - Process badges
   - Verify coins are doubled (check baseCoins vs coins)
   - Verify 2x indicator appears
   - Check multiplier persists across periods

5. **Test Badge Shelf UI**
   - View student page with badges
   - Verify progress bars show correctly
   - Check locked badges are greyed out
   - Verify earned badges show "Earned" status

## Maintenance

### Running Badge Processing

Badges should be processed:
- After each ALEKS data upload
- When setting up the system for the first time (retroactive)
- If streak calculations are updated
- Safe to run anytime (idempotent)

### Monitoring

Key metrics to monitor:
- Number of students with each badge type
- Total bonus coins awarded
- Students with active multipliers
- Badge processing errors

### Common Issues

**Issue**: Badges not appearing
- Solution: Run badge processing via `/admin/badges`

**Issue**: Multiplier not applying
- Solution: Verify student has 25-day badge in database
- Check `hasStreakMultiplier()` query results

**Issue**: Duplicate coins awarded
- Solution: System prevents duplicates via UNIQUE constraint
- Safe to rerun processing

## Future Enhancements

Potential additions:
- More badge types (50-day, 100-day, etc.)
- Special event badges
- Team/class-wide achievements
- Badge leaderboard
- Badge notification system
- Custom badge icons/designs
