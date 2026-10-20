# Android Landing Page & Student Portal Exact Web Design Synchronization

Align the native Android application (`android/`) to mirror the exact visual design, color tokens, layout hierarchy, and Firestore data structures of the web application (`index.html` and `student.html`).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following product and design choices were confirmed based on your requirements:
> - **Full Public Landing Page**: `HomeScreen.kt` will feature the complete set of web landing sections: Hero with centered logo, Title & Subtitle, 4-color Stat Cards (STUDENTS, TEACHERS, MALE, FEMALE), About Us card, Teachers directory, Notifications grid with interactive details modal, Swipeable Gallery, Social links, and Version footer.
> - **Exact Student Portal Match**: `StudentPortalScreen.kt` will mirror `student.html`'s ID Badge card, avatar, Academic Year badge, Parent/Bio details, Tabbed Fee Details with green/red status badges, and Examination GPA cards with subject score tables.
> - **PDF Export & Native Android Share**: Official fee payment receipts and exam report cards can be generated as formatted PDF documents and shared directly via Android's native Share Sheet (`Intent.ACTION_SEND`).
> - **Unified Firestore Database**: All data flows directly from the live Firestore database (`ai-studio-feee-81b4709b-982c-4f96-b21b-c346855b9aa2`) under `institutions/TEST_INSTITUTE_01`.

---

## 1. Overview & Core Concept

- **What It Delivers**: A 1:1 native Android Kotlin + Jetpack Compose translation of the Madrasa Web Application's two core screens:
  1. **Landing Screen (`HomeScreen.kt`)**: Replicates the public web portal (`index.html`) including top navigation header, hero banner, live 4-color stats grid, about us section, teachers list, notifications with popup details dialog, gallery swipe list, institutional footer, and the floating/modal student login sheet with autocomplete and password reveal.
  2. **Student Portal (`StudentPortalScreen.kt`)**: Replicates the authenticated student dashboard (`student.html`) with student ID badge, multi-child sibling profile switcher, tabbed navigation (Profile Details, Fee Ledger with dues summary, Exam Results with subject table), and PDF generation with Android native share.
- **Target Audience**: Students, parents, teachers, and guardians accessing the Noorul Islam Madrasa system via the native Android APK.

---

## 2. User Experience & Visual Design

### 2.1 Landing Page (`HomeScreen.kt` ↔ `index.html`)

- **Top Navigation Bar**:
  - Left: Institutional Emblem (`assets/images/logo.png`)
  - Center: "Noorul Islam Higher Secondary Madrasa" with registration number & place
  - Right: Login button (`.login-btn-nav`) and hamburger menu
- **Hero Section**:
  - Elevated squircle institution logo (130dp) with subtle shadow
  - Main Title: "Noorul Islam Higher Secondary Madrasa" (Poppins 800 / Plus Jakarta Sans)
  - Subtitle: "Excellence in Islamic & Moral Education" (Accent Blue `#2563EB`)
  - Info line: "Reg No: 4883 | Koduvally, Kozhikode"
  - Primary Action Button: "Login" (pill shape with lock icon)
  - Secondary Action Buttons: "Teachers", "Notices", "Gallery"
- **4-Color Stats Grid**:
  - `STUDENTS`: Blue border accent (`#3B82F6`), `USERS` icon, live student count
  - `TEACHERS`: Yellow border accent (`#F59E0B`), `CHALKBOARD_USER` icon, staff count
  - `MALE`: Green border accent (`#22C55E`), `PERSON` icon, male count
  - `FEMALE`: Teal border accent (`#14B8A6`), `PERSON_DRESS` icon, female count
- **Public Content Sections**:
  - *About Us*: Description card with blue title accent underline
  - *Teachers*: Horizontal scrollable teacher cards with avatars, names, and subjects
  - *Notifications*: Notice cards with date badge and tap-to-expand modal dialog
  - *Gallery*: Horizontal image cards with zoom preview dialog
  - *Footer*: Social icons (WhatsApp, Facebook, YouTube, Instagram), email/phone links, copyright, and version tag (`v2.6.0`)
- **Student Login Bottom Sheet**:
  - Class dropdown (Class 1 to 10 + Alumni)
  - Student Name or Admission Number autocomplete suggestions
  - Password (Mobile Number) field with eye visibility toggle
  - Saved Sibling Accounts list with instant selection

### 2.2 Student Portal (`StudentPortalScreen.kt` ↔ `student.html`)

- **Header & Profile ID Badge Card**:
  - Blue-to-indigo gradient top banner with "Student Profile" pill badge
  - Student avatar with circular border
  - Student Name, Class badge, "Active" status badge, Gender badge, Admission Number, UID, and Academic Year badge (`2025-2026`)
