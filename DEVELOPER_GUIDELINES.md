# DEVELOPER GUIDELINES & APPLICATION WORKFLOW

> **System:** Noorul Islam Madrasa - Enterprise Educational & Financial Management System (`feee050`)  
> **Target Audience:** Software Architects, Developers, and AI Coding Partners  
> **Primary Rule:** Plan First, Wait for User Approval, Think Independently, Implement Safely.

---

## 1. Application Development Workflow & Operating Principles

This is an **already developed, production-grade web application**. When working on this codebase, your objective is to fix bugs, improve existing functionality, implement new features, and continuously enhance performance, security, and user experience. **Never treat it as a new or greenfield project.**

### 1.1 Developer Role
- Act as an independent, intelligent, and experienced software architect and developer.
- Understand user requirements, investigate existing functionality, identify root problems, recommend the best technical solutions, and prepare structured implementation plans.
- **Think independently**: Do not limit yourself to user-suggested implementation methods. If a better architectural or UX solution exists, recommend it with clear technical reasoning.

---

### 1.2 Two Working Scenarios

#### Scenario A: When a New Feature or Requirement is Proposed
When the user shares a new idea, option, design change, or functionality:
1. **Understand Intent**: Clarify exactly what is needed.
2. **Inspect Existing Application**: Examine relevant frontend modules, backend services, Firebase configurations, and shared utilities.
3. **Analyze Integration**: Determine how the requested feature will integrate cleanly with existing modules without introducing regressions.
4. **Identify Dependencies & Side Effects**: Evaluate potential impacts on performance, mobile devices, security, or other portals.
5. **Formulate Technical Plan**: Propose the cleanest, most scalable approach.
6. **STOP AND WAIT FOR APPROVAL**: Present the implementation plan and await explicit confirmation before writing code or modifying database documents.

#### Scenario B: When a Bug or Issue is Reported
When the user reports an error, inconsistency, data anomaly, or unexpected behavior:
1. **Investigate the Root Cause**: Investigate the problem systematically; do not apply temporary band-aids or superficial fixes.
2. **Reproduce & Verify**: Trace the exact code path, data inputs, or event listeners causing the issue.
3. **Compare with Working Modules**: Inspect similar or adjacent working components for consistency.
4. **Determine Scope**: Pinpoint whether the fault lies in frontend DOM manipulation, client-side state, Firebase Firestore queries/rules, Authentication, or CSS.
5. **Formulate Bug-Fix Plan**: Clearly distinguish confirmed findings from assumptions and propose a reliable fix.
6. **STOP AND WAIT FOR APPROVAL**: Present the bug-fix plan and await explicit confirmation before applying changes.

---

### 1.3 Planning and Approval Protocol (MANDATORY)

This is the **most critical operational rule**:
- **Always plan first**: For both new features and bug fixes, first analyze and present a clear implementation plan.
- The plan must explain:
  - What needs to be done.
  - How it will be implemented.
  - Which specific files or components will be modified.
  - Whether Firebase or database changes are necessary.
  - Whether other modules may be affected.
  - How the solution will be verified and tested.
- **STOP AFTER PRESENTING THE PLAN**.
- Wait for explicit user confirmation (e.g., "PROCEED", "CONFIRMED", or approval).
- **Never modify code, files, database structures, or configurations prior to receiving approval.**
- If unexpected complexities arise during implementation that require deviating from the approved plan, pause, explain the situation, and seek approval before continuing.

---

### 1.4 Architectural Freedom & Technical Initiative
Developers have full freedom and responsibility to:
- Propose superior architectural patterns and modern web development best practices.
- Identify hidden technical debt, performance bottlenecks, or security vulnerabilities.
- Recommend clean, responsive, and intuitive UI/UX enhancements.
- Prioritize the **best long-term solution** rather than merely the easiest or quickest workaround.

---

### 1.5 Application Consistency & Core Foundations
1. **Admin Panel Foundation**: The Admin Console (`admin.html`) is the institutional foundation. Never alter shared configuration formats or credentials in a way that breaks Admin controls.
2. **Official Portal Gateway**: `official.html` and `official-dashboard.html` serve as the central entry point for Staff and Administrators. Respect authentication flows, role assignments, and session guards.
3. **Language & Responsiveness**: The entire application interface must be in clean, professional English, fully responsive across mobile phones, tablets, laptops, and desktop screens.
4. **Preserve Data & Existing Workflows**: Existing database schemas, student records, fee receipts, and configurations must remain intact unless an approved task explicitly requires a migration.

---

### 1.6 Efficient Development Practices
- Inspect only the files and components directly relevant to the active task.
- Avoid repetitive or redundant workspace scans and full-project directory traversals.
- Reuse verified architectural patterns already present in the application.

---

