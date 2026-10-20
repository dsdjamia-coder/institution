# Android Real Firestore Synchronization & Web Parity Plan

Eliminate all dummy data, hardcoded classes, and mock profiles from the native Android application (`android/`). Replace them with real-time Firebase Firestore listeners that mirror the exact web architecture (`index-page.js`, `student-page.js`, `collection-page.js`, and `admin-page.js`).

---

### User Review & Clarifications Confirmed

> [!IMPORTANT]
> The following requirements have been confirmed based on your specifications:
> - **Real-Time Dynamic Classes & Students**: Remove the hardcoded 10 classes (`Class 1` to `Class 10`). Classes and enrolled students will be synchronized dynamically using real-time Firestore listeners (`onSnapshot`) on `institutions/TEST_INSTITUTE_01/students` and `institutions/TEST_INSTITUTE_01/classes`, matching the web app's `distinctClasses` logic.
> - **Strict Authentication & Missing Phone Warning**: Verify login against student's registered mobile numbers (`fatherPhone`, `primaryMobile`, or `studentMobile`). If no phone number is registered in Firestore, display an explicit warning directing the student/parent to contact the madrasa office.
> - **Full Exam Report Card with Detailed Breakdown**: Display real exam results loaded from Firestore with subject-wise marks, grades, total percentage, and pass/fail status.
> - **Fix Kotlin Compilation Errors**: Resolve all unresolved icon references (`Chalkboard`, `PhoneVolume`) and access modifiers (`Amber500`, `Emerald500`) causing Gradle build failures in `HomeScreen.kt` and `StudentPortalScreen.kt`.
> - **Zero Dummy Data**: Strip out all static mock names ("Mohammed Irfan", "Abdul Salam", etc.) and fallback arrays from `StudentRepository.kt`, `HomeScreen.kt`, and `StudentPortalScreen.kt`.

---

## 1. Overview & Data Flow Parity

```
┌────────────────────────────────────────────────────────────────────────┐
│               Firestore: institutions/TEST_INSTITUTE_01                │
├─────────────────┬──────────────────┬─────────────────┬─────────────────┤
│    /students    │    /payments     │     /exams      │    /settings    │
│  (Real-Time)    │  (Real Records)  │ (Subject Marks) │(Public Content) │
└────────┬────────┴────────┬─────────┴────────┬────────┴────────┬────────┘
         │                 │                  │                 │
         ▼                 ▼                  ▼                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        StudentRepository.kt                            │
│  - listenToClasses(): Flow<List<String>> (Dynamic Distinct Classes)    │
│  - listenToStudents(className): Flow<List<StudentProfile>>             │
│  - authenticateStudent(studentId, phone): Result<StudentProfile>       │
│  - listenToStudentFees(studentId): Flow<List<FeeItem>>                 │
│  - listenToStudentExams(studentId): Flow<List<ExamResultItem>>         │
│  - listenToPublicSettings(): Flow<PublicContent> (Notices, Gallery)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│     HomeScreen (index.html)     │   │ StudentPortalScreen(student.js) │
│ - Dynamic Class Dropdown        │   │ - Live ID Badge & Profile Info  │
│ - Live Student Autocomplete     │   │ - Live Fee Ledger & Status      │
│ - Missing Phone Office Alert    │   │ - Subject Breakdown & Percent   │
│ - Real Stats, Notices, Gallery  │   │ - Native PDF Receipt & Share    │
└─────────────────────────────────┘   └─────────────────────────────────┘
```

---

## 2. Proposed Changes & Impacted Files

### 1. `android/app/src/main/java/org/noorulislam/app/ui/theme/Color.kt`
- Make `Amber500`, `Amber600`, `Emerald500`, `Emerald600`, `Teal500`, `Blue600`, `Slate800`, `Slate900` public (`val` accessible across package) so all screens can access theme tokens without visibility errors.

### 2. `android/app/src/main/java/org/noorulislam/app/data/StudentModels.kt`
- Update `StudentProfile` model to include all Firestore fields used in the web app: `fatherPhone`, `motherPhone`, `primaryMobile`, `admissionNo`, `rollNo`, `uid`, `status`, `academicYear`, `address`, `gender`.
- Update `ExamResultItem` to include subject breakdowns (`Map<String, Int>` or list of `SubjectMark(name, marks, maxMarks, grade)`), term, overall marks, percentage, and grade.
- Remove all dummy default constants and mock objects.

### 3. `android/app/src/main/java/org/noorulislam/app/data/StudentRepository.kt`
- Replace hardcoded dummy data with live Firestore snapshot listeners and coroutine queries:
  - `listenToClasses()`: Retrieves distinct class names from `students` collection and `classes` collection.
  - `getStudentsByClass(className)`: Retrieves active students for the selected class.
  - `authenticateStudent()`: Checks entered mobile against registered numbers. Returns dedicated error if no phone number exists on file.
  - `getStudentFeeHistory()`: Fetches payment records from `payments` collection.
  - `getStudentExamReport()`: Fetches official exam results with subject scores from `exams` collection.
  - `getPublicInstitutionData()`: Fetches live stats, notices, and gallery from `settings` and `notices`.

### 4. `android/app/src/main/java/org/noorulislam/app/ui/screens/HomeScreen.kt`
- Fix compilation error: Replace `Icons.Default.Chalkboard` with `Icons.Default.School` / `Icons.Default.Person`.
- Replace hardcoded `availableClasses = listOf("Class 1", ... "Class 10")` with dynamic `classesState` from `StudentRepository`.
- Implement dynamic student suggestion list based on selected class and typed name/admission number.
- Handle missing mobile warning dialog: "No mobile number registered for this student. Please contact the Madrasa office."

### 5. `android/app/src/main/java/org/noorulislam/app/ui/screens/StudentPortalScreen.kt`
- Fix compilation errors:
  - Replace `Icons.Default.Chalkboard` with standard Compose Material icons (`Icons.Default.School`).
  - Replace `Icons.Default.PhoneVolume` with `Icons.Default.Phone`.
  - Fix color access for `Amber500` and `Emerald500`.
- Populate live data for Profile, Fee items, and Exam subjects breakdown table with percentage and grade calculation.

---

## 3. Verification & Testing Plan

1. **Gradle Build Verification**:
   - Run `gradle assembleDebug` to verify that all Kotlin compilation errors (`Unresolved reference`, `Cannot access private val`) are eliminated.
2. **Data Consistency & Firestore Parity**:
   - Verify that classes dropdown dynamically lists classes present in Firestore.
   - Verify student search finds actual Firestore student records.
   - Test login validation against registered phone numbers, including the missing phone alert.
   - Verify fee status and exam score breakdown match web portal figures.
3. **Android UI & Export**:
   - Confirm PDF generation and Android Share Sheet functionality work seamlessly.
