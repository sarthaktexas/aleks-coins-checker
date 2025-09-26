# ALEKS Points Portal

A comprehensive web application for tracking student progress in ALEKS (Assessment and Learning in Knowledge Spaces) and managing a coin-based reward system. Students can view their progress, earn coins for completing daily requirements, and redeem coins for assignment/quiz replacements.

## 🎯 Features

### Student Portal
- **Student Lookup**: Enter student ID to view personalized progress dashboard
- **Progress Tracking**: Visual calendar showing daily completion status
- **Coin System**: Earn coins for meeting daily ALEKS requirements (31+ minutes, 1+ topics)
- **Redemption System**: Use coins to replace assignments (10 coins) or quizzes (20 coins)
- **Extra Credit Tracking**: Monitor eligibility for extra credit based on 90% completion rate
- **Class Analytics**: View aggregated completion statistics across all sections

### Admin Dashboard
- **Student Data Management**: Upload Excel files with student progress data
- **Period Management**: Configure exam periods and excluded dates
- **Analytics Overview**: Comprehensive statistics and completion trends
- **Day Overrides**: Manage exempt days and special circumstances
- **Data Export**: Download processed student data and analytics

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm, yarn, or pnpm
- PostgreSQL database (optional for demo mode)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd v0-aleks-coins-checker
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env.local
   ```
   
   Configure your environment variables (see [Environment Setup](#environment-setup) for details)

4. **Run the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🔧 Environment Setup

Create a `.env.local` file in your project root:

```bash
# Required: Admin authentication
ADMIN_PASSWORD="your-secure-admin-password"

# Optional: Database connection (app works without it using demo data)
POSTGRES_URL="postgres://username:password@host:port/database"
# OR
DATABASE_URL="postgres://username:password@host:port/database"

# Optional: Environment
NODE_ENV="development"
```

### Quick Development Setup
For local development without a database:
```bash
ADMIN_PASSWORD="admin123"
NODE_ENV="development"
```

The application will work with demo data. See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for detailed configuration instructions.

## 📊 How It Works

### Student Experience
1. **Enter Student ID**: Students enter their unique identifier on the homepage
2. **View Progress**: See daily completion status, coins earned, and progress toward extra credit
3. **Track Performance**: Visual calendar shows qualified days, missed days, and exempt periods
4. **Redeem Rewards**: Use earned coins to replace assignments or quizzes
5. **Monitor Analytics**: View class-wide completion trends and statistics

### Admin Workflow
1. **Upload Data**: Import Excel files containing student progress data
2. **Configure Periods**: Set up exam periods with start/end dates and excluded days
3. **Manage Overrides**: Handle special circumstances and exempt days
4. **Monitor Analytics**: Track class performance and completion trends
5. **Export Data**: Download processed data for external analysis

### Coin System
- **Earning**: Students earn 1 coin per day when they meet requirements (31+ minutes, 1+ topics)
- **Redemption**: 
  - Assignment/Video Replacement: 10 coins
  - Attendance Quiz Replacement: 20 coins
- **Extra Credit**: Available when students achieve 90%+ completion rate

## 🏗️ Project Structure

```
├── app/                    # Next.js app directory
│   ├── admin/             # Admin dashboard pages
│   │   ├── dashboard/     # Main admin dashboard
│   │   ├── manage-periods/# Period management
│   │   ├── view-data/     # Data viewing tools
│   │   └── view-overrides/# Override management
│   ├── api/               # API routes
│   │   ├── admin/         # Admin-only endpoints
│   │   ├── analytics/     # Analytics data
│   │   └── student/       # Student lookup
│   └── page.tsx           # Student portal homepage
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   ├── calendar-view.tsx # Student progress calendar
│   ├── completion-chart.tsx # Analytics charts
│   └── redemption-modal.tsx # Coin redemption interface
├── lib/                  # Utility libraries
│   ├── exam-periods.ts   # Period configuration
│   └── utils.ts          # Helper functions
├── scripts/              # Data processing scripts
│   ├── migrate-database.js # Database setup
│   └── process-excel.js  # Excel data processing
└── public/               # Static assets
```

## 🛠️ Technology Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI primitives
- **Database**: PostgreSQL (via Vercel Postgres)
- **Charts**: D3.js for data visualization
- **File Processing**: XLSX library for Excel handling
- **Icons**: Lucide React

## 📈 Data Processing

The application processes Excel files containing student progress data with the following structure:
- Student information (name, email, ID)
- Daily time spent in ALEKS
- Daily topics completed
- Section assignments
- Period-specific data

### Excel File Format
Expected columns:
- `Student Name`, `Email`, `Student ID`
- `h:mm_1`, `h:mm_2`, ... (time columns for each day)
- `added to pie_1`, `added to pie_2`, ... (topic columns for each day)

## 🔐 Security Features

- **Admin Authentication**: Server-side password validation
- **Data Privacy**: Student data only accessible with valid student ID
- **Environment Variables**: Secure configuration management
- **Input Validation**: Comprehensive data validation and sanitization

## 🚀 Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Manual Deployment
```bash
npm run build
npm start
```

## 📝 API Endpoints

### Student Endpoints
- `POST /api/student` - Student lookup and progress retrieval

### Admin Endpoints
- `POST /api/admin/auth` - Admin authentication
- `POST /api/admin/upload` - Student data upload
- `GET/POST /api/admin/periods` - Period management
- `GET/POST /api/admin/day-overrides` - Override management
- `GET /api/admin/student-data` - Student data export

### Analytics
- `GET /api/analytics` - Class-wide analytics and trends

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For questions or support, contact:
- **Email**: sarthak.mohanty@utsa.edu
- **Issues**: Create an issue in the GitHub repository

## 📄 License

This project is private and proprietary. All rights reserved.

---

**Built with ❤️ for educational excellence**