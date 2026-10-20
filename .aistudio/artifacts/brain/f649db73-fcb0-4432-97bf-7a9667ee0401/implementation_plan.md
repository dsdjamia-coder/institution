# Implementation Plan: Pure Native Android Jetpack Compose Index & Student Portal

## Executive Summary
This architectural plan establishes the development of **pure native Android Kotlin Jetpack Compose** screens for Phase 1 of the standalone Android APK. Eliminating webviews and external web server dependencies, the Android APK will run 100% natively on device hardware, connecting directly to the live Firebase Firestore database (`ai-studio-feee-81b4709b-982c-4f96-b21b-c346855b9aa2`) to provide the exact visual design, real-time statistics, student login, multi-child account switcher, itemized fee ledgers, and exam result scorecards of the original application.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Architecture Choice**: Pure Native Kotlin Jetpack Compose (No WebViews or external URLs).
> - **Data Persistence**: Direct live connection to the institution's Firebase Firestore database.
> - **Phase 1 Target**: 
>   1. **Index Screen (Home)**: Exact hero section, live stats cards (Students, Teachers, Male, Female), About section, and Student Login dialog with Class selector and Admission+Phone verification.
>   2. **Student Portal Screen**: Complete student profile, multi-child switcher, outstanding dues card, itemized fee ledger, recent receipts, and exam results.

---

## 1. Overview & Core Concept
The Android APK operates as a self-contained, lightning-fast native Android application. It directly interfaces with Firebase Firestore using the native Android Firebase SDK (`com.google.firebase:firebase-firestore-ktx`), ensuring:
- **Instant Launch**: Loads immediately on the phone without network latency or "Page Not Found" errors.
- **Offline & Low-Bandwidth Capability**: Firestore's native offline persistence caches student bio and fee records on the phone.
- **Visual Fidelity**: Replicates the exact typography, navy/slate color palette (`#0F172A`, `#2563EB`, `#F8FAFC`), card hierarchy, and badges of the web system in Jetpack Compose.

---

## 2. Screen Specifications & User Experience

### 1. Native Index Screen (`HomeScreen.kt`)
- **Top App Bar**: Institution logo, name *"Noorul Islam Higher Secondary Madrasa"*, Reg No *"4883"*, and Place.
- **Hero Banner**:
  - Center-aligned institutional crest with rounded badge container.
  - Institution Title and *"Excellence in Islamic & Moral Education"*.
  - Primary Action Button: **"Student Login"** (opens bottom sheet modal).
  - Secondary Action Buttons: Teachers, Notifications, About.
- **Real-Time Live Counters (Live Firestore)**:
  - Blue Card: Total Active Students count.
  - Amber Card: Total Teachers/Staff count.
  - Green Card: Male Students count.
  - Teal Card: Female Students count.
- **Interactive Student Login Sheet**:
  - Class Dropdown: Class 1 through Class 10 + Alumni.
  - Search Input: Student Admission Number or Name.
  - Password Input: Mobile Number with show/hide password toggle icon.
  - Live Validation: Queries Firestore `institutions/TEST_INSTITUTE_01/students` where `admNo == enteredAdm` and verifies phone number.
  - Success State: Saves student account locally (Room / SharedPreferences) and navigates to Student Portal.

### 2. Native Student Portal (`StudentPortalScreen.kt`)
- **Top Profile Header**:
  - Student photo / avatar placeholder, Name, Admission No, and current Class badge.
  - **Multi-Child Switcher**: Tap to switch between saved siblings without re-entering credentials.
- **Outstanding Fee Card**:
  - Prominent alert container displaying current pending dues in INR (e.g., `₹450.00`).
  - Due status breakdown (Tuition, Bus Fee, Special Funds).
- **Navigation Tabs**:
  - **Overview**: Bio details (Guardian name, phone, date of birth, blood group, address).
  - **Fees**: Itemized fee breakdown table, paid vs pending amounts, and historical receipts with receipt number and date.
  - **Results**: Exam selector (First Term, Mid Term, Annual), Subject marks, Grade (A+, A, B), Percentage, and Pass/Fail status.
  - **Notifications**: System announcements and fee due reminders.
- **Logout Action**: Securely log out or clear saved profiles.

---

## 3. Technical Architecture & Component Structure

```
┌────────────────────────────────────────────────────────────────────────┐
│                     ANDROID NATIVE APPLICATION LAYER                   │
│                                                                        │
│   MainActivity.kt                                                      │
│   ├── NavigationHost (Jetpack Compose Navigation)                      │
│   │   ├── "home" -> HomeScreen (Hero, Live Stats, Login Modal)         │
│   │   └── "student_portal/{studentId}" -> StudentPortalScreen          │
│   │                                                                    │
│   └── ViewModels & Repositories                                        │
│       ├── MainViewModel (Queries live Firestore institution counts)     │
│       └── StudentViewModel (Queries student profile, fees, & marks)    │
│                                                                        │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Direct Firebase SDK (gRPC)
┌────────────────────────────────────▼───────────────────────────────────┐
│               FIRESTORE DATABASE (LIVE CLOUD FIRESTORE)                │
│                                                                        │
│   institutions/TEST_INSTITUTE_01/                                      │
│   ├── students/{studentId} (Live Roster, Bio, Dues, Trajectory)        │
│   ├── academicYears/{yearId}/feeItems/ (Class Fee Schedules)           │
│   ├── payments/{paymentId} (Payment Transactions & Receipts)           │
│   └── examResults/{resultId} (Student Marks, Grades, & GPA)            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Steps (Phase 1)
1. **Repository & Data Layer**:
   - `StudentRepository.kt`: Methods for `authenticateStudent(admNo, phone)`, `getInstitutionStats()`, `getStudentDetails(studentId)`, `getStudentPayments(studentId)`, and `getStudentResults(studentId)`.
2. **UI Screens**:
   - `HomeScreen.kt`: Hero, Live Stats cards, About Us, and Student Login BottomSheet.
   - `StudentPortalScreen.kt`: Multi-child switcher, Profile card, Outstanding fee banner, Receipts list, and Exam Marksheet.
   - `MainActivity.kt`: Navigation controller wiring Home and Student screens.
3. **Local Profile Vault**:
   - `StudentSessionManager.kt`: Encrypted SharedPreferences storing saved sibling profiles for 1-tap switching.
4. **Build & Release**:
   - Clean compilation in GitHub Actions produces `noorul-islam-madrasa.apk` ready for installation on any phone.
