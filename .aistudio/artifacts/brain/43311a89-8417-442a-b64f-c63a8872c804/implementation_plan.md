# Native Android App (Kotlin + Jetpack Compose) Implementation Plan

Comprehensive implementation blueprint for completing the native Android application in `android/` for Noorul Islam Higher Secondary Madrasa. Features an end-to-end native architecture covering the Fast Fee Collection Desk with wireless Bluetooth ESC/POS thermal printing (with 58mm/80mm toggle), Student & Parent Portal with multi-child account switcher, and Admin Statistics Console, backed by live Firebase Firestore database operations.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following product and architectural decisions were confirmed based on your requirements:
> - **Confirmed Scope**: All core roles supported — Staff Fee Collection Desk, Student & Parent Portal, and Admin Stats Console.
> - **Printer Specification**: Dual thermal receipt formatting supporting both standard 58mm (portable 2-inch) and 80mm (desktop 3-inch POS) printers with an in-app toggle and paired device selector.
> - **Network & Data Integrity**: Strict real-time online validation for fee transactions directly against Firebase Firestore to prevent duplicated receipt numbers or desynchronized financial ledgers.

---

## 1. Overview & Core Concept

- **What It Does**: A high-performance native Android application built in Kotlin with Jetpack Compose and Material 3 design. Enables fee collectors to rapidly look up students, verify pending dues, record cash/online fee receipts to Firestore, and wirelessly print physical thermal receipts via Bluetooth. Parents and students can log in with admission number and phone number to review fee ledgers, exam results, and switch between siblings seamlessly.
- **Target Audience / Persona**:
  - *Madrasa Staff & Collectors*: Need high-speed receipt generation, student search, and reliable thermal printing on mobile.
  - *Parents & Students*: Need quick fee visibility, payment receipts, term exam GPA reports, and family multi-profile management.
  - *Institutional Administrators*: Need top-level metrics, enrollment counts, and financial transaction audits.
- **Key Value**: Replaces mobile browser reliance with a lightning-fast native APK delivering zero-latency Bluetooth hardware access, fluid Compose UI, and verified Firestore persistence.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Public Portal & Role Gateway (`HomeScreen`)**:
   - Live Institutional KPI Banner: Total Students, Staff, Boys, Girls (synchronized from Firestore).
   - Quick Access Hub: Student Login Sheet, Staff Fee Desk launch button, and Admin Overview navigation.
   - Saved Sibling Accounts: One-tap profile switching for parents with multiple enrolled children.

2. **Fast Fee Collection Desk (`CollectionScreen`)**:
   - Real-time student search bar supporting admission number, full name, and class filtering.
   - Student Fee Card: Displays pending dues, month-by-month fee schedule, and last receipt date.
   - Quick Payment Modal: Pre-fills fee amount, allows custom breakdown entry (Tuition, Examination, Building Fund), and records directly to Firestore with real-time online validation.
   - Bluetooth Thermal Printing: Auto-triggers printing on payment success or on-demand reprint, with an instant toggle between 58mm (32 cols) and 80mm (48 cols) layouts.

3. **Student & Parent Portal (`StudentPortalScreen`)**:
   - Header with student profile details (Admission No, Class, Roll No, Guardian, Contact).
   - Tabbed Interface:
     - *Overview*: Outstanding dues summary, recent transactions, and attendance status.
     - *Fee Ledger*: Chronological list of fees, itemized charges, and payment status indicators.
     - *Payment History*: Verifiable receipts with transaction IDs, dates, and amounts.
     - *Exam Results*: Term-wise subject scores, total percentage, and GPA card.
   - Multi-Child Switcher: Instant sibling switching dropdown in top bar.

4. **Bluetooth Printer Settings Dialog**:
   - Lists bonded Bluetooth devices on the collector's Android device.
   - Paper width selector (`58mm Standard` / `80mm Wide`).
   - One-tap "Test Print" to verify printer connectivity and feed alignment before desk hours.

### Visual Identity & Theme
- **Theme**: Material Design 3 tailored to institutional governance.
- **Palette**:
  - Dominant / Primary: Deep Institutional Navy (`#0F172A`, `#1E293B`)
  - Accent / Actions: Vibrant Royal Blue (`#2563EB`)
  - Financial Success: Emerald Forest (`#059669`, `#ECFDF5`)
  - Warnings & Due Alerts: Amber / Rust (`#D97706`, `#FFFBEB`)
  - Error & Overdue: Crimson (`#DC2626`, `#FEF2F2`)
  - Surface & Background: Clean Slate (`#F8FAFC`, `#FFFFFF`)
