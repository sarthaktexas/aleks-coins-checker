# ALEKS Points Portal

A web application for tracking student progress in ALEKS and managing a coin-based reward system.

## 🚀 Quick Start

### Installation

   ```bash
   git clone <repository-url>
cd aleks-coins-checker
   npm install
   npm run dev
```

### Environment Variables

```bash
# Required
ADMIN_PASSWORD="your-secure-bootstrap-pin"
ADMIN_SESSION_SECRET="generate-a-long-random-string"

# Optional (app works with demo data if not provided)
POSTGRES_URL="postgres://..."
NODE_ENV="development"
```

## 🏗️ Architecture

### Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **Database**: PostgreSQL (Vercel Postgres)
- **Charts**: D3.js
- **Excel Processing**: XLSX library
- **Icons**: Lucide React

### Project Structure

```
app/
├── page.tsx                    # Student portal
├── api/
│   ├── student/
│   │   ├── route.ts           # Student data lookup
│   │   └── requests/route.ts  # Student request submission
│   ├── admin/
│   │   ├── auth/route.ts      # Admin authentication
│   │   ├── upload/route.ts    # Excel file upload
│   │   ├── requests/route.ts  # Admin request management
│   │   └── coin-adjustments/route.ts  # Manual coin adjustments
│   └── analytics/route.ts     # Class analytics
└── admin/
    ├── dashboard/page.tsx     # Main admin interface
    ├── requests/page.tsx      # Request management UI
    ├── coin-adjustments/page.tsx  # Adjustment management UI
    └── view-data/page.tsx     # Data viewing interface

components/
├── redemption-modal.tsx       # Coin redemption interface
├── calendar-view.tsx          # Daily progress calendar
└── completion-chart.tsx       # Analytics visualizations

lib/
├── exam-periods.ts            # Period configuration
└── utils.ts                   # Utility functions
```

## 🗄️ Database Schema

### Core Tables

```sql
-- Student progress data (uploaded from Excel)
CREATE TABLE student_data (
  id SERIAL PRIMARY KEY,
  data JSONB,
  period VARCHAR(100),
  section_number VARCHAR(20),
  uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Student requests (redemptions + overrides)
CREATE TABLE student_requests (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(100),
  student_name VARCHAR(255),
  student_email VARCHAR(255),
  period VARCHAR(100),
  section_number VARCHAR(20),
  request_type VARCHAR(50),  -- assignment_replacement, quiz_replacement, override_request
  request_details TEXT,
  day_number INTEGER,  -- For override requests
  override_date VARCHAR(10),  -- For override requests
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  admin_notes TEXT,
  processed_at TIMESTAMPTZ,
  processed_by VARCHAR(255)
);

-- Staff accounts (username + hashed PIN)
CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  pin_salt VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'ta',  -- ta | professor
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Manual coin adjustments
CREATE TABLE coin_adjustments (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(100),
  student_name VARCHAR(255),
  period VARCHAR(100),
  section_number VARCHAR(20),
  adjustment_amount INTEGER,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  request_id INTEGER REFERENCES student_requests(id) ON DELETE SET NULL  -- Links to redemption request (nullable)
);

-- Per-student day overrides
CREATE TABLE student_day_overrides (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(100),
  day_number INTEGER,
  override_type VARCHAR(50),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Exam period configurations
CREATE TABLE exam_periods (
  id SERIAL PRIMARY KEY,
  period_key VARCHAR(100) UNIQUE,
  period_name VARCHAR(255),
  start_date DATE,
  end_date DATE,
  excluded_dates JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
CREATE INDEX idx_student_requests_student_id ON student_requests(student_id);
CREATE INDEX idx_student_requests_section ON student_requests(section_number, student_name);
CREATE INDEX idx_student_requests_type ON student_requests(request_type);
CREATE INDEX idx_coin_adjustments_student_id ON coin_adjustments(student_id);
CREATE INDEX idx_coin_adjustments_period ON coin_adjustments(period, section_number);
```

## 📡 API Endpoints

### Student Endpoints

```typescript
// Get student data with all periods and adjustments
POST /api/student
Body: { studentId: string }
Returns: {
  success: boolean
  student: StudentInfo
  periods: PeriodInfo[]
  coinAdjustments: CoinAdjustment[]
  totalCoinsAcrossPeriods: number
}

// Submit request (redemption or override)
POST /api/student/requests
Body: {
  studentId: string
  studentName: string
  studentEmail: string
  period: string
  sectionNumber: string
  requestType: 'assignment_replacement' | 'quiz_replacement' | 'override_request'
  requestDetails: string
  dayNumber?: number  // Required for override_request
  overrideDate?: string  // Required for override_request
}
Returns: { success: boolean, requestId: number, submittedAt: string }
```

