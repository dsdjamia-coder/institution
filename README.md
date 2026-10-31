# Noorul Islam Madrasa - Enterprise Educational & Financial Management System

A comprehensive, production-grade institutional web platform built for **Noorul Islam Higher Secondary Madrasa**. The platform provides an all-in-one suite covering student information management, counter fee collection, academic curriculum planning, dynamic routine and exam timetabling, interactive syllabus tracking, daily session attendance, co-curricular activities, marksheet generation, and granular administrative controls.

---

## Table of Contents

1. [System Architecture & Tech Stack](#system-architecture--tech-stack)
2. [Application Portals & Core Modules](#application-portals--core-modules)
   - [1. Public Institution Portal (`index.html`)](#1-public-institution-portal-indexhtml)
   - [2. Official Hub & Staff Gateway (`official.html`, `official-dashboard.html`)](#2-official-hub--staff-gateway-officialhtml-official-dashboardhtml)
   - [3. Super Administrative Console (`admin.html`)](#3-super-administrative-console-adminhtml)
   - [4. Academic Planning, Timetable & Syllabus Hub (`academic-plan.html`)](#4-academic-planning-timetable--syllabus-hub-academic-planhtml)
   - [5. Student Information Management System - SIMS (`student.html`)](#5-student-information-management-system---sims-studenthtml)
   - [6. Cashier & Fee Collection Counter (`collection.html`)](#6-cashier--fee-collection-counter-collectionhtml)
   - [7. Student Attendance Register (`attendance.html`)](#7-student-attendance-register-attendancehtml)
   - [8. Student Activities, Clubs & Rewards (`activity.html`)](#8-student-activities-clubs--rewards-activityhtml)
   - [9. Examination & Results Publishing Center (`result.html`)](#9-examination--results-publishing-center-resulthtml)
   - [10. Teacher Class Worksheet (`worksheet.html`)](#10-teacher-class-worksheet-worksheethtml)
   - [11. Student & Parent Self-Service Portal (`student-fee-system.html`)](#11-student--parent-self-service-portal-student-fee-systemhtml)
3. [Super Admin Setup & Configuration Guide](#super-admin-setup--configuration-guide)
   - [Method 1: Initial Bootstrap via Firebase Console](#method-1-initial-bootstrap-via-firebase-console)
   - [Method 2: Managing Credentials in Admin Console (`admin.html`)](#method-2-managing-credentials-in-admin-console-adminhtml)
   - [Method 3: Multi-Admin Accounts Management](#method-3-multi-admin-accounts-management)
   - [Method 4: Promoting Staff via RBAC (`actLikeSuperAdmin`)](#method-4-promoting-staff-via-rbac-actlikesuperadmin)
4. [Role-Based Access Control (RBAC) & Duty Scoping](#role-based-access-control-rbac--duty-scoping)
5. [Firestore Database Schema & Document Architecture](#firestore-database-schema--document-architecture)
6. [Getting Started & Local Development](#getting-started--local-development)
7. [Official Print Engine & Export Specifications](#official-print-engine--export-specifications)
8. [Security & Session Management](#security--session-management)
9. [License & Institutional Information](#license--institutional-information)

---

## System Architecture & Tech Stack

The system is designed as a modular **Multi-Page Application (MPA)** optimized for fast load times, offline resilience, and zero-overhead performance without heavyweight client-side routing frameworks.

- **Frontend Core**: Vanilla JavaScript (ES Modules) & TypeScript Definitions.
- **Styling & Layout**: Tailwind CSS v4 (`@tailwindcss/vite`), FontAwesome 6, Google Fonts (*Plus Jakarta Sans*).
- **Build & Bundler**: Vite 8 with TypeScript type-checking (`tsc && vite build`).
- **Cloud Database**: Google Cloud Firestore (Multi-tenant path scoping with custom database ID support).
- **Authentication**: Firebase Authentication (Email/Password, Anonymous Session) + Document-level Emergency Fallback.
- **PWA & Offline Support**: Web App Manifest (`manifest.json`), Service Worker (`sw.js`) with asset caching.
- **Document & PDF Generation**: jsPDF, jsPDF-AutoTable, and Native Publication-Grade CSS Print Engine (`@media print`).
- **Image Processing**: Client-side interactive canvas image cropper (`InteractiveCropper`).

---

## Application Portals & Core Modules

### 1. Public Institution Portal (`index.html`)
The public-facing digital gateway for parents, prospective students, and community members:
- **Hero & Institutional Statistics**: Live enrolled student tally, active faculty members, and academic milestones.
- **Notice Board & Announcements**: Real-time broadcast alerts, circulars, and exam notifications with lightbox modals.
- **Faculty & Leadership Directory**: Searchable teacher list with direct phone call and WhatsApp contact integration.
- **Managing Committee Directory**: Institutional board members with designations and profiles.
- **Campus Photo Gallery**: Responsive image gallery with full-screen lightbox preview.
- **Direct Login Gateway**: Modals for quick student lookup (by admission number and date of birth) and official staff access.
- **PWA Install Prompt**: Native browser installation prompt integration.

---

### 2. Official Hub & Staff Gateway (`official.html`, `official-dashboard.html`)
A unified authentication and navigation terminal for all institution staff, teachers, clerks, and administrators:
- **Multi-Source Authentication**:
  1. Super Admin email/password via Firebase Authentication.
  2. Legacy / Emergency Super Admin credential matching via Firestore `adminAuth` document.
  3. Staff accounts via username/email/staff ID and hashed passwords.
  4. Public directory authentication via category auth credentials.
- **Official Lockdown System**: When active, restricts system access strictly to Super Admins. Non-admin staff attempting access are blocked with security alerts.
- **Central Navigation Dashboard (`official-dashboard.html`)**:
  - Interactive portal cards with real-time badges for Fee Collection, Students, Worksheets, Results, Attendance, Activities, Academic Planning, and System Administration.
  - User role display, assigned duty classes summary, and quick session termination.

---

### 3. Super Administrative Console (`admin.html`)
The core institutional administration suite with comprehensive management panels:
- **Institution Profile & Branding**: Configure madrasa name, tagline, registration code, campus address, contact phone, email, and upload high-resolution institutional logo.
- **Academic Year Management**: Create and switch active academic years (e.g., `2026-2027`), set start/end months, and choose between Gregorian and Hijri calendar systems.
- **Fee Structure Setup**: Configure standard monthly tuition fees, admission fees, examination fees, and custom fee categories per class.
- **Faculty & Staff Directory**: Manage staff records, employee IDs, contact details, photos, and assign duty classes.
- **Granular RBAC Permissions**: Toggle access per staff member for Collection, Worksheet, Student Directory, Result Center, Attendance, Academic Plan, and Activity modules.
- **Security & Credentials**: Update Super Admin login credentials, manage multiple co-administrators, and review automated audit logs.
- **System Backup & Restore**: Export full Firestore database state to JSON and restore data snapshots.

---

### 4. Academic Planning, Timetable & Syllabus Hub (`academic-plan.html`)
A unified academic management module divided into specialized sub-tabs:

#### Tab 1: Class Subjects (`#tab-subjects`)
- Visual **Class Cards Grid**: Displays each assigned class with subject counts, assigned teachers, and weekly teaching period ratios.
- **Two-Way Result Sync Wizard**: Discovers and imports subjects configured in Examination Schemas (`resultSchemas`) into the Academic Plan with selective checkboxes.
- Add and edit subjects with full names, subject codes, assigned instructors, and weekly period targets.

#### Tab 2: Class Routine Timetable (`#tab-timetable`)
- **Dynamic Periods & Break Slots**: Configure any number of daily teaching periods (Periods 1 to 7+) and custom break/interval slots.
- **Auto-Timings Calculator**: Set start time and duration in minutes to automatically calculate sequential periods.
- **7-Day Selector with Working Days vs. Weekly Off Sync**: Select active working days (Sunday through Saturday). Unchecked days are marked as Weekly Offs and synchronize with the Attendance Register.

#### Tab 3: Academic Year Plan (`#tab-yearplan` - Annual Overview)
- **12-Month Annual Syllabus Matrix**: Months along rows (Shawwal to Sha'ban / April to March) and subjects along columns.
- **Target Portion Indicators**: Displays lesson units, topics, and page ranges planned for each month.
- **Visual Status Badges**: Cells display real-time progress indicators: `Done` (100%), `In Progress` (X%), or `Planned`.
- **Seamless Navigation**: Clicking any cell in View Mode immediately opens the Syllabus Tracker with that class, month, and subject selected.

#### Tab 4: Syllabus Progress Tracker (`#tab-syllabus-tracker` - Daily Checklist)
- **Interactive Checklist Table**: Comprehensive checklist displaying `#`, Month, Day/Session, Subject, Lesson Title, Portions/Pages, Periods, Completion Checkbox, Progress Bar, and Teacher Remarks.
- **One-Click Real-Time Auto-Save**: Ticking the lesson checkbox immediately marks it as Completed (100%), persists to Firestore, updates summary statistics, and synchronizes with the Year Plan matrix.
- **Summary Metrics**: Live counters for Total Lessons, Completed Lessons & Percentage, Total Teaching Periods Tracked, and animated completion progress bar.
- **Add Lesson Tracker Entry Modal (`#modal-st-entry`)**: Add custom daily/session portions or monthly lesson targets.
- **Print Tracker Sheet**: Generates an official A4 Landscape verification ledger with institutional letterhead and signature blocks.

#### Tab 5: Class Exam Timetable (`#tab-exam-schedule`)
- Exam scheduling for individual classes: Exam Date, Paper/Session, Subject, Portions to Study, Exam Hall, and Invigilator.
- Integrated bottom row `+ Add Next Exam Date` action button.

#### Tab 6: Master Timetable (`#tab-master-timetable`)
- Consolidated institution-wide matrix: Classes along rows and Exam Dates along columns.
- Multi-session sub-columns per date (e.g., Paper 1 Morning, Paper 2 Afternoon).

---

### 5. Student Information Management System - SIMS (`student.html`)
Full-lifecycle student record management:
- **Student Profile**: Admission number, roll number, class, division, gender, date of birth, blood group, father/guardian name, address, contact phone numbers.
- **Sibling Relationship Linking**: Connects brothers and sisters to a shared family parent account for consolidated fee management.
- **Interactive Photo Upload**: Integrated crop tool (`InteractiveCropper`) for student ID photographs.
- **Class Promotions & Transfers**: Single-click student promotion wizard between academic years.
- **Search & Filter**: Live instant filtering by class, division, admission number, name, or phone.

---

### 6. Cashier & Fee Collection Counter (`collection.html`)
A robust financial collection terminal built for madrasa fee counters:
- **Instant Student Lookup**: Search by student name or admission number with auto-complete suggestions.
- **Interactive Fee Matrix**: Monthly fee checklist (June to March cycle) and custom fees (Admission, Books, Exam, Building Fund).
- **Concessions & Discounts**: Apply approved sibling discounts, merit concessions, or custom fee waivers.
- **Multi-Payment Modes**: Record payments via Cash, UPI (Google Pay, PhonePe), or Bank Transfer.
- **Receipt Printing**: Instant thermal or A4 receipt generation with institution logo, itemized breakdown, and receipt numbering.
- **Duplicate Watermark**: Reprint past receipts with a clear `DUPLICATE RECEIPT` audit watermark.
- **Master Ledger & Defaulters**: View outstanding dues per student/class and export financial ledgers to Excel/CSV.

---

### 7. Student Attendance Register (`attendance.html`)
Session-based student attendance tracking:
- **Morning & Evening Sessions**: Record attendance for morning and afternoon sessions separately.
- **Duty-Class Scoping**: Teachers only access classes assigned to them in their staff profile (Super Admin accesses all classes).
- **Attendance Statuses**: Present, Absent, Half Day, Approved Leave, and Institutional Holiday.
- **Monthly Matrix View**: Full-month calendar grid with auto-synced weekly off days from Timetable configuration.
- **Attendance Statistics**: Monthly percentage calculation, absentee alerts, and official printable attendance sheets.

---

### 8. Student Activities, Clubs & Rewards (`activity.html`)
Co-curricular student engagement tracking:
- **House System**: Group students into institutional houses (e.g., Red, Blue, Green, Yellow).
- **Events & Competitions**: Arts festivals, Qur'an recitation contests, sports meets, speech competitions.
- **Scoring & Leaderboards**: Real-time house leaderboard, star student ranking, and achievement badge awards.
- **Teacher Scoring Grid**: Class teachers input and edit student event scores with instant cloud persistence.

---

### 9. Examination & Results Publishing Center (`result.html`)
Comprehensive academic evaluation and marksheet portal:
- **Custom Examination Schemas**: Configure maximum marks, passing minimum, and grade cutoffs (A+, A, B+, B, C+, C, D, E) for each exam and class.
- **Score Recording Grid**: Subject-wise mark entry with validation against maximum limits.
- **Automated Grade Computation**: Instantly computes total marks, percentage, class rank, letter grades, and Pass/Fail status.
- **Official Publishing Toggle**: Keep results in draft mode during evaluation, then publish institution-wide with a single toggle.
- **Student Marksheet Printing**: Generates individual progress report cards and consolidated class tabulation sheets.

---

### 10. Teacher Class Worksheet (`worksheet.html`)
A lightweight, dynamic spreadsheet for classroom management:
- **Dynamic Columns**: Add custom columns (e.g., Homework, Project, Tajweed Recitation, Conduct).
- **Inline Editing**: Teachers record scores directly within table cells.
- **Sorting & Exporting**: Sort by Admission Number, Roll Number, or Name, with direct CSV/Excel export.

---

### 11. Student & Parent Self-Service Portal (`student-fee-system.html`)
Mobile-optimized portal for students and parents:
- **Sibling Switcher**: Switch between all enrolled children with a single tap on the family device.
- **Fee Ledger**: Clear breakdown of paid vs. pending months with digital receipts.
- **Published Examination Results**: View marks, grades, rankings, and downloadable report cards.
- **Direct WhatsApp Receipts**: Download official receipt copies on demand.

---

## Super Admin Setup & Configuration Guide

Setting up the Super Administrator is required to unlock full access across all modules, configure institutional parameters, and manage staff permissions.

### Method 1: Initial Bootstrap via Firebase Console
When deploying the application to a new Firebase project:

1. **Step 1: Create Admin in Firebase Authentication**
   - Open [Firebase Console](https://console.firebase.google.com).
   - Navigate to **Build > Authentication > Users**.
   - Click **Add User**.
   - Enter your administrator email (e.g., `admin@institute.com`) and a secure password (minimum 6 characters).
   - Click **Add User**.

2. **Step 2: Create Firestore `adminAuth` Document**
   - Navigate to **Build > Firestore Database**.
   - Browse to your institution base path:
     ```
     institutions/TEST_INSTITUTE_01/settings/adminAuth
     ```
     *(Note: Replace `TEST_INSTITUTE_01` if you modified `INSTITUTION_ID` in `config/app-config.js`).*
   - Create the document `adminAuth` with the following fields:
     ```json
     {
       "email": "admin@institute.com",
       "password": "yourSuperSecretPassword123",
       "admins": [
         {
           "name": "Primary Super Admin",
           "email": "admin@institute.com",
           "role": "super_admin",
           "isActive": true,
           "createdAt": "2026-01-01T00:00:00.000Z"
         }
       ]
     }
     ```
3. **Step 3: Log In**
   - Navigate to `official.html` or `index.html` on your web app.
   - Enter `admin@institute.com` and your password.
   - The system validates via Firebase Authentication (or falls back to the document credentials) and initializes the `AppSession` as `admin`.

---

### Method 2: Managing Credentials in Admin Console (`admin.html`)
Once logged in as Super Admin, you can change login credentials directly from the user interface:
1. Navigate to **`admin.html`** and click the **Security / Credentials** tab.
2. Locate the **Update Admin Credentials** card.
3. Enter:
   - **Current Password**: For re-authentication.
   - **New Admin Email**: (Optional, if changing login email).
   - **New Password**: (Minimum 6 characters).
4. Click **Update Admin Credentials**.
5. The application re-authenticates with Firebase Auth, updates the user credentials in Google Auth, and synchronizes the Firestore `adminAuth` document automatically.

---

### Method 3: Multi-Admin Accounts Management
To grant Super Admin access to multiple trusted officials without sharing a single password:
1. Open the Firestore document: `institutions/{INSTITUTION_ID}/settings/adminAuth`.
2. Add new administrator entries to the `admins` array:
   ```json
   {
     "admins": [
       {
         "name": "Principal Usthad",
         "email": "principal@institute.com",
         "role": "super_admin",
         "isActive": true,
         "createdAt": "2026-01-01T00:00:00.000Z"
       },
       {
         "name": "General Secretary",
         "email": "secretary@institute.com",
         "role": "super_admin",
         "isActive": true,
         "createdAt": "2026-02-01T00:00:00.000Z"
       }
     ]
   }
   ```
3. Create corresponding user accounts in **Firebase Authentication** for each email.
4. Each administrator can now log in using their personal email and password with full Super Admin access.

---

### Method 4: Promoting Staff via RBAC (`actLikeSuperAdmin`)
You can elevate any existing staff member to have complete Super Admin privileges across all pages:
1. Go to **`admin.html` > Staff Management**.
2. Select the staff member and click **Edit Staff**.
3. Under **Access Roles & Permissions**, check **Act Like Super Admin (Full Access)**.
4. Save the profile.
5. In Firestore, this sets:
   ```json
   {
     "actLikeSuperAdmin": true,
     "canAccessAdmin": true,
     "admin": true
   }
   ```
   under `institutions/{INSTITUTION_ID}/staffAccess/{staffDocId}`.
6. The staff member can now log in with their regular staff username/phone and password, and they will receive full Super Admin rights across all modules.

---

## Role-Based Access Control (RBAC) & Duty Scoping

The system employs multi-tier access guards enforced by `scripts/shared/session-guard.js`:

| Role | Target Pages | Capabilities | Scoping Rules |
| :--- | :--- | :--- | :--- |
| **Super Admin** | All Pages | Complete system control, credential management, backups, official lockdown | Unrestricted (Views all classes, subjects, finances) |
| **Class Teacher** | `academic-plan.html`, `attendance.html`, `worksheet.html`, `activity.html`, `result.html` | Record attendance, manage timetables, track syllabus, input exam scores | **Duty-Class Scoped** (Restricted strictly to assigned classes) |
| **Cashier / Clerk** | `collection.html`, `student.html` | Collect fees, generate receipts, manage student admissions, export ledgers | Scoped to financial operations |
| **Result Operator** | `result.html`, `admin.html#results` | Configure exam schemas, record marks, publish marksheets | Scoped to result management |
| **Student / Parent** | `student-fee-system.html` | View fee dues, download receipts, inspect published examination results | Scoped strictly to sibling group |

### Duty-Class Scoping Mechanism
When a teacher is assigned specific classes (e.g., `Class 3`, `Class 5`):
- Dropdown menus across **Academic Plan**, **Attendance**, and **Results** automatically filter to only show `Class 3` and `Class 5`.
- Super Admins always see `All Classes` along with every individual class option.

---

## Firestore Database Schema & Document Architecture

All institutional data resides under the base path:
```
institutions/{INSTITUTION_ID}/
```
*(Default: `institutions/TEST_INSTITUTE_01/`)*

### Key Collections & Documents:

- **`settings/adminAuth`**: Super Administrator credentials, email, emergency password, and `admins` list.
- **`settings/config`**: Institutional profile (name, phone, address, tagline, logo URL, active academic year).
- **`settings/academicYears`**: List of created academic years, session months, and calendar types.
- **`settings/sessionControl`**: Official Lock toggle status (`isLocked: true/false`).
- **`students/{studentId}`**: Student master records (admission no, name, class, division, parent contact, fees profile).
- **`staff/{staffId}`**: Staff member directory (name, designation, phone, duty classes, photo).
- **`staffAccess/{staffId}`**: Granular permission switches (`collection`, `worksheet`, `student`, `result`, `attendance`, `academicPlan`, `studentActivity`, `actLikeSuperAdmin`).
- **`collections/{receiptNo}`**: Real-time fee collection transactions (student ID, amount, payment mode, months, timestamp).
- **`yearPlans/{academicYear}__{class}`**: Annual syllabus portions and daily lesson execution checklists.
- **`timetables/{academicYear}__{class}`**: Class weekly routine timetable periods, timeslots, and working day configurations.
- **`examTimetables/{academicYear}__{class}__{examTitle}`**: Examination schedules, hall allotments, and invigilator duties.
- **`classSubjects/{academicYear}__{class}`**: Official subject configurations, weekly period allocations, and assigned instructors.
- **`attendance/{academicYear}__{class}__{month}`**: Monthly session-wise student attendance records.
- **`activities/{activityId}`**: House competitions, student scores, points, and achievement awards.
- **`resultSchemas/{academicYear}__{class}__{examTitle}`**: Examination grading rules, max marks, and grade boundaries.
- **`examResults/{academicYear}__{class}__{examTitle}`**: Computed student exam marks, rankings, grades, and pass/fail statuses.
- **`notices/{noticeId}`**: Public notice board announcements and circulars.
- **`auditLogs/{logId}`**: Automated security and transaction audit log entries.

---

## Getting Started & Local Development

### Prerequisites
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)
- A Google Firebase project with Cloud Firestore and Firebase Authentication enabled.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/dsdjamia-coder/institution.git
   cd institution
   ```

2. **Install project dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Parameters**:
   - Check `config/app-config.js` to adjust your `INSTITUTION_ID` if deploying for multiple institutions:
     ```javascript
     export const INSTITUTION_ID = 'NOORUL_ISLAM_01';
     export const BASE_PATH = `institutions/${INSTITUTION_ID}`;
     ```
   - Check `config/firebase-config.js` to ensure your Firebase project credentials (`apiKey`, `projectId`, `firestoreDatabaseId`) match your Firebase project.

4. **Start the local development server**:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:3000`.

5. **Type Checking & Linting**:
   ```bash
   npm run lint
   ```

6. **Production Build**:
   ```bash
   npm run build
   ```
   The compiled, optimized distribution bundle will be generated in `dist/`.

7. **Preview Production Build**:
   ```bash
   npm run preview
   ```

---

## Official Print Engine & Export Specifications

All printable documents across the platform are engineered for publication-grade A4 printing using custom `@media print` stylesheets:

- **Web Chrome Elimination**: Headers, navigation drawers, control bars, filter selectors, modals, and toasts are automatically suppressed.
- **Boxed Border Structure**: High-contrast black box borders (`border: 1.5px solid #000; border-collapse: collapse;`) ensure crisp clarity on physical laser and inkjet printers.
- **Dynamic Orientation**:
  - **Class Routine Timetable**: Landscape A4.
  - **Academic Year Plan Matrix**: Landscape A4.
  - **Syllabus Progress Tracker**: Landscape A4.
  - **Master Exam Timetable**: Landscape A4.
  - **Class Exam Routine**: Landscape A4.
  - **Student Result Marksheet / Report Card**: Portrait A4.
- **Official Letterhead & Signatures**: Every printed sheet includes institutional branding, official logo, document publication date, and dual signature blocks for the **Subject/Class Teacher** and the **Head of Institution / Principal**.

---

## Security & Session Management

- **Session Guard (`AppSession`)**: Enforces session freshness, idle-timeout management, and role switching across browser tabs.
- **Official Lockdown**: Instantly disables non-admin logins across all operational hubs during examinations or audits.
- **Audit Logging**: Sensitive operations (credential updates, fee deletions, marksheet publishing, data exports) record timestamped audit entries in `auditLogs/`.
- **Harden External Links**: Automated DOM sanitizer prevents tab-nabbing vulnerabilities across all external hyperlinks.

---

## License & Institutional Information

This software is custom-developed for **Noorul Islam Higher Secondary Madrasa**. All rights reserved. Unauthorized reproduction, modification, or distribution is strictly prohibited.
