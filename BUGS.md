# Institutional Web App — Bug Triage Sheet (BUGS.md)
*Framework: The Triage Kit by Mohammed Junaid (@mdjunaidap, Codikko Academy)*
*Prioritization Principle: "No new feature until the Red list is empty. ആദ്യം triage, പിന്നെ feature."*

---

## 🔴 RED LIST (Fix Today — Blocks user: can't log in, can't pay, or loses data)

### 1. Photo upload over 5 MB has no pre-read guard and can crash mobile forms
- **Where**: `admin.html`, `scripts/pages/admin-page.js` (`setupAdminPhotoWidget`), `scripts/pages/student-page.js`
- **Blocks user?**: Yes (Mobile tab crashes due to Base64 out-of-memory on 10MB+ camera images; student/staff form input is lost)
- **Users affected**: Anyone uploading raw phone camera photos (approx 3/5 users on mobile)
- **Repeat steps**:
  1. Open Admin -> Add Student (or Student Portal -> Edit Profile).
  2. Fill in all student bio fields.
  3. Click Photo Upload and select a 12MB-18MB raw camera JPG/PNG.
  4. Notice: `FileReader.readAsDataURL` executes without checking `file.size > 5MB`. On budget phones, browser tab reloads or freezes, losing the entire filled form.
- **Fix Applied**: 
  - Added `safelyPrepareImageForCropping` in both `admin-page.js` and `student-page.js`.
  - Rejects files $>15\text{MB}$ with a clear alert.
  - Uses `URL.createObjectURL` (zero-copy memory pointer) and downscales via offscreen Canvas to $\le 1200\text{px}$ before generating a lightweight $\approx 150\text{KB}$ JPEG for `InteractiveCropper`.
  - Added modal restoration state so canceling crop never loses or resets typed form data.
- **Status**: [x] Fixed & Verified

### 2. Sibling Group Fee disparity in Student Ledger vs Collection Counter
- **Where**: `scripts/pages/admin-page.js` (`getStudentDetailedPendingFees`, `populateStudent360FeesLedger`) vs `scripts/pages/collection-page.js`
- **Blocks user?**: Yes (Financial ledger mismatch: Collection desk charges group rate, but Admin profile ledger billed individual standard dues)
- **Users affected**: All students enrolled in sibling discount groups
- **Repeat steps**:
  1. Add 2 siblings to a group with monthly fee = ₹300 (or ₹150 each).
  2. Go to Admin -> Manage Students -> Student 360° Profile -> Fees Ledger.
  3. Dues calculation calculates monthly fees using standard ₹200 fee head instead of factoring in the student's sibling group rate.
- **Fix Applied**: 
  - Added `getStudentEffectiveMonthlyFee(student, targetAcademicYear)` in `admin-page.js`.
  - Evaluates active group membership for the target academic year and computes proportional member share (`Math.round(group.fee / group.memberIds.length)`).
  - Matches payments by `billingGroupId === studentGroup.id` in `getStudentDetailedPendingFees` and `populateStudent360FeesLedger`.
- **Status**: [x] Fixed & Verified

### 3. Password recovery mechanism (Forgot Password)
- **Where**: `admin.html`, `index.html`, `official.html`
- **Blocks user?**: No — By institution design, Super Admin manages all staff and user accounts directly from Admin Portal.
- **Status**: [~] Skipped by User Instruction (Super Admin directly handles credentials)

---

## 🟡 YELLOW LIST (Fix This Week — Doesn't block, but slows down or confuses users)

### 4. Student search is restricted to Name and Admission No (Misses Phone & UID)
- **Where**: `scripts/pages/admin-page.js` (`renderStudentList`, `getManagedStudentsForExport`), `admin.html`
- **Blocks user?**: No (Has workaround: admin must scroll or filter by class)
- **Users affected**: High (Office staff frequently search by parent mobile phone, Aadhaar, or student UID)
- **Repeat steps**:
  1. Open Admin -> Manage Students.
  2. Search by parent's 10-digit phone number, Aadhaar, or UID.
  3. Filter returns "No students found" because search only inspected `s.name` and `s.adm`.
- **Fix Applied**: 
  - Created `matchesStudentSearch(s, term)` helper in `admin-page.js`.
  - Searches across `name`, `adm`, `uid`, `father`, `mother`, `guardian`, and matches 3+ digits against `mobile`, `motherMobile`, `phone`, and `adhaar` / `aadhaar`.
  - Updated placeholder in `admin.html` to `"Search name, adm, phone, UID..."`.
- **Status**: [x] Fixed & Verified

### 5. Heavy initial snapshot downloads on low-bandwidth mobile networks
- **Where**: `scripts/pages/admin-page.js` (`onSnapshot` on `auditLogs`)
- **Blocks user?**: No (It eventually loads, but takes unnecessary bandwidth downloading thousands of historical audit logs)
- **Users affected**: Staff accessing admin on cellular data
- **Repeat steps**:
  1. Throttle network in DevTools.
  2. Load `admin.html`.
  3. Notice lag as entire multi-year audit logs collection is streamed into memory.
- **Fix Applied**: 
  - Applied `query(collection(db, ...), orderBy('createdAt', 'desc'), limit(50))` on real-time `auditLogs` listener in `admin-page.js`.
  - Added graceful fallback to unconstrained query if index is absent.
  - Added visual "Live Sync" badge in admin header.
- **Status**: [x] Fixed & Verified

---

## 🟢 GREEN LIST (Fix Later — Looks, formatting, styling, polish)

### 6. Inconsistent currency formatting (Raw numbers vs localized ₹ formatting)
- **Where**: `scripts/shared/app-common.js`, `scripts/pages/collection-page.js`, `scripts/pages/admin-page.js`
- **Blocks user?**: No (Only cosmetic display)
- **Users affected**: All users viewing fee values
- **Repeat steps**:
  1. Open Collection Desk -> Student profile.
  2. Notice some values show `₹${s.concessionFee}` raw without Indian numbering format (`₹200` vs `₹200.0` or missing thousand separators).
- **Fix Applied**: 
  - Standardized `formatCurrency` in `app-common.js` using `Intl.NumberFormat('en-IN')`.
  - Integers format without decimals (`₹1,200`), fractions format with 2 digits (`₹1,200.50`).
  - Standardized all raw currency interpolations across `collection-page.js` and `admin-page.js`.
- **Status**: [x] Fixed & Verified

### 7. Fixed dimensions on small logo badges on high-DPI displays
- **Where**: `styles/main.css`, `admin.html`, `index.html`
- **Blocks user?**: No (Purely visual aesthetics)
- **Users affected**: Users on high-density Retina/mobile screens
- **Repeat steps**:
  1. Inspect header logo on 3x mobile display.
  2. Notice downscaling to `w-8 h-8` without CSS crisp rendering creates slight pixel softening.
- **Fix Applied**: 
  - Added `image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; object-fit: contain;` for all institution logos (`#admin-header-logo`, `#admin-loader-logo`, `#header-logo`, `#hero-logo-img`, `#splash-logo-img`, `#web-logo-preview`, `.logo-container img`, `.header-logo-box img`, `.hero-logo-target img`) in `styles/main.css`.
- **Status**: [x] Fixed & Verified

---

## 📋 Triage Action Protocol
1. **Rule 1**: Fix one bug at a time, red list first.
2. **Rule 2**: No new feature until the Red list is empty.
3. **Rule 3**: Any new reported issue must be triaged into Red, Yellow, or Green before writing any code.