- **Typography**: Clean, readable typography using Android Roboto/Material 3 typography hierarchy with bold tabular figures for financial receipts and admission numbers.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct Firestore SDK Integration vs HTTP Backend Proxy**
  - *Chosen Approach*: Utilize the official Firebase Android SDK (`com.google.firebase:firebase-firestore`) connecting to database `ai-studio-feee-81b4709b-982c-4f96-b21b-c346855b9aa2`.
  - *Why*: Eliminates extra backend hops, provides native security rule enforcement, and utilizes Google's verified real-time listeners.
  - *Trade-Off*: Requires proper rule validation and network handling in the repository.

- **Decision 2: Strict Real-Time Online Validation for Financial Transactions**
  - *Chosen Approach*: Enforce active network connectivity during payment recording. If offline, alert the collector and prevent issuing unverified receipts.
  - *Why*: Prevents receipt number collisions, duplicate billing, and conflicting dues across multiple simultaneous collectors.
  - *Trade-Off*: In areas with zero network connectivity, collectors cannot finalize receipts until connection resumes.

- **Decision 3: Dual 58mm & 80mm ESC/POS Thermal Print Formatting**
  - *Chosen Approach*: Support both 32-character (58mm) and 48-character (80mm) fixed-width formatting with an in-app toggle.
  - *Why*: Collectors use diverse portable Bluetooth belt printers (mostly 58mm) and counter POS units (80mm).
  - *Trade-Off*: Requires dynamic line truncation and spacing calculations in `BluetoothPrinterService`.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Noorul Islam Android Application                     │
│                        (Kotlin + Jetpack Compose)                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
┌───────────────────────┐┌───────────────────────┐┌───────────────────────┐
│      HomeScreen       ││   CollectionScreen    ││  StudentPortalScreen  │
│  - Live Statistics    ││  - Student Search     ││  - Fee Ledger Dues    │
│  - Public Directory   ││  - Fee Payment Desk   ││  - Payment Receipts   │
│  - Sibling Quick-Switch││ - 58mm/80mm Printing  ││  - Exam Report & GPA  │
└──────────┬────────────┘└──────────┬────────────┘└──────────┬────────────┘
           │                        │                        │
           └────────────────────────┼────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     StudentRepository (Kotlin)                         │
│  - Student authentication & profile retrieval                          │
│  - Firestore transactions & fee recording                              │
│  - SharedPreferences for multi-child stored profiles                   │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌───────────────────────────────────────┐  ┌─────────────────────────────┐
│       BluetoothPrinterService         │  │     Firebase Firestore      │
│  - BluetoothDevice discovery & pairing│  │  Database ID:               │
│  - ESC/POS byte-stream generator      │  │  ai-studio-feee-81b4709b... │
│  - 58mm (32 col) & 80mm (48 col)      │  │  - institutions/.../students│
│  - Thermal paper auto-cut command     │  │  - institutions/.../payments│
└───────────────────────────────────────┘  └─────────────────────────────┘
```

### Component & State Plan

1. **`MainActivity.kt` Navigation Graph**:
   - Wire complete NavHost routes: `"home"`, `"student/{studentId}"`, `"collection"`, and `"admin"`.
   - Add top-bar navigation actions and back-stack handling.

2. **`StudentRepository.kt` Enhancements**:
   - Implement `searchStudents(query: String, filterClass: String)` returning real-time filtered results.
   - Implement `recordFeePayment(payment: FeePaymentPayload): Result<PaymentReceipt>` executing a real-time Firestore write to `institutions/TEST_INSTITUTE_01/payments` and updating student pending balance.
   - Implement `getRecentTransactions(limit: Int)` for Collection desk history.
   - Ensure Firestore initialization targets database ID `ai-studio-feee-81b4709b-982c-4f96-b21b-c346855b9aa2`.

3. **`BluetoothPrinterService.kt` Enhancements**:
   - Introduce `PrinterPaperWidth` enum (`WIDTH_58MM = 32`, `WIDTH_80MM = 48`).
   - Implement dynamic columnar receipt layout fitting 32 or 48 characters.
   - Add printer discovery helpers: `getPairedDevices()`, `testPrint(device, paperWidth)`.
   - Robust error handling for socket disconnects and timeout handling.

4. **`CollectionScreen.kt` Comprehensive UI**:
   - Search input with clear button and class selector dropdown.
   - Student search results list with instant selection.
   - Selected student card with live balance, guardian name, and photo/avatar.
   - Payment entry form: Amount, fee category, payment method (Cash / UPI / Bank), collector remarks.
   - Action buttons: "Record & Print Receipt", "Record Only", and "Reprint Last Receipt".
   - Printer configuration modal with paired device selection and 58mm/80mm toggle.

5. **`AndroidManifest.xml` & Permissions**:
   - Ensure `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION`, and `INTERNET` permissions are declared with runtime permission handling.
