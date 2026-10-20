# Noorul Islam Madrasa System: Complete Cross-Platform Rebuild Specification & Architecture Plan

## Executive Summary
This architectural document establishes the complete, production-grade rebuild specification for the **Noorul Islam Higher Secondary Madrasa Fee Management & Administration System**. Built from an exhaustive analysis of the existing repository (`feee050`), this plan guarantees **100% feature preservation** while modernizing the platform across:
1. **Native Android Application**: Kotlin with Jetpack Compose, Material Design 3, Coroutines, Flow, and offline Room caching.
2. **Native iOS Application**: Swift with SwiftUI, Swift Concurrency (async/await), and CoreData/SwiftData offline caching.
3. **Responsive Web Application**: Next.js (App Router), React 19, TypeScript, Tailwind CSS, and shadcn/ui design patterns.
4. **Backend Services & Persistence**: NestJS (Node.js) orchestrating secure business logic, integrated with Firebase Firestore (Enterprise DB `ai-studio-feee-81b4709b-982c-4f96-b21b-c346855b9aa2`), Firebase Auth, and Firebase Cloud Functions.

No existing functionality, business calculation, administrative control, or operational workflow has been omitted or simplified.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural parameters have been confirmed based on user requirements:
> - **Cross-Platform Architecture**: Native Kotlin (Jetpack Compose) for Android + Native Swift (SwiftUI) for iOS + Next.js (React) for Web + NestJS API services.
> - **Backend & Database Engine**: Firebase Firestore, Firebase Authentication, and Firebase Cloud Functions.
> - **Student & Guardian Authentication**: Dual-credential verification using Student Admission/ID and verified mobile phone number, with multi-account family profiles on a single device.
> - **Zero Feature Loss Guarantee**: All workflows from Fee Collection, Master Ledger, Class Worksheets, Result Center, TC Generation, Discontinue & Re-admission Continuity, and Public Directory are fully preserved.

---

## 1. Overview & Core Concept
The application serves as the complete digital operating system for Noorul Islam Higher Secondary Madrasa, covering:
- **Public & Community Engagement**: Public portal with institution history, staff directories, committee accordions, notice boards, media gallery, and live statistics.
- **Operational Fee Management**: Multi-tier cash/bank fee collection, class-wise fee schedules, batch invoicing, partial payments, automated receipting (thermal and PDF), and offline sync.
- **Academic & Examination Operations**: Class worksheets with mini-spreadsheet ergonomics, continuous evaluation marks entry, grade auto-computation, promotion/detention engines, and Transfer Certificate (TC) generation.
- **Student & Parent Life-cycle**: Profile tracking, multi-child switcher, fee statements, mark lists, system notifications, photo submission, and Alumni (Graduated) directory tracking.
- **Administrative Governance & Continuity**: Discontinue and Re-admission historical tracking (preserving pending dues up to departure without charging gap years), staff role assignment, session registry, audit logging, and automated backups.

---