### Admin Endpoints

```typescript
// Authenticate admin
POST /api/admin/auth
Body: { password: string }
Returns: { success: boolean }

// Upload Excel file with student data
POST /api/admin/upload
Body: FormData {
  file: File
  password: string
  examPeriod: string
  sectionNumber: string
}
Returns: { success: boolean, studentCount: number }

// Get all student requests
GET /api/admin/requests?password={password}
Returns: { success: boolean, requests: StudentRequest[] }

// Update request status and optionally deduct coins
PUT /api/admin/requests
Body: {
  password: string
  requestId: number
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  adminNotes?: string
  coinDeduction?: number
}
Returns: { success: boolean, adjustmentId?: number }

// Get coin adjustments
GET /api/admin/coin-adjustments?studentId={id}
Returns: { success: boolean, adjustments: CoinAdjustment[] }

// Create coin adjustment
POST /api/admin/coin-adjustments
Body: {
  password: string
  studentId: string
  studentName: string
  period: string
  sectionNumber: string
  adjustmentAmount: number
  reason: string
}
Returns: { success: boolean, adjustmentId: number }

// Delete (soft) coin adjustment
DELETE /api/admin/coin-adjustments
Body: { password: string, adjustmentId: number }
Returns: { success: boolean }
```

## 🔄 Data Flow

### Coin Calculation Algorithm

```typescript
// Per-period calculation
function calculatePeriodCoins(student: Student, period: Period): number {
  // 1. Base coins from qualified days
  const baseCoins = student.dailyLog
    .filter(day => !day.isExcluded && day.qualified)
    .length;
  
  // 2. Exempt day credits (would have qualified on exempt days)
  const exemptCredits = student.dailyLog
    .filter(day => day.isExcluded && day.wouldHaveQualified)
    .length;
  
  // 3. Coin adjustments for this period
  const adjustments = coinAdjustments
    .filter(adj => adj.period === period && adj.student_id === student.id)
    .reduce((sum, adj) => sum + adj.adjustment_amount, 0);
  
  return baseCoins + exemptCredits + adjustments;
}

// Total across all periods
totalCoins = periods.reduce((sum, period) => 
  sum + calculatePeriodCoins(student, period), 0
);
```

### Request Processing Flow

```typescript
// 1. Student submits request
POST /api/student/requests
  → request_type: 'assignment_replacement' | 'quiz_replacement' | 'override_request'
  → Insert into student_requests table
  → Status: 'pending'

// 2. Admin views and processes request
GET /api/admin/requests
  → Returns all requests sorted by section, name
  → Filter by section and/or request type

// 3. Admin updates request
PUT /api/admin/requests
  
  // For override requests (approved):
  → If request_type === 'override_request' and status === 'approved':
      → Insert into student_day_overrides table
      → override_type = 'qualified'
      → Student's day status and coins recalculated automatically
  
  // For redemption requests (completed/approved):
  → If coinDeduction > 0 and status is 'approved'/'completed':
      → Insert into coin_adjustments (negative amount)
      → reason = "Request fulfilled: {type}. {admin_notes}"
  
  → Update request status

// 4. Student sees changes immediately
GET /api/student
  → For overrides: Day status updated in dailyLog
  → For redemptions: Coins deducted and shown in adjustments
```

### Excel Processing

```typescript
// Excel file structure expected
interface ExcelRow {
  'Student Name': string
  'Email': string
  'Student ID': string
  'h:mm_1', 'h:mm_2', ... // Time columns
  'added to pie_1', 'added to pie_2', ... // Topic columns
}

// Processing algorithm
1. Parse Excel file using XLSX library
2. Extract student metadata (name, email, ID)
3. Process daily columns (minutes, topics)
4. Calculate qualification per day:
   - Qualified if: minutes >= 31 AND topics >= 1
5. Apply period-specific excluded dates
6. Calculate exempt day credits
7. Store as JSONB in student_data table
```

## 🎨 Component Architecture

### Student Portal (`app/page.tsx`)

```typescript
StudentLookup Component
├── State Management
│   ├── studentInfo: StudentInfo | null
│   ├── studentPeriods: PeriodInfo[]
│   ├── coinAdjustments: CoinAdjustment[]
│   └── totalCoinsAcrossPeriods: number
├── API Calls
│   ├── POST /api/student (fetch student data)
│   └── GET /api/analytics (class stats)
└── Child Components
    ├── CalendarView (daily progress grid)
    ├── RedemptionModal (coin redemption form)
    └── CompletionChart (analytics visualization)
```