- **Navigation Tabs**:
  - *Profile Tab*: Father's Name & Phone, Mother's Name & Phone, Address, Fee Concession & Sibling Group
  - *Fee Details Tab*: Class & Academic Year badge, categorized fee cards (Tuition, Exam, Welfare) with Green "Paid" / Red "Pending" badges, and Summary Totals banner
  - *Exam Results Tab*: Term exam selector, Total Marks & Percentage, GPA badge (`3.8 / 4.0`), Status badge (`PASSED`), and subject scores table (Quran, Fiqh, History, Arabic)
- **PDF Generation & Native Android Share**:
  - "Download / Share Receipt" button on verified payments generating formatted Android PDF document using Android `PdfDocument` API.
  - Automatically triggers Android `Intent(Intent.ACTION_SEND)` to share the PDF via WhatsApp, Drive, or print directly to system print services.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Native Canvas / `PdfDocument` API for Receipt & Report Cards**
  - *Chosen Approach*: Use Android's built-in `android.graphics.pdf.PdfDocument` API to draw the receipt/exam report directly to an output PDF file in app cache and invoke `FileProvider` with `Intent.ACTION_SEND`.
  - *Why*: Requires zero external heavy third-party dependencies, generates razor-sharp vector text matching the web jspdf layout, and works 100% offline.
- **Decision 2: Replicating Web CSS Tokens in Compose Theme**
  - *Chosen Approach*: Define exact color tokens matching `styles/main.css` (`Slate900`, `Slate800`, `Blue600`, `Emerald600`, `Amber500`, `Teal500`, etc.) and typography styles matching Poppins & Plus Jakarta Sans.
  - *Why*: Ensures pixel-level fidelity with the web app while maintaining Compose fluidity and hardware acceleration.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Noorul Islam Android App                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────────────┐
│              HomeScreen               │ │          StudentPortalScreen          │
│  - Top Header with Logo               │ │  - ID Badge with Gradient Header      │
│  - Hero (Title, Subtitle, Login Pill) │ │  - Avatar, Badges & Academic Year     │
│  - 4-Color Stat Cards (Blue,Yellow...)│ │  - Profile Bio (Father, Mother, Addr) │
│  - About Us, Teachers, Notices, Gal   │ │  - Fee Ledger (Paid/Pending Badges)   │
│  - Footer with Version & Socials      │ │  - Exam GPA & Subject Score Table     │
│  - Login Modal (Autocomplete & Eye)   │ │  - Native PDF Document & Share Sheet  │
└──────────────────┬────────────────────┘ └──────────────────┬────────────────────┘
                   │                                         │
                   └────────────────────┬────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        StudentRepository.kt                            │
│  - fetchPublicSections() -> About, Teachers, Notices, Gallery          │
│  - getInstitutionStats() -> Students, Staff, Boys, Girls               │
│  - authenticateStudent() -> Admission No + Phone validation            │
│  - getStudentProfile(), getStudentPayments(), getStudentExamReport()   │
│  - generateStudentPdfReceipt(context, receipt) -> File                 │
└───────────────────────────────────────┬────────────────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Firebase Firestore (Live Database)                     │
│               ai-studio-feee-81b4709b-982c-4f96-b21b-c346855b9aa2       │
│  - institutions/TEST_INSTITUTE_01/students                             │
│  - institutions/TEST_INSTITUTE_01/payments                             │
│  - institutions/TEST_INSTITUTE_01/notices                              │
│  - institutions/TEST_INSTITUTE_01/staff                                │
└────────────────────────────────────────────────────────────────────────┘
```

### Component & State Plan

1. **`StudentModels.kt` Data Models**:
   - `TeacherProfile(id, name, role, phone, photoUrl)`
   - `NoticeItem(id, title, date, description, category)`
   - `GalleryItem(id, title, imageUrl)`
   - `PublicInstitutionalData(aboutUs, teachers, notices, gallery)`
   - `StudentProfile` enriched with `fatherName`, `fatherPhone`, `motherName`, `motherPhone`, `academicYear`, `uid`.

2. **`StudentRepository.kt` Enhancements**:
   - Implement `getPublicInstitutionalData()` fetching live notices, teachers, and about text from Firestore (with fallbacks matching the verified web content).
   - Implement `generateStudentPdfReceipt(receipt: PaymentReceipt): Uri` using Android's native `PdfDocument` and `FileProvider`.

3. **`HomeScreen.kt` Redesign**:
   - Full scrollable page: Sticky Header, Hero Banner, 4-Color Stat Cards with left color accent lines, About Us, Teachers Carousel, Notifications Grid with Details Dialog, Gallery Grid with Image Zoom Dialog, Footer with Socials & Version.
   - Interactive Student Login Sheet with autocomplete suggestions and password toggle.

4. **`StudentPortalScreen.kt` Redesign**:
   - ID Badge Card matching `student.html` with blue-indigo gradient, avatar, badges, and academic year.
   - Profile Details grid with Father/Mother contacts and address.
   - Fee Details tab with colored status chips, totals banner, and PDF receipt download/share button.
   - Exam Results tab with GPA badge, passing status, and score table.