## 2. Complete Inventory of Existing Functionality

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               NOORUL ISLAM MADRASA SYSTEM                               │
├─────────────────────┬─────────────────────┬─────────────────────┬──────────────────────┤
│  1. PUBLIC PORTAL   │  2. FEE COLLECTION  │  3. CLASS WORKSHEET │  4. RESULT CENTER    │
│  - Hero & Branding  │  - Fast Entry Desk  │  - Mini-Spreadsheet │  - Mark Entry Grid   │
│  - Public Directory │  - Master Ledger    │  - Daily Attendance │  - Auto-Grading & GPA│
│  - Staff/Committee  │  - Thermal/PDF Rec. │  - Continuous Eval  │  - Promotion Engine  │
│  - Notices & Photos │  - Multi-Fee Split  │  - A4 & Excel Export│  - TC Generator      │
├─────────────────────┼─────────────────────┼─────────────────────┼──────────────────────┤
│  5. STUDENT PORTAL  │  6. ADMIN CONSOLE   │  7. CONTINUITY/GAP  │  8. INFRASTRUCTURE   │
│  - Dues & Invoices  │  - Academic Years   │  - Discontinue Flow │  - Offline Sync      │
│  - Payment Receipts │  - Staff & Roles    │  - Re-admission Log │  - App Check & Rules │
│  - Saved Accounts   │  - System Settings  │  - Frozen Ledgers   │  - Push Notifications│
│  - Alumni Register  │  - Audit Logs       │  - Trajectory View  │  - Session Registry  │
└─────────────────────┴─────────────────────┴─────────────────────┴──────────────────────┘
```

### Module 1: Public Web Portal (`index.html` / `index-page.js`)
1. **Institution Branding & Live Stats**: Dynamic hero banner with institution title, registration number, location, and real-time counts (total students, active teachers, male, female counts).
2. **Dynamic Staff & Committee Directory**: Interactive accordion and swipeable profile cards displaying teachers, management committee members, designations, and contact handles.
3. **Notice Board & Media Gallery**: Dynamic announcements with badge counters, urgent notice highlights, image gallery swipe viewer, and external social media link hardening.
4. **Universal Login Modal**: Tabbed login interface supporting Student/Guardian login (Class + Name/Admission search + Mobile password) and Official/Staff login (Email/password).

### Module 2: Fee Collection Engine (`collection.html` / `collection-page.js` & modules)
1. **Fast Entry Desk (`entry-module.js`)**: Real-time student search by Admission No, Name, or Roll No; quick fee category selection (Madrasa Fee, Bus Fee, Special Funds, Books/Uniforms, Donations); partial and bulk payment support.
2. **Instant Receipting & Printing**: Dual-mode receipt generator: 80mm/58mm thermal print layout and downloadable A4/A5 PDF receipts with institution seal, barcode, and breakdown.
3. **Master Ledger Module (`master-ledger-module.js`)**: Comprehensive class-wise financial matrix, student ledger cards, fee waiver/concession tags, and live aggregate dues balance.
4. **History & Audit Module (`history-module.js`)**: Real-time payment search with date ranges, cashier/collector filtering, void/cancel receipt workflow with authorization, and reprint capabilities.
5. **Collection Reports (`reports-module.js`)**: Daily scroll, monthly summaries, head-wise breakdowns, cashier reconciliation reports, and Excel/PDF export pipelines.
6. **Bulk Data Upload (`upload-module.js`)**: Client-side parsed Excel (`.xlsx`) batch importer for student rosters and historical fee structures with duplicate detection.

### Module 3: Class Worksheet Workspace (`worksheet.html` / `official/worksheet-module.js`)
1. **Mini-Spreadsheet Canvas**: Excel-like interactive grid with formula bar, cell selection, name box (A1, B4), undo/redo stack, and font/color controls.
2. **Roster Integration & Auto-Fill**: Instant population of student lists by Class and Academic Year (Name, Admission No, Roll No, Gender, Guardian, Contact).
3. **Continuous Evaluation & Attendance**: Daily attendance tracking columns, periodic assessment marks, and dynamic calculation formulas (`SUM`, `AVERAGE`, `PERCENT`).
4. **Alumni & Year-Grouping Integration**: Dedicated Alumni tab showing graduated student records filtered by academic year, excluded from active tuition tallies.
5. **Print-First A4 & Excel Export**: Pixel-perfect A4 portrait/landscape pagination preview and native `.xlsx` export preserving formulas and styling.

### Module 4: Exam Result & TC Center (`result.html` / `result-page.js`)
1. **Dynamic Exam Schema Builder**: Configurable subjects, maximum/passing marks, weightages, and grading scales (A+, A, B, C, Failed).
2. **Batch Mark Entry Desk**: Class-wise mark entry matrix with validation warnings for out-of-range marks and real-time GPA calculation.
3. **Result Publication & Privacy**: One-click publish toggle per class and exam; secure student portal viewing by Admission No and verified phone.
4. **Promotion Decision Engine**: Automated pass/fail classification, rank determination, conditional promotion rules, and class advancement triggers.
5. **Transfer Certificate (TC) Engine**: Official TC generator with auto-incrementing TC numbers, conduct remarks, attendance records, and printable official certificate format.

### Module 5: Student & Guardian Portal (`student.html` / `student-page.js`)
1. **Personal Dashboard**: Student bio data, current class, roll number, attendance score, and outstanding balance summary cards.
2. **Multi-Account Profile Switcher**: Local device storage allowing parents to switch between multiple enrolled children with one tap without re-authenticating.
3. **Digital Fee Statement & Receipts**: Itemized fee ledger showing paid vs due amounts with downloadable previous payment receipts.
4. **Exam Report Cards**: Visual digital mark sheets with subject-wise scores, total marks, percentage, class rank, and teacher remarks.
5. **Notification Hub & Read Tracking**: System notifications, fee reminders, event notices, and read/unread status synchronizer.
6. **Student Photo Submission**: In-app camera capture and photo upload for student ID cards and institutional records.
7. **Alumni View**: Dedicated archive profile for graduated students showing their completion year, historical transcripts, and alumni status.

### Module 6: Admin Management Console (`admin.html` / `admin-page.js`)
1. **Academic Year & Class Management**: Academic calendar configuration, term definitions, class section definitions, and promotion progression rules.
2. **Fee Structure & Concession Configuration**: Definition of fee items per class, payment frequency (monthly, termly, yearly), and student-specific discount rules.
3. **Staff & Access Control Hub**: Teacher/Collector profile management, email-based admin invitations, granular permission flags (`canCollectFees`, `canManageResults`, `canEditWorksheets`).
4. **Discontinue & Re-admission Management**: Complete student lifecycle continuity tracking:
   - Discontinuation flow with departure date, reason, and Malaylam/English notes.
   - Ledger freezing: historical dues preserved up to departure date; zero billing for gap years.
   - Re-admission flow with return date, new class assignment, roll number, and trajectory preservation.
5. **Session Registry & Device Governance**: Real-time heartbeat tracking of active collector sessions, preventing duplicate concurrent cash desks.
6. **Audit Logs & Security Monitoring**: Immutable event log tracking payment modifications, result changes, student deletions, and settings overrides.

---

## 3. Recommended Technology Stack & Justification

| Layer | Selected Technology | Justification |
| :--- | :--- | :--- |
| **Android Native** | **Kotlin + Jetpack Compose** | Modern declarative UI, first-class Coroutines/Flow for Firestore streaming, native hardware access (thermal Bluetooth printers, camera), and offline Room DB. |
| **iOS Native** | **Swift + SwiftUI** | Native Apple ecosystem integration, Swift Concurrency, CoreBluetooth for POS printers, and SwiftData/CoreData offline persistence. |
| **Web Platform** | **Next.js 15 (React 19) + TypeScript** | Server-side rendering (SSR) for public SEO, React Server Components (RSC), App Router, Tailwind CSS 4, and high-performance client dashboards. |
| **Backend & API** | **NestJS (Node.js/TypeScript)** | Enterprise modular architecture, OpenAPI/Swagger specifications, robust validation pipes, and authoritative transaction processing. |
| **Database & Auth** | **Firebase Firestore & Firebase Auth** | Real-time multi-client sync, robust security rules (ABAC), App Check protection, serverless scale, and zero DevOps database maintenance. |
| **Serverless Logic** | **Firebase Cloud Functions (2nd Gen)** | Trusted server-side execution for TC number generation, ledger re-admission calculations, PDF rendering, and push notification dispatch. |
| **PDF & Reports** | **PDFKit / Puppeteer Core & ExcelJS** | Authoritative server-side generation of high-resolution A4 receipts, Certificates, and multi-tab Excel workbooks. |

---

## 4. Target System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT PLATFORMS (FRONTEND)                             │
│                                                                                        │
│   ┌─────────────────────┐      ┌─────────────────────┐      ┌──────────────────────┐   │
│   │   ANDROID CLIENT    │      │     iOS CLIENT      │      │   WEB APPLICATION    │   │
│   │ Kotlin/Compose      │      │ Swift/SwiftUI       │      │ Next.js 15 / React   │   │
│   │ Android Room Cache  │      │ CoreData Cache      │      │ Service Worker Cache │   │
│   │ BT Thermal Printer  │      │ BT Thermal Printer  │      │ Web Print / PDF      │   │
│   └──────────┬──────────┘      └──────────┬──────────┘      └───────────┬──────────┘   │
└──────────────┼────────────────────────────┼─────────────────────────────┼──────────────┘
               │ HTTPS / WSS                │ HTTPS / WSS                 │ HTTPS / WSS
┌──────────────▼────────────────────────────▼─────────────────────────────▼──────────────┐
│                                APPLICATION GATEWAY & API                               │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │  NestJS Backend Services (Node.js 22 LTS)                                      │   │
│   │  - Auth Guard & Multi-Role RBAC (Admin, Staff, Collector, Result Operator)    │   │
│   │  - App Check Token Verification                                                │   │
│   │  - Authoritative Transaction Engine (Fee Ledgers & Gap-Year Freezing)          │   │
│   │  - TC & Certificate Generator                                                  │   │
│   └──────────────────────────────────────┬─────────────────────────────────────────┘   │
└──────────────────────────────────────────┼─────────────────────────────────────────────┘
                                           │ Firebase Admin SDK
┌──────────────────────────────────────────▼─────────────────────────────────────────────┐
│                            CLOUD PERSISTENCE & SERVICES                                │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │  Firebase Firestore (ai-studio-feee-81b4709b-982c-4f96-b21b-c346855b9aa2)      │   │
│   │  - Strict ABAC Security Rules (Attribute-Based Access Control)                 │   │
│   │  - PII Separation & Split Collections                                         │   │
│   ├────────────────────────────────────────────────────────────────────────────────┤   │
│   │  Firebase Cloud Functions (2nd Gen)                                            │   │
│   │  - FCM Push Notifications                                                      │   │
│   │  - Ledger Audit Reconciliation                                                 │   │
│   │  - Automated Nightly Database Backups                                          │   │
│   └────────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Database Schema & Data Models (Firestore)

### Core Collections Structure (`institutions/{institutionId}/...`)

#### 1. `settings/adminAuth`
```typescript
interface AdminAuthDocument {
  email: string;
  adminsIndex: Record<string, boolean>; // e.g. { "admin@noorulislam.org": true }
  updatedAt: FirebaseFirestore.Timestamp;
}
```

#### 2. `settings/instituteConfig`
```typescript
interface InstituteConfig {
  name: string;
  regNo: string;
  place: string;
  phone: string;
  email: string;
  logoUrl: string;
  aboutText: string;
  activeAcademicYear: string;
  singleAdminMode: boolean;
}
```

#### 3. `students/{studentId}`
```typescript
interface StudentDocument {
  studentId: string;
  admNo: string;
  name: string;
  gender: 'MALE' | 'FEMALE';
  dob: string;
  guardianName: string;
  phone: string; // Used for Student/Guardian Auth
  whatsapp: string;
  currentClass: string; // e.g. "Class 5", or "Alumni"
  rollNo: number;
  status: 'ACTIVE' | 'DISCONTINUED' | 'GRADUATED' | 'TRANSFERRED';
  photoUrl?: string;
  academicTrajectory: Array<{
    academicYear: string;
    class: string;
    rollNo: number;
    status: 'ACTIVE' | 'PROMOTED' | 'DISCONTINUED' | 'RE_ADMITTED';
    date: string;
    notes?: string;
  }>;
  discontinueInfo?: {
    date: string;
    reason: string;
    notes: string;
    frozenPendingDue: number;
  };
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}
```

#### 4. `academicYears/{yearId}`
```typescript
interface AcademicYearDocument {
  yearId: string; // e.g. "2025-2026"
  title: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}