### Redemption Modal (`components/redemption-modal.tsx`)

```typescript
RedemptionModal Component
├── Props
│   ├── redemptionType: 'assignment' | 'quiz'
│   ├── studentId, studentName, studentEmail
│   └── period, sectionNumber
├── Form State
│   ├── assignmentName: string
│   ├── courseSection: string
│   └── additionalNotes: string
└── Submission Flow
    ├── Validate form data
    ├── POST /api/student/requests
    ├── request_type = 'assignment_replacement' | 'quiz_replacement'
    └── request_details = formatted string with all info
```

### Admin Request Management (`app/admin/requests/page.tsx`)

```typescript
AdminRequestsPage Component
├── State Management
│   ├── requests: StudentRequest[]
│   ├── selectedSection: string (filter)
│   └── selectedStatus: string (filter)
├── Filtering Logic
│   └── Sort by: section_number ASC, student_name ASC
├── Update Modal
│   ├── Status dropdown
│   ├── Admin notes textarea
│   └── Coin deduction input (appears for approved/completed)
└── API Calls
    ├── GET /api/admin/requests
    └── PUT /api/admin/requests
```

## 🔐 Authentication & Security

### Admin Authentication

Staff sign in with **username + PIN**. Accounts live in the `admin_users` table (hashed PINs). A successful login sets an **httpOnly session cookie** signed with `ADMIN_SESSION_SECRET`. Admin APIs require that session — the PIN is not stored in `localStorage` or sent on every request.

The first professor account is bootstrapped from `ADMIN_PASSWORD` (username `admin`) when the table is empty. Professors manage TAs under **Admin → Staff**.

Audit fields (`processed_by`, `created_by`) use the signed-in user's display name.

### Student Data Access

```typescript
// Students can only access their own data
// No authentication - uses student ID as key
// Student ID normalized: studentId.toLowerCase().trim()
```

### Input Validation

```typescript
// All endpoints validate required fields
if (!studentId || typeof studentId !== "string") {
  return NextResponse.json({ error: "Invalid input" }, { status: 400 });
}

// Coin adjustment validation
if (typeof adjustmentAmount !== 'number' || isNaN(adjustmentAmount)) {
  return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
}
```

## 🔧 Key Implementation Details

### Multi-Period Support

```typescript
// Students tracked across multiple exam periods
// Each period has its own:
//   - Base coins from daily completions
//   - Exempt day credits
//   - Coin adjustments
// Total coins = sum of all period totals
```

### Soft Delete Pattern

```typescript
// Coin adjustments never hard-deleted
// Instead: is_active = false
// Allows audit trail and potential recovery
DELETE /api/admin/coin-adjustments
  → UPDATE coin_adjustments SET is_active = false WHERE id = ?
```

### Request-Linked Adjustments

```typescript
// When admin processes request with coin deduction:
// 1. Create coin_adjustments record with negative amount
// 2. Link via auto-generated reason
// 3. Student sees adjustment with clear explanation
reason = `Request fulfilled: ${requestType}. ${adminNotes}`
```

### Override System

```typescript
// Day overrides applied per-student
// Two types:
//   - 'qualified': Force day to qualified
//   - 'disqualified': Force day to disqualified
// Stored in student_day_overrides table
// Applied during coin calculation
```

## 📊 Analytics Implementation

### Class-Wide Statistics

```typescript
// Aggregated from all student_data
interface Analytics {
  period: string
  sections: string[]
  totalStudents: number
  averageCompletion: number
  dayStats: {
    day: number
    averageCompletion: number
    qualifiedStudents: number
    sectionBreakdown: SectionStats[]
  }[]
}
```

### Completion Tracking

```typescript
// Per student per period
percentComplete = (qualifiedDays / totalWorkingDays) * 100
extraCreditEligible = percentComplete >= 90

// Working days excludes:
//   - Future days (day > totalDays)
//   - Excluded dates (holidays, etc)
```

## 🚀 Deployment

### Environment Setup

```bash
# Vercel deployment
vercel env add ADMIN_PASSWORD
vercel env add ADMIN_SESSION_SECRET
vercel env add POSTGRES_URL
```

### Database Migration

```sql
-- Run on first deployment
-- Tables created automatically via CREATE TABLE IF NOT EXISTS
-- See Database Schema section for full SQL
```

## 📄 License

This project is private and proprietary. All rights reserved.

---

**Built with ❤️ for educational excellence**