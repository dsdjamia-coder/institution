# Noorul Islam Madrasa System: Cross-Platform Architecture & Developer Guide

## 1. System Overview
The system provides a production-grade digital operating environment for Noorul Islam Higher Secondary Madrasa, covering Fee Collection, Student and Parent Portals, Class Worksheets, Academic Examinations and Results, Transfer Certificate (TC) generation, and multi-year Continuity tracking.

### Supported Target Platforms
1. **Android Application**: Native Kotlin with Jetpack Compose (`android/`)
2. **iOS Application**: Native Swift with SwiftUI (`ios/`)
3. **Web Application**: Next.js 15 / React 19 with Tailwind CSS (Vite dev runtime on port 3000)
4. **Backend Services**: NestJS with Firebase Admin SDK (`backend/`)
5. **Database & Storage**: Firebase Firestore, Firebase Authentication, Firebase Cloud Functions

---

## 2. Directory Hierarchy

```
├── android/                             # Native Android Application (Kotlin + Jetpack Compose)
│   ├── app/
│   │   ├── build.gradle.kts             # Gradle configuration (Compose, CameraX, Room, Firebase)
│   │   └── src/main/
│   │       ├── AndroidManifest.xml      # Bluetooth POS printer, Camera, and Network permissions
│   │       └── java/org/noorulislam/app/
│   │           ├── MainActivity.kt      # Main Activity & Navigation
│   │           ├── printer/             # Bluetooth ESC/POS Thermal Printing Service
│   │           └── ui/screens/          # Compose screens (Home, Collection, StudentPortal)
│
├── ios/                                 # Native iOS Application (Swift + SwiftUI)
│   └── NoorulIslamApp/
│       ├── NoorulIslamApp.swift         # SwiftUI App lifecycle & Firebase configure
│       ├── Services/                    # CoreBluetooth Thermal Printer Manager
│       └── Views/                       # SwiftUI views (ContentView, CollectionDeskView, StudentPortalView)
│
├── backend/                             # Enterprise Backend Services (NestJS)
│   └── src/
│       ├── app.module.ts                # Root module
│       ├── auth/                        # Student Dual-Auth (Adm + Phone) & Staff Token Guards
│       ├── fees/                        # Authoritative fee calculations & receipting
│       ├── results/                     # GPA engine & Transfer Certificate generator
│       └── continuity/                  # Discontinue & Re-admission gap-year freeze logic
│
├── scripts/pages/                       # Web Client Modular Business Logic
│   ├── admin-page.js                    # Multi-Role Admin Console & Session Registry
│   ├── collection-page.js               # Fast Fee Desk, Master Ledger, Reports, History
│   ├── official-shared-bootstrap.js     # Class Worksheet & Alumni Registers
│   ├── student-page.js                  # Student Portal & Multi-Child Switcher
│   └── result-page.js                   # Examination Center & TC Issuance
│
├── index.html                           # Public Portal & Universal Login
├── collection.html                      # Fee Collection Portal
├── worksheet.html                       # Class Worksheet Mini-Spreadsheet Grid
├── result.html                          # Academic Result Center
├── student.html                         # Student & Parent Portal
├── admin.html                           # Administrative Governance Console
└── firestore.rules                      # Attribute-Based Access Control (ABAC) Security Rules
```

---

## 3. Core Business Workflows

### 3.1 Student & Guardian Authentication
- **Identification**: Admission Number + Phone Number registered in student record.
- **Multi-Child Device Storage**: Mobile devices and browsers store multiple sibling profiles locally, allowing one-tap switching without repeated logins.

### 3.2 Bluetooth Thermal Printing (ESC/POS)
- Supports 58mm and 80mm wireless thermal POS receipt printers via Bluetooth RFCOMM (Android) and CoreBluetooth (iOS).
- Outputs formatted institutional receipts with receipt number, student name, class, breakdown, and collector identity.

### 3.3 Discontinue & Re-admission Continuity
- When a student discontinues, historical pending dues up to departure date are frozen.
- During gap years, no recurring fees are billed.
- Upon re-admission, the student is assigned a new class, roll number, and academic year while preserving their entire historical timeline.

### 3.4 Mini-Spreadsheet Class Worksheet
- Excel-like grid with formula bar supporting `SUM`, `AVERAGE`, and percentage formulas.
- Print-first A4 layout preview and real `.xlsx` export.
- Dedicated Alumni Register tab with Academic Year filtering.