### 1.7 Implementation, Testing & GitHub Deployment
Once approved:
1. **Implement**: Apply clean, maintainable modifications following established naming and code style conventions.
2. **Test & Verify**: Run `npm run lint` (`tsc --noEmit`) and `npm run build` to ensure zero compilation or bundling errors. Verify UI rendering and responsive behavior.
3. **Verify Dependencies**: Confirm that adjacent modules are unaffected.
4. **Git Commit & Push**: Commit the verified changes to the repository with a concise, descriptive commit message and push to GitHub.
5. **Report Verified Status**: Report the exact commit hash and verified push status to the user. Never claim a push succeeded without checking git output.

---

### 1.8 Final Working Principle Summary
$$\text{IDEA} \longrightarrow \text{ANALYZE} \longrightarrow \text{IMPLEMENTATION PLAN} \longrightarrow \text{APPROVAL} \longrightarrow \text{IMPLEMENT} \longrightarrow \text{TEST} \longrightarrow \text{GITHUB UPDATE} \longrightarrow \text{REPORT}$$
$$\text{BUG} \longrightarrow \text{INVESTIGATE} \longrightarrow \text{IDENTIFY ROOT CAUSE} \longrightarrow \text{FIX PLAN} \longrightarrow \text{APPROVAL} \longrightarrow \text{FIX} \longrightarrow \text{TEST} \longrightarrow \text{GITHUB UPDATE} \longrightarrow \text{REPORT}$$

---

## 2. Core Architecture Rules & Safe Editing Guardrails

When modifying any part of the `feee050` application, adhere strictly to the following architectural guardrails:

### 2.1 Multi-Tenant Firestore Path Scoping
All institutional data in Firestore is scoped under:
```
institutions/{INSTITUTION_ID}/...
```
*(Configured via `config/app-config.js` with default `BASE_PATH = 'institutions/school'`).*
- Never write documents to root-level collections outside `BASE_PATH` unless explicitly configured (such as global system flags).
- Always use `collection(db, `${BASE_PATH}/...`)` or existing repository abstractions in `scripts/shared/` to ensure tenant isolation.

### 2.2 Global Atomic Receipt Numbering
- Fee receipts must never generate client-side sequential counters in isolation.
- Counter desks running simultaneously on multiple devices rely on atomic transaction logic (`receipt-service.js` using Firestore transactions on counter sequence documents).
- Never remove, bypass, or rewrite atomic receipt allocation logic without rigorous concurrency testing.

### 2.3 Mobile-Safe Image Uploads & Cropping
- Direct `FileReader.readAsDataURL` on raw camera photos (10MB-20MB) crashes low-memory mobile browser tabs.
- Always route file inputs through `safelyPrepareImageForCropping`:
  1. Validate file size threshold ($> 15\text{MB}$ rejected with clear user warning).
  2. Use zero-copy memory pointer via `URL.createObjectURL(file)`.
  3. Pre-downscale large dimensions using an offscreen Canvas ($\le 1200\text{px}$) to output lightweight $\approx 150\text{KB}$ JPEGs before feeding into `InteractiveCropper`.
  4. Preserve existing form state so that canceling cropping never wipes user-typed input.

### 2.4 Duty-Class Scoping & Role-Based Access Control (RBAC)
- All staff access is governed by `scripts/shared/session-guard.js` and `AppSession`.
- Teachers have restricted visibility: dropdown filters and database queries must be filtered strictly by their assigned duty classes (`dutyClasses`).
- Super Admins have unrestricted access (`actLikeSuperAdmin: true` or `role: 'super_admin'`) and see "All Classes".
- When adding new tabs or endpoints, ensure role checks are verified on both the client (UI hiding/guards) and Firestore rules (`firestore.rules`).

### 2.5 Multi-Page Application (MPA) Architecture
- The application uses discrete HTML pages (`admin.html`, `official.html`, `collection.html`, `student.html`, `result.html`, `academic-plan.html`, `attendance.html`, `activity.html`, `index.html`).
- Code logic is modularized into vanilla ES modules in `scripts/shared/` and `scripts/pages/`.
- Do not introduce heavy single-page router frameworks (e.g. React Router, Vue Router) into existing vanilla pages.

### 2.6 Service Worker (`sw.js`) & Cache Invalidation
- The PWA operates with offline caching in `sw.js`.
- Whenever critical CSS or JavaScript changes are deployed to production, increment the `CACHE_NAME` constant (e.g., `fee-tracker-v26` $\rightarrow$ `fee-tracker-v27`).
- This guarantees that client browsers trigger the `activate` event, purging stale caches and downloading fresh assets immediately.

### 2.7 CSS & Responsive Design Standards
- Styling is powered by Tailwind CSS v4 and custom components in `styles/main.css`.
- High-DPI logos must maintain crisp contrast on retina screens (`image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; object-fit: contain;`).
- All interactive tables (Class Worksheet, Fee Ledger, Marks Grid, Timetable) must include responsive overflow wrappers and mobile touch-friendly scrolling.

### 2.8 Verification Protocol Before Every Git Commit
Before committing any changes, execute the following commands in the workspace terminal:
```bash
# 1. Type-check all TypeScript definitions and scripts
npm run lint

# 2. Build production assets to verify bundling and asset paths
npm run build
```
Both commands must exit with code 0 without errors before committing and pushing to GitHub.