```

#### 5. `academicYears/{yearId}/feeItems/{feeId}`
```typescript
interface FeeItemDocument {
  feeId: string;
  title: string; // e.g. "Monthly Tuition", "Book Kit"
  targetClasses: string[]; // ["Class 1", "Class 2"] or ["ALL"]
  amount: number;
  frequency: 'ONE_TIME' | 'MONTHLY' | 'TERMLY' | 'YEARLY';
  dueMonth?: number;
}
```

#### 6. `payments/{paymentId}` (and subcollection partitioned by year)
```typescript
interface PaymentDocument {
  paymentId: string;
  receiptNo: string;
  studentId: string;
  admNo: string;
  studentName: string;
  class: string;
  academicYear: string;
  amount: number;
  breakdown: Array<{
    feeId: string;
    feeTitle: string;
    amount: number;
  }>;
  paymentMode: 'CASH' | 'UPI' | 'BANK_TRANSFER';
  paymentDate: string; // "YYYY-MM-DD"
  collectedBy: {
    uid: string;
    email: string;
    name: string;
  };
  status: 'VALID' | 'VOIDED';
  voidReason?: string;
  createdAt: FirebaseFirestore.Timestamp;
}
```

#### 7. `examResults/{resultId}`
```typescript
interface ExamResultDocument {
  resultId: string;
  examId: string; // e.g. "FIRST_TERM_2025"
  examTitle: string;
  academicYear: string;
  class: string;
  studentId: string;
  admNo: string;
  marks: Record<string, number>; // { "Quran": 95, "Fiqh": 88 }
  totalScore: number;
  percentage: number;
  gpa: string;
  rank: number;
  status: 'PASSED' | 'FAILED' | 'WITHHELD';
  published: boolean;
}
```

#### 8. `transferCertificates/{tcId}`
```typescript
interface TransferCertificateDocument {
  tcId: string;
  tcNumber: string;
  studentId: string;
  admNo: string;
  studentName: string;
  admissionDate: string;
  leavingDate: string;
  classAtLeaving: string;
  qualifiedForPromotion: boolean;
  feesPaidUpTo: string;
  conduct: string;
  issueDate: string;
  issuedByUid: string;
}
```

---

## 6. User Roles and Permissions Matrix (ABAC)

| Capability / Resource | Super Admin | Staff / Teacher | Cash Collector | Result Operator | Student / Parent | Public Guest |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **View Public Directory & Notices** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Student / Parent Portal Access** | ✅ | ✅ | ❌ | ❌ | ✅ (Own Bio Only) | ❌ |
| **Fast Collection Desk & Thermal Rec** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Edit / Void Payment (Audit Trail)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Class Worksheet Mini-Excel Grid** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Exam Mark Entry & Grading** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Publish Exam Results** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Transfer Certificate (TC) Issue** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Discontinue / Re-admit Student** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Configure Fee Structure & Years** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Manage Staff Roles & Permissions**| ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **System Audit Logs & Security** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 7. Android, iOS, and Web Implementation Strategy

### Android (Kotlin + Jetpack Compose)
- **UI Architecture**: Single Activity with Compose Navigation, Material 3 theming with strict 60-30-10 color allocation, light/dark mode support.
- **State & Concurrency**: MVVM architecture utilizing `ViewModel`, `StateFlow`, and Kotlin Coroutines for reactive Firestore listener binding.
- **Hardware Integrations**:
  - `ESC/POS` Bluetooth printing service for instant receipts.
  - CameraX integration for student profile photo capture with local crop and thumbnail generation.
- **Offline Resilience**: Room database acting as the local single-source-of-truth cache with Firestore delta sync.

### iOS (Swift + SwiftUI)
- **UI Architecture**: Modern SwiftUI app lifecycle with NavigationStack, hierarchical split views for iPadOS/macOS Catalyst, and accessibility dynamic type.
- **State & Concurrency**: `@Observable` architecture with Swift Concurrency (`async/await`), TaskGroups, and AsyncStreams for Firestore listeners.
- **Hardware Integrations**:
  - `CoreBluetooth` service for paired wireless thermal printers.
  - Native PhotosUI and AVFoundation camera sheets for photo submissions.
- **Offline Resilience**: SwiftData / CoreData cache ensuring full read capability in low-network madrasa environments.

### Web (Next.js 15 + React 19)
- **UI Architecture**: Server Components (RSC) for zero-JS public portals and lightning-fast SEO; Client Components for complex data desks (Collection, Worksheet, Admin).
- **Design Constitution**: Follows Universal Frontend Design Constitution (anti-slop, zero-pill metadata discipline, 3-zone top bar contract, tabular figures for all monetary tables).
- **Offline & PWA**: Service Worker with asset precaching, background sync, badge updates, and web manifest for Add-to-Home-Screen installation.

---

## 8. Complete Feature Traceability Matrix

| Original Module & File | Discovered Existing Feature | Proposed Implementation in Rebuilt Architecture | Implementation Phase | Acceptance Testing Criteria |
| :--- | :--- | :--- | :--- | :--- |
| `index.html` / `index-page.js` | Public landing page with live counters and staff directory | Next.js SSR Public Portal + Native Compose/SwiftUI About Views | Phase 3 | Counters match live DB counts; accordion expands smoothly; zero layout shift. |
| `index.html` / `session-guard.js` | Multi-role universal login with Student admission search | Unified Auth Module across platforms + NestJS Auth Guard | Phase 2 | Student login with Adm+Phone works; Staff login with Email+Pass works. |
| `collection.html` / `entry-module.js` | Quick student search & multi-fee category payment | Compose / SwiftUI Fast Desk & Next.js Collection Desk | Phase 4 | Search under 50ms; calculates correct total; writes atomic payment record. |
| `collection.html` / `entry-module.js` | Thermal receipt printing & A4 PDF generation | Native Bluetooth ESC/POS + Web CSS Print & Puppeteer/PDFKit | Phase 4 | Thermal prints 58mm/80mm cleanly; PDF receipt contains all mandatory fields. |
| `collection.html` / `master-ledger-module.js` | Class-wise fee ledger matrix & pending dues balance | Tabular data grid with virtualized rows and instant filters | Phase 4 | Total dues = sum of unpaid items; updates reactively on payment. |
| `collection.html` / `history-module.js` | Payment transaction search, voiding with admin auth | Paginated History Grid with Admin Void Modal | Phase 4 | Voiding marks payment VOID; reverses dues balance; logs audit trail. |
| `worksheet.html` / `worksheet-module.js` | Mini-spreadsheet canvas with formula bar & undo/redo | Custom Canvas Data Grid with Formula Engine & Cell Selection | Phase 5 | A1 notation formulas work; A4 print preview fits pages; Excel export opens in Excel. |
| `worksheet.html` / `worksheet-module.js` | Alumni Register with Academic Year grouping & filtering | Alumni Archive tab with Year filter & complete bio fields | Phase 5 | Alumni students excluded from active totals; filterable by completion year. |
| `result.html` / `result-page.js` | Exam Schema Builder, Mark Entry Matrix, GPA engine | Dynamic Form Schema + Batch Mark Entry Grid | Phase 6 | Validates min/max marks; calculates percentages & GPA ranks accurately. |
| `result.html` / `result-page.js` | Official Transfer Certificate (TC) generator | Certified PDF Document Generator with TC numbering | Phase 6 | Sequential TC numbers; auto-populates attendance & dues clearance. |
| `admin.html` / `admin-page.js` | Discontinue & Re-admission lifecycle management | Student Continuity Engine with Gap-Year Freeze Logic | Phase 5 | Ledger freezes at departure; gap years not billed; timeline preserved. |
| `student.html` / `student-page.js` | Multi-student account switcher on single device | Local Multi-Account Vault (Encrypted SharedPreferences / Keychain) | Phase 7 | Parents can toggle children with 1 tap; instant fee summary update. |
| `sw.js` / Web PWA | Offline caching & system notifications | Service Worker + Android/iOS Local Notification Schedulers | Phase 8 | App loads offline; receives push notices when marks or receipts issued. |

---

## 9. Phased Implementation Roadmap

### Phase 1: Environment & Core Infrastructure
- Provision Firebase Firestore database (`ai-studio-feee-81b4709b-982c-4f96-b21b-c346855b9aa2`) with ABAC rules.
- Setup NestJS API Gateway with OpenAPI documentation.
- Initialize Android Compose, iOS SwiftUI, and Next.js project workspaces with shared TypeScript/Kotlin/Swift DTOs.

### Phase 2: Authentication & Authorization Framework
- Implement Firebase Auth for Staff/Admin (Email/Password with App Check).
- Implement Student ID + Phone Number credential verifier service.
- Implement session registry and heartbeat monitor to prevent dual collector conflicts.

### Phase 3: Public Portals & Student Core Engine
- Build responsive Public Portal in Next.js with verified branding and dynamic directories.
- Build Student Profile and multi-account storage vaults across Android, iOS, and Web.
- Build Student Photo submission module with camera capture and upload.

### Phase 4: Financial Collection Desk & Receipting
- Implement fast payment entry with debounce search and multi-fee category selector.
- Implement ESC/POS thermal printer engine (Bluetooth on Android/iOS; WebUSB / System Print on Web).
- Implement Master Fee Ledger, History Desk, Void Workflow, and Daily Cashier Reconciliation.

### Phase 5: Class Worksheet & Student Continuity
- Build the Excel-like Class Worksheet module with formula parser, custom columns, and A4 print engine.
- Implement Discontinue & Re-admission management with gap-year fee freezing.
- Build dedicated Alumni Register tab with Academic Year filters.

### Phase 6: Academic Results & Transfer Certificate Engine
- Build Exam Configuration, Class-wise Mark Entry Matrix, and Auto-Grade/GPA compute.
- Implement one-click Result Publishing and student report card viewer.
- Implement the Transfer Certificate (TC) generation pipeline.

### Phase 7: Administrative Governance & Audit Engine
- Build Staff invitation, role toggle, and privilege assignment interface.
- Implement comprehensive audit logging for every financial and academic mutation.
- Implement database backup and data export tools.

### Phase 8: Quality Assurance, Hardening & Multi-Platform Deployment
- Execute end-to-end integration test suite across Android devices, iPhones/iPads, and Web browsers.
- Conduct security penetration tests (ABAC rule validation, PII leak tests, offline sync stress tests).
- Build production release artifacts (APK/AAB for Google Play, IPA for Apple App Store, Vercel/Cloud Run deployment for Web).

---

## 10. Quality Assurance & Verification Plan

### Test Suites
1. **Financial Precision Testing**:
   - Zero-cent rounding errors verification on partial payments and multi-fee splits.
   - Idempotency test: duplicate payment submission prevention under network latency.
   - Gap-year billing test: ensuring discontinued students are never billed for interim years.
2. **Security & ABAC Penetration Testing**:
   - Unauthorized write rejection on `payments` and `examResults` collections.
   - PII leak check: ensure non-admin users cannot scrape student phone numbers or staff salaries.
   - App Check enforcement verification against unauthorized API calls.
3. **Cross-Platform UI & Device Testing**:
   - Android: Pixel 7, Samsung Galaxy Tab, low-end Android phone (Android 11+).
   - iOS: iPhone 15 Pro, iPhone SE (compact screen), iPad 10th Gen.
   - Web: Chrome 130+, Safari 18+, Firefox 131+, Edge.
   - Hardware: Sunmi / Epson 58mm & 80mm Bluetooth thermal printers.

---

## 11. Final Verification Checklist (Zero Feature Loss)
- [x] Public Portal Hero, Dynamic Statistics, Teachers Accordion, Committee Accordion
- [x] Public Notice Board, Gallery Swipe Viewer, Social Media link security
- [x] Student Login with Class + Name + Phone verification
- [x] Multi-Child Saved Profile Switcher on single device
- [x] Student Digital Fee Card, Itemized Dues, Downloadable Receipts
- [x] Student Exam Mark Sheet, Report Cards, Result Publishing Filter
- [x] Student Photo Submission via In-App Camera
- [x] Fast Collection Entry Desk with multi-category split
- [x] Thermal Receipt Printing (58mm/80mm) & A4 PDF Receipts
- [x] Master Fee Ledger with Class Dues Matrix & Concession tracking
- [x] Payment History with Date/Cashier Filters & Void Workflow
- [x] Daily & Monthly Collection Reports with Cashier Reconciliation
- [x] Excel Student Roster Batch Importer
- [x] Class Worksheet mini-spreadsheet with Formula Bar (SUM, AVERAGE, %)
- [x] Worksheet Print-First A4 pagination and `.xlsx` export
- [x] Dedicated Alumni Register tab with Academic Year grouping
- [x] Exam Schema Builder (Subjects, Marks, Weights, Grades)
- [x] Batch Exam Mark Entry Desk with GPA & Rank compute
- [x] Official Transfer Certificate (TC) Generator
- [x] Discontinue & Re-admission lifecycle with Gap-Year Fee Freezing
- [x] Academic Year Configuration & Class Section definitions
- [x] Staff Role-Based Access Control (Admin, Collector, Result Operator)
- [x] Session Registry & Device Heartbeat Monitoring
- [x] Immutable System Audit Logs
- [x] Service Worker Offline Caching & Local Push Notifications
