import { signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, onSnapshot, collection, getDocs, setDoc, query, where, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, auth } from '../../config/firebase-config.js';
import { ADMIN_AUTH_DOC_ID } from '../../config/app-config.js';
import { BASE_PATH, applyInstitutionBranding, escapeHtml } from '../shared/app-common.js';
import { showToast } from '../shared/toaster.js';

// --- State Variables ---
let isSuperAdmin = false;
let currentStaffName = 'Staff Member';
let currentStaffRole = 'Class Teacher';
let currentUserKey = '';
let currentStaffDoc = null;
let teacherAssignedClasses = [];

let institutionConfig = {};
let currentAcademicYear = '';
let availableAcademicYears = [];
let allStudents = [];
let allClasses = [];
let calendarConfig = {
    weekendDays: [5], // Default: Friday (index 5)
    holidays: [] // [{ date: 'YYYY-MM-DD', title: 'Eid' }]
};

// Daily State
let selectedDailyClass = '';
let selectedDailyDate = new Date().toISOString().split('T')[0];
let currentDailyAttendanceDoc = null;
let dailyAttendanceMap = {}; // studentId -> { status: 'P'|'A'|'L', remarks: '' }
let hasUnsavedChanges = false;

// Monthly State
let selectedMonthlyClass = '';
let selectedMonthlyMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
let monthlyAttendanceDocs = [];

// Analytics State
let selectedAnalyticsClass = 'ALL';

// Holiday Edit State
let editingHolidayIndex = -1;

// Helper: Normalize Date String
const getTodayDateString = () => new Date().toISOString().split('T')[0];

const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
        return dateStr;
    }
};

const getStaffAssignedClasses = (staffDoc = null, staffAccess = null) => {
    const classesSet = new Set();
    const addIfClass = (val) => {
        if (!val) return;
        if (Array.isArray(val)) {
            val.forEach((v) => addIfClass(v));
            return;
        }
        const str = String(val).trim();
        if (!str) return;
        if (str.includes(',')) {
            str.split(',').forEach((s) => addIfClass(s));
            return;
        }
        if (str.includes('/')) {
            str.split('/').forEach((s) => addIfClass(s));
            return;
        }
        classesSet.add(str);
    };

    if (staffDoc) {
        addIfClass(staffDoc.assignedClass);
        addIfClass(staffDoc.assignedClasses);
        addIfClass(staffDoc.class);
        addIfClass(staffDoc.classes);
        if (staffDoc.customFields) {
            addIfClass(staffDoc.customFields.assignedClass);
            addIfClass(staffDoc.customFields.assignedClasses);
            addIfClass(staffDoc.customFields.class);
            addIfClass(staffDoc.customFields.classes);
        }
        if (staffDoc.role) {
            const match = String(staffDoc.role).match(/class\s*([0-9a-zA-Z\s-]+)/i);
            if (match && match[1]) addIfClass(match[1].trim());
        }
    }
    if (staffAccess) {
        addIfClass(staffAccess.assignedClass);
        addIfClass(staffAccess.assignedClasses);
    }
    return Array.from(classesSet).map(c => c.trim()).filter(Boolean);
};

// --- Sidebar Management (Admin Style) ---
const isDesktop = () => window.innerWidth >= 1024;

const setSidebarCollapsed = (collapsed) => {
    const appEl = document.getElementById('attendance-app');
    const overlay = document.getElementById('drawer-overlay');
    if (!appEl) return;

    appEl.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem('attendance_sidebar_collapsed', collapsed ? 'true' : 'false');

    if (!isDesktop() && overlay) {
        if (!collapsed) {
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.remove('opacity-0'), 10);
        } else {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        }
    }
};

const toggleSidebarState = () => {
    const appEl = document.getElementById('attendance-app');
    const isCollapsed = appEl?.classList.contains('sidebar-collapsed');
    setSidebarCollapsed(!isCollapsed);
};

const initSidebarState = () => {
    const overlay = document.getElementById('drawer-overlay');
    if (!isDesktop()) {
        setSidebarCollapsed(true);
        if (overlay) {
            overlay.classList.add('opacity-0', 'hidden');
        }
    } else {
        const stored = localStorage.getItem('attendance_sidebar_collapsed');
        setSidebarCollapsed(stored === 'true');
    }
};

// --- Navigation Tabs ---
const activateTab = (targetTabId) => {
    const drawerLinks = document.querySelectorAll('.drawer-link');
    const tabContents = document.querySelectorAll('.tab-content');

    drawerLinks.forEach(link => {
        const isActive = link.dataset.tab === targetTabId;
        link.classList.toggle('active', isActive);
    });

    tabContents.forEach(content => {
        if (content.id === targetTabId) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
    });

    // Close mobile drawer on item selection
    if (!isDesktop()) {
        setSidebarCollapsed(true);
    }

    // Lazy load tab data
    if (targetTabId === 'tab-monthly') {
        loadMonthlyRegister();
    } else if (targetTabId === 'tab-analytics') {
        loadAnalytics();
    }
};

const setupNavigationTabs = () => {
    const drawerLinks = document.querySelectorAll('.drawer-link');
    drawerLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTabId = link.dataset.tab;
            if (targetTabId) {
                activateTab(targetTabId);
                const hash = link.getAttribute('href');
                if (hash) {
                    history.replaceState(null, '', hash);
                }
            }
        });
    });

    // Initial tab based on URL hash
    const currentHash = window.location.hash;
    if (currentHash === '#monthly') {
        activateTab('tab-monthly');
    } else if (currentHash === '#analytics') {
        activateTab('tab-analytics');
    } else if (currentHash === '#calendar') {
        activateTab('tab-calendar');
    } else {
        activateTab('tab-daily');
    }
};

// --- Initialization & Auth ---
const initApp = async () => {
    startLiveClock();
    initSidebarState();
    setupNavigationTabs();
    setupEventListeners();

    // Check AppSession
    const role = window.AppSession?.getRole?.() || '';
    const userSession = window.AppSession?.getUserSession?.() || {};

    if (role === 'admin' || userSession.source === 'firebase' || userSession.source === 'legacy-admin') {
        isSuperAdmin = true;
        currentStaffName = 'Super Administrator';
        currentStaffRole = 'Full Access';
    } else {
        const profile = window.AppSession?.getCurrentSessionProfile?.() || userSession;
        currentStaffName = profile.name || userSession.name || 'Staff Member';
        currentStaffRole = profile.role || profile.type || 'Class Teacher';
        currentUserKey = profile.username || profile.email || profile.id || '';
    }

    updateUserHeaderDisplays();

    // Sign in anonymously to Firebase if not signed in
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            try {
                await signInAnonymously(auth);
            } catch (err) {
                console.warn('Anonymous auth failed:', err);
            }
        }
    });

    // Firestore Listeners
    setupFirestoreListeners();
};

const updateUserHeaderDisplays = () => {
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');

    if (nameEl) nameEl.textContent = currentStaffName;
    if (roleEl) roleEl.textContent = currentStaffRole;
};

const startLiveClock = () => {
    const el = document.getElementById('live-clock-display');
    const tick = () => {
        if (el) {
            const now = new Date();
            el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    };
    tick();
    setInterval(tick, 1000);
};

// --- Firestore Data Sync ---
const setupFirestoreListeners = () => {
    // 1. Settings Config (Institution Info)
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'config'), (snap) => {
        const conf = snap.exists() ? (snap.data() || {}) : {};
        institutionConfig = conf;
        applyInstitutionBranding(conf, {
            defaultAppName: 'Attendance Register',
            logoIds: ['header-logo'],
            updateDocumentTitle: true,
            documentTitleSuffix: 'Attendance Register'
        });
    });

    // 2. Settings Academic Years
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'academicYears'), (snap) => {
        const data = snap.exists() ? snap.data() : {};
        currentAcademicYear = data.currentYear || '';
        const rawYears = Array.isArray(data.years) ? data.years : [];
        availableAcademicYears = rawYears.filter(y => {
            if (typeof y === 'object' && y !== null) return String(y.status || '').toLowerCase() !== 'archived';
            return Boolean(y);
        });

        const activeYearBadge = document.getElementById('header-active-year');
        if (activeYearBadge) activeYearBadge.textContent = currentAcademicYear || 'Active Session';

        populateAcademicYearDropdowns();
    });

    // 3. Staff Roster (to resolve assigned classes)
    onSnapshot(collection(db, `${BASE_PATH}/staff`), (snap) => {
        const staffDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!isSuperAdmin) {
            const matchedStaff = staffDocs.find(s => 
                (currentUserKey && (s.username === currentUserKey || s.email === currentUserKey || s.id === currentUserKey)) ||
                (s.name && s.name.toLowerCase() === currentStaffName.toLowerCase())
            );
            if (matchedStaff) {
                currentStaffDoc = matchedStaff;
                teacherAssignedClasses = getStaffAssignedClasses(matchedStaff);
                if (teacherAssignedClasses.length > 0) {
                    currentStaffRole = `Class ${teacherAssignedClasses.join(', ')} Teacher`;
                    updateUserHeaderDisplays();
                }
            }
        }
        populateClassDropdowns();
    });

    // 4. Students Roster
    onSnapshot(collection(db, `${BASE_PATH}/students`), (snap) => {
        allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Derive unique classes
        const classSet = new Set(
            allStudents
                .map(s => String(s.class || '').trim())
                .filter(c => c && c.toLowerCase() !== 'alumni')
        );
        allClasses = Array.from(classSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        populateClassDropdowns();
        loadDailyAttendanceRoster();
    });

    // 5. Calendar Settings
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'attendanceConfig'), (snap) => {
        if (snap.exists()) {
            calendarConfig = { ...calendarConfig, ...snap.data() };
        }
        renderCalendarSettingsUI();
        updateDailyDateDisplay();
    });
};

// --- Dropdowns Population ---
const populateAcademicYearDropdowns = () => {
    const dropdownIds = ['daily-academic-year', 'analytics-academic-year'];
    
    dropdownIds.forEach(id => {
        const yearSelect = document.getElementById(id);
        if (!yearSelect) return;

        const currentVal = yearSelect.value;
        const yearSet = new Set();
        if (currentAcademicYear) yearSet.add(currentAcademicYear);
        (availableAcademicYears || []).forEach(y => {
            const yStr = (typeof y === 'object' && y !== null) ? (y.label || y.year || '') : String(y || '');
            if (yStr) yearSet.add(yStr.trim());
        });

        const sortedYears = Array.from(yearSet).sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }));
        yearSelect.innerHTML = sortedYears.map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join('');

        if (currentVal && sortedYears.includes(currentVal)) {
            yearSelect.value = currentVal;
        } else if (currentAcademicYear) {
            yearSelect.value = currentAcademicYear;
        }
    });
};

const getAllowedClassesForTeacher = () => {
    if (isSuperAdmin || teacherAssignedClasses.length === 0) {
        return allClasses;
    }
    const filtered = allClasses.filter(c => teacherAssignedClasses.includes(c));
    return filtered.length ? filtered : allClasses;
};

const populateClassDropdowns = () => {
    const allowed = getAllowedClassesForTeacher();

    // Daily & Monthly selects
    ['daily-class-select', 'monthly-class-select'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        const prev = select.value;
        const opts = allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`).join('');
        select.innerHTML = opts || `<option value="">No Classes Assigned</option>`;

        if (prev && allowed.includes(prev)) {
            select.value = prev;
        } else if (allowed.length > 0) {
            select.value = allowed[0];
        }
    });

    // Analytics select (includes All Classes option)
    const analyticsSelect = document.getElementById('analytics-class-select');
    if (analyticsSelect) {
        const prevAnalytics = analyticsSelect.value;
        const allOpts = [`<option value="ALL">All Classes</option>`]
            .concat(allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`))
            .join('');
        analyticsSelect.innerHTML = allOpts;

        if (prevAnalytics && (prevAnalytics === 'ALL' || allowed.includes(prevAnalytics))) {
            analyticsSelect.value = prevAnalytics;
        } else {
            analyticsSelect.value = 'ALL';
        }
    }

    selectedDailyClass = document.getElementById('daily-class-select')?.value || '';
    selectedMonthlyClass = document.getElementById('monthly-class-select')?.value || '';
    selectedAnalyticsClass = document.getElementById('analytics-class-select')?.value || 'ALL';

    const rosterClassPill = document.getElementById('roster-class-pill');
    if (rosterClassPill) rosterClassPill.textContent = selectedDailyClass ? `Class ${selectedDailyClass}` : '--';
};

// --- Daily Attendance Logic ---
const getDailyDocId = (academicYear, classLabel, dateStr) => {
    const cleanYear = String(academicYear || currentAcademicYear || '').trim().replace(/[^\w-]/g, '_');
    const cleanClass = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    const cleanDate = String(dateStr || '').trim();
    return `${cleanYear}__${cleanClass}__${cleanDate}`;
};

const isDateHoliday = (dateStr) => {
    if (!dateStr) return { isHoliday: false, reason: '' };
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0: Sunday, 5: Friday

        if (Array.isArray(calendarConfig.weekendDays) && calendarConfig.weekendDays.includes(dayOfWeek)) {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return { isHoliday: true, reason: `Weekly Off (${dayNames[dayOfWeek]})` };
        }

        const holiday = (calendarConfig.holidays || []).find(h => h.date === dateStr);
        if (holiday) {
            return { isHoliday: true, reason: holiday.title || 'Official Holiday' };
        }
    } catch (_) {}
    return { isHoliday: false, reason: '' };
};

const updateDailyDateDisplay = () => {
    const dateInput = document.getElementById('daily-date-input');
    if (dateInput && !dateInput.value) {
        dateInput.value = selectedDailyDate || getTodayDateString();
    }
    selectedDailyDate = dateInput?.value || getTodayDateString();

    const dateBadge = document.getElementById('daily-date-badge');
    if (dateBadge) dateBadge.textContent = formatDisplayDate(selectedDailyDate);

    const holidayNotice = document.getElementById('daily-holiday-notice');
    const { isHoliday, reason } = isDateHoliday(selectedDailyDate);
    if (holidayNotice) {
        if (isHoliday) {
            holidayNotice.innerHTML = `<i class="fas fa-umbrella-beach mr-1"></i> ${escapeHtml(reason)}`;
            holidayNotice.classList.remove('hidden');
        } else {
            holidayNotice.classList.add('hidden');
        }
    }
};

const loadDailyAttendanceRoster = async () => {
    updateDailyDateDisplay();
    selectedDailyClass = document.getElementById('daily-class-select')?.value || '';
    const year = document.getElementById('daily-academic-year')?.value || currentAcademicYear;

    const tbody = document.getElementById('daily-roster-tbody');
    if (!selectedDailyClass) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-bold">Please select a class to load students.</td></tr>`;
        updateDailyMetrics(0, 0, 0, 0);
        return;
    }

    // Filter active students for this class & year
    const classStudents = allStudents.filter(s => {
        if (s.status === 'alumni' || s.isAlumni) return false;
        const matchesClass = s.class === selectedDailyClass;
        const matchesYear = (!s.academicYear || s.academicYear === year);
        const historyMatch = s.academicYears && typeof s.academicYears === 'object' && s.academicYears[year]?.class === selectedDailyClass;
        return (matchesClass && matchesYear) || historyMatch;
    }).sort((a, b) => {
        const rollA = Number(a.rollNo || a.roll || 9999);
        const rollB = Number(b.rollNo || b.roll || 9999);
        if (rollA !== rollB) return rollA - rollB;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });

    document.getElementById('stat-total-students').textContent = classStudents.length;

    // Fetch existing attendance document from Firestore
    const docId = getDailyDocId(year, selectedDailyClass, selectedDailyDate);
    const saveStatusText = document.getElementById('save-status-text');
    const saveIndicator = document.getElementById('save-status-indicator');

    try {
        const docRef = doc(db, `${BASE_PATH}/attendance`, docId);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
            currentDailyAttendanceDoc = snap.data();
            dailyAttendanceMap = currentDailyAttendanceDoc.records || {};
            const timeStr = currentDailyAttendanceDoc.updatedAt 
                ? new Date(currentDailyAttendanceDoc.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Earlier';
            const markerName = currentDailyAttendanceDoc.markedByName || 'Teacher';
            if (saveStatusText) saveStatusText.textContent = `Recorded at ${timeStr} by ${markerName}`;
            if (saveIndicator) saveIndicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
        } else {
            currentDailyAttendanceDoc = null;
            dailyAttendanceMap = {};
            if (saveStatusText) saveStatusText.textContent = `Not yet recorded for ${selectedDailyDate}`;
            if (saveIndicator) saveIndicator.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
        }
    } catch (err) {
        console.warn('Failed to load daily attendance doc:', err);
    }

    renderDailyStudentRows(classStudents);
    hasUnsavedChanges = false;
};

const renderDailyStudentRows = (classStudents) => {
    const tbody = document.getElementById('daily-roster-tbody');
    if (!tbody) return;

    if (!classStudents.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-bold">No active students found in Class ${escapeHtml(selectedDailyClass)}.</td></tr>`;
        updateDailyMetrics(0, 0, 0, 0);
        return;
    }

    let pCount = 0;
    let aCount = 0;
    let lCount = 0;

    tbody.innerHTML = classStudents.map((student, idx) => {
        const record = dailyAttendanceMap[student.id] || {};
        let status = record.status || '';
        // Map legacy 'E' to 'L'
        if (status === 'E') status = 'L';
        const remarks = record.remarks || '';

        if (status === 'P') pCount++;
        else if (status === 'A') aCount++;
        else if (status === 'L') lCount++;

        const photo = student.photo || student.profile?.photo || '';
        const roll = student.rollNo || student.roll || (idx + 1);
        const adm = student.adm || student.admNo || '-';

        return `
            <tr class="hover:bg-slate-50/80 transition-colors" data-student-id="${escapeHtml(student.id)}">
                <td class="py-3 px-3 text-center font-bold text-slate-400">${idx + 1}</td>
                <td class="py-3 px-3 text-center font-mono font-bold text-slate-700">${escapeHtml(String(roll))}</td>
                <td class="py-3 px-3 font-mono text-slate-500 font-semibold">${escapeHtml(adm)}</td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                            ${photo ? `<img src="${photo}" class="w-full h-full object-cover">` : `<i class="fas fa-user text-slate-400 text-xs"></i>`}
                        </div>
                        <div>
                            <div class="font-extrabold text-slate-900">${escapeHtml(student.name || '--')}</div>
                            <div class="text-[10px] text-slate-400 font-bold">${escapeHtml(student.gender || '')}</div>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4 text-center">
                    <div class="inline-flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200" data-toggle-group="${escapeHtml(student.id)}">
                        <button type="button" class="att-toggle-btn ${status === 'P' ? 'active-p' : ''}" data-status="P" title="Present (P): Attended class">P</button>
                        <button type="button" class="att-toggle-btn ${status === 'A' ? 'active-a' : ''}" data-status="A" title="Absent (A): Absent without prior notice">A</button>
                        <button type="button" class="att-toggle-btn ${status === 'L' ? 'active-l' : ''}" data-status="L" title="Leave (L): Informed leave in advance">L</button>
                    </div>
                </td>
                <td class="py-3 px-4">
                    <input type="text" class="student-remarks-input w-full p-1.5 px-2.5 text-xs rounded-lg border border-slate-200 focus:border-emerald-500 outline-none bg-white transition" placeholder="Optional remark (e.g. Fever)" value="${escapeHtml(remarks)}">
                </td>
            </tr>
        `;
    }).join('');

    updateDailyMetrics(classStudents.length, pCount, aCount, lCount);
};

const updateDailyMetrics = (total, present, absent, leave) => {
    document.getElementById('stat-total-students').textContent = total;
    document.getElementById('stat-present-count').textContent = present;
    document.getElementById('stat-absent-count').textContent = absent;
    document.getElementById('stat-late-count').textContent = leave;

    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    const pctBadge = document.getElementById('stat-present-pct');
    if (pctBadge) pctBadge.textContent = `${pct}%`;
};

// --- Attendance Action Handlers ---
const setStudentStatus = (studentId, status) => {
    if (!studentId) return;
    if (!dailyAttendanceMap[studentId]) dailyAttendanceMap[studentId] = {};
    dailyAttendanceMap[studentId].status = status;

    // Update UI toggle buttons
    const group = document.querySelector(`[data-toggle-group="${studentId}"]`);
    if (group) {
        group.querySelectorAll('.att-toggle-btn').forEach(btn => {
            btn.classList.remove('active-p', 'active-a', 'active-l');
            if (btn.dataset.status === status) {
                btn.classList.add(`active-${status.toLowerCase()}`);
            }
        });
    }

    markUnsavedChanges();
    recalculateDailyTotals();
};

const markUnsavedChanges = () => {
    hasUnsavedChanges = true;
    const saveStatusText = document.getElementById('save-status-text');
    const saveIndicator = document.getElementById('save-status-indicator');
    if (saveStatusText) saveStatusText.textContent = 'Unsaved changes';
    if (saveIndicator) saveIndicator.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse';
};

const recalculateDailyTotals = () => {
    let pCount = 0;
    let aCount = 0;
    let lCount = 0;

    Object.values(dailyAttendanceMap).forEach(rec => {
        const s = rec.status === 'E' ? 'L' : rec.status;
        if (s === 'P') pCount++;
        else if (s === 'A') aCount++;
        else if (s === 'L') lCount++;
    });

    const total = document.querySelectorAll('#daily-roster-tbody tr[data-student-id]').length;
    updateDailyMetrics(total, pCount, aCount, lCount);
};

const markAllStudents = (status) => {
    const rows = document.querySelectorAll('#daily-roster-tbody tr[data-student-id]');
    rows.forEach(row => {
        const studentId = row.dataset.studentId;
        if (studentId) {
            if (!dailyAttendanceMap[studentId]) dailyAttendanceMap[studentId] = {};
            dailyAttendanceMap[studentId].status = status;
        }
    });

    // Re-render toggle buttons
    rows.forEach(row => {
        const studentId = row.dataset.studentId;
        const group = row.querySelector(`[data-toggle-group="${studentId}"]`);
        if (group) {
            group.querySelectorAll('.att-toggle-btn').forEach(btn => {
                btn.classList.remove('active-p', 'active-a', 'active-l');
                if (btn.dataset.status === status) {
                    btn.classList.add(`active-${status.toLowerCase()}`);
                }
            });
        }
    });

    markUnsavedChanges();
    recalculateDailyTotals();
};

const clearAllStudents = () => {
    dailyAttendanceMap = {};
    const rows = document.querySelectorAll('#daily-roster-tbody tr[data-student-id]');
    rows.forEach(row => {
        const studentId = row.dataset.studentId;
        const group = row.querySelector(`[data-toggle-group="${studentId}"]`);
        if (group) {
            group.querySelectorAll('.att-toggle-btn').forEach(btn => {
                btn.classList.remove('active-p', 'active-a', 'active-l');
            });
        }
        const remarksInput = row.querySelector('.student-remarks-input');
        if (remarksInput) remarksInput.value = '';
    });
    markUnsavedChanges();
    recalculateDailyTotals();
};

const saveDailyAttendance = async () => {
    if (!selectedDailyClass) return alert('Please select a class first.');
    const year = document.getElementById('daily-academic-year')?.value || currentAcademicYear;
    if (!year) return alert('Academic year is not set.');

    const saveBtn = document.getElementById('btn-save-daily');
    const saveStatusText = document.getElementById('save-status-text');
    const saveIndicator = document.getElementById('save-status-indicator');

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>`;
    }

    try {
        // Collect remarks from inputs
        document.querySelectorAll('#daily-roster-tbody tr[data-student-id]').forEach(row => {
            const studentId = row.dataset.studentId;
            const input = row.querySelector('.student-remarks-input');
            if (studentId && input) {
                if (!dailyAttendanceMap[studentId]) dailyAttendanceMap[studentId] = {};
                dailyAttendanceMap[studentId].remarks = input.value.trim();
            }
        });

        let pCount = 0;
        let aCount = 0;
        let lCount = 0;

        Object.values(dailyAttendanceMap).forEach(rec => {
            const s = rec.status === 'E' ? 'L' : rec.status;
            if (s === 'P') pCount++;
            else if (s === 'A') aCount++;
            else if (s === 'L') lCount++;
        });

        const totalEnrolled = document.querySelectorAll('#daily-roster-tbody tr[data-student-id]').length;
        const { isHoliday, reason } = isDateHoliday(selectedDailyDate);
        const docId = getDailyDocId(year, selectedDailyClass, selectedDailyDate);

        const payload = {
            id: docId,
            academicYear: year,
            classLabel: selectedDailyClass,
            date: selectedDailyDate,
            markedByUid: currentUserKey || 'teacher',
            markedByName: currentStaffName,
            updatedAt: Date.now(),
            totalStudents: totalEnrolled,
            presentCount: pCount,
            absentCount: aCount,
            leaveCount: lCount,
            lateCount: 0,
            isHoliday: Boolean(isHoliday),
            holidayReason: reason || '',
            records: dailyAttendanceMap
        };

        await setDoc(doc(db, `${BASE_PATH}/attendance`, docId), payload);

        hasUnsavedChanges = false;
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (saveStatusText) saveStatusText.textContent = `Saved at ${timeNow} by ${currentStaffName}`;
        if (saveIndicator) saveIndicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';

        showToast(`Attendance for Class ${selectedDailyClass} saved successfully!`, 'success');
    } catch (err) {
        console.error('Save attendance error:', err);
        alert('Failed to save attendance: ' + err.message);
        if (saveStatusText) saveStatusText.textContent = 'Failed to save';
        if (saveIndicator) saveIndicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fas fa-floppy-disk"></i> <span>Save Attendance</span>`;
        }
    }
};

// --- Monthly Register Sheet Logic ---
const getDaysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

const loadMonthlyRegister = async () => {
    selectedMonthlyClass = document.getElementById('monthly-class-select')?.value || selectedDailyClass || '';
    const monthVal = document.getElementById('monthly-month-input')?.value || selectedMonthlyMonth;
    selectedMonthlyMonth = monthVal;

    const table = document.getElementById('monthly-matrix-table');
    const thead = document.getElementById('monthly-matrix-thead');
    const tbody = document.getElementById('monthly-matrix-tbody');
    const emptyNotice = document.getElementById('monthly-matrix-empty');

    if (!selectedMonthlyClass || !monthVal) {
        if (emptyNotice) emptyNotice.classList.remove('hidden');
        if (table) table.classList.add('hidden');
        return;
    }

    const [yearNum, monthNum] = monthVal.split('-').map(Number);
    const daysInMonth = getDaysInMonth(yearNum, monthNum - 1);
    const startDateStr = `${monthVal}-01`;
    const endDateStr = `${monthVal}-${String(daysInMonth).padStart(2, '0')}`;
    const year = document.getElementById('daily-academic-year')?.value || currentAcademicYear;

    if (emptyNotice) {
        emptyNotice.innerHTML = `<i class="fas fa-spinner fa-spin text-2xl text-emerald-600 mb-2"></i><div class="font-bold text-sm">Compiling Monthly Register for Class ${escapeHtml(selectedMonthlyClass)}...</div>`;
        emptyNotice.classList.remove('hidden');
    }
    if (table) table.classList.add('hidden');

    try {
        // Query Firestore for all dates in this month for this class & year
        const q = query(
            collection(db, `${BASE_PATH}/attendance`),
            where('classLabel', '==', selectedMonthlyClass),
            where('date', '>=', startDateStr),
            where('date', '<=', endDateStr)
        );
        const snap = await getDocs(q);
        monthlyAttendanceDocs = snap.docs.map(d => d.data());

        // Map daily attendance by day number
        const monthDayMap = {}; // dayNum -> docData
        monthlyAttendanceDocs.forEach(docData => {
            const dayNum = Number(String(docData.date || '').split('-')[2]);
            if (dayNum) monthDayMap[dayNum] = docData;
        });

        // Filter active students for this class
        const classStudents = allStudents.filter(s => {
            if (s.status === 'alumni' || s.isAlumni) return false;
            const matchesClass = s.class === selectedMonthlyClass;
            const matchesYear = (!s.academicYear || s.academicYear === year);
            const historyMatch = s.academicYears && typeof s.academicYears === 'object' && s.academicYears[year]?.class === selectedMonthlyClass;
            return (matchesClass && matchesYear) || historyMatch;
        }).sort((a, b) => {
            const rollA = Number(a.rollNo || a.roll || 9999);
            const rollB = Number(b.rollNo || b.roll || 9999);
            if (rollA !== rollB) return rollA - rollB;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        // Build Table Header
        let thDaysHtml = '';
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${monthVal}-${String(day).padStart(2, '0')}`;
            const dt = new Date(yearNum, monthNum - 1, day);
            const dayOfWeek = dt.getDay(); // 0 Sun, 5 Fri
            const dayLetter = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'][dayOfWeek];
            const isOff = isDateHoliday(dateStr).isHoliday;

            thDaysHtml += `
                <th class="${isOff ? 'bg-slate-200/90 text-slate-500' : ''} text-center min-w-[28px] max-w-[32px] px-1 py-2">
                    <div class="text-[9px] font-black">${dayLetter}</div>
                    <div class="text-xs font-black text-slate-800">${day}</div>
                </th>
            `;
        }

        thead.innerHTML = `
            <tr>
                <th class="sticky-col-1">#</th>
                <th class="sticky-col-2">Adm No</th>
                <th class="sticky-col-3">Student Name</th>
                ${thDaysHtml}
                <th class="bg-slate-100 font-extrabold text-slate-800 min-w-[50px]">Work</th>
                <th class="bg-emerald-50 font-extrabold text-emerald-800 min-w-[50px]">Pres</th>
                <th class="bg-rose-50 font-extrabold text-rose-800 min-w-[50px]">Abs</th>
                <th class="bg-blue-50 font-extrabold text-blue-900 min-w-[50px]">Leave</th>
                <th class="bg-indigo-50 font-extrabold text-indigo-900 min-w-[60px]">%</th>
            </tr>
        `;

        // Total working days recorded in this month for this class
        let markedWorkingDaysCount = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dayDoc = monthDayMap[day];
            if (dayDoc && !dayDoc.isHoliday) {
                markedWorkingDaysCount++;
            }
        }

        // Build Table Rows
        tbody.innerHTML = classStudents.map((student, idx) => {
            let presentCount = 0;
            let absentCount = 0;
            let leaveCount = 0;
            let dayCellsHtml = '';

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${monthVal}-${String(day).padStart(2, '0')}`;
                const { isHoliday } = isDateHoliday(dateStr);
                const dayDoc = monthDayMap[day];
                const studentRecord = dayDoc?.records?.[student.id];
                const rawStatus = studentRecord?.status;
                const status = rawStatus === 'E' ? 'L' : rawStatus;

                let cellContent = '-';
                let cellClass = '';

                if (isHoliday) {
                    cellClass = 'bg-slate-100 text-slate-400 font-bold';
                    cellContent = 'H';
                } else if (!dayDoc) {
                    cellClass = 'text-slate-300';
                    cellContent = '•';
                } else if (status === 'P') {
                    presentCount++;
                    cellClass = 'bg-emerald-100/60 text-emerald-800 font-black';
                    cellContent = 'P';
                } else if (status === 'A') {
                    absentCount++;
                    cellClass = 'bg-rose-100/70 text-rose-800 font-black';
                    cellContent = 'A';
                } else if (status === 'L') {
                    leaveCount++;
                    cellClass = 'bg-blue-100/70 text-blue-800 font-black';
                    cellContent = 'L';
                }

                dayCellsHtml += `<td class="${cellClass} text-center px-1 py-1.5 text-[11px]">${cellContent}</td>`;
            }

            const effectiveTotalDays = markedWorkingDaysCount > 0 ? markedWorkingDaysCount : (presentCount + absentCount + leaveCount);
            const percentage = effectiveTotalDays > 0 ? Math.round((presentCount / effectiveTotalDays) * 100) : 0;
            const pctBadgeColor = percentage >= 85 ? 'text-emerald-700 bg-emerald-50' : (percentage >= 75 ? 'text-amber-700 bg-amber-50' : 'text-rose-700 bg-rose-50 font-black');

            return `
                <tr class="hover:bg-slate-50/70">
                    <td class="sticky-col-1 font-bold text-slate-400 text-center">${idx + 1}</td>
                    <td class="sticky-col-2 font-mono font-bold text-slate-600 text-center">${escapeHtml(student.adm || student.admNo || '-')}</td>
                    <td class="sticky-col-3 font-extrabold text-slate-900 text-left">${escapeHtml(student.name || '--')}</td>
                    ${dayCellsHtml}
                    <td class="font-bold text-slate-600 text-center">${effectiveTotalDays}</td>
                    <td class="font-black text-emerald-600 text-center">${presentCount}</td>
                    <td class="font-black text-rose-600 text-center">${absentCount}</td>
                    <td class="font-black text-blue-600 text-center">${leaveCount}</td>
                    <td class="text-center"><span class="px-1.5 py-0.5 rounded text-xs ${pctBadgeColor}">${percentage}%</span></td>
                </tr>
            `;
        }).join('');

        if (emptyNotice) emptyNotice.classList.add('hidden');
        if (table) table.classList.remove('hidden');
    } catch (err) {
        console.error('Failed to load monthly register:', err);
        if (emptyNotice) emptyNotice.innerHTML = `<div class="text-rose-600 font-bold">Failed to load register: ${escapeHtml(err.message)}</div>`;
    }
};

// --- Export to Excel (.xlsx) ---
const exportMonthlyRegisterToExcel = () => {
    if (!window.XLSX) return alert('Excel export engine is loading. Please try again.');
    const table = document.getElementById('monthly-matrix-table');
    if (!table || table.classList.contains('hidden')) return alert('Please load the monthly register first.');

    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.table_to_sheet(table);
        XLSX.utils.book_append_sheet(wb, ws, `Attendance_${selectedMonthlyClass}`);
        XLSX.writeFile(wb, `Attendance_Register_Class_${selectedMonthlyClass}_${selectedMonthlyMonth}.xlsx`);
        showToast('Monthly register exported to Excel.', 'success');
    } catch (err) {
        console.error('Excel export failed:', err);
        alert('Failed to export Excel file: ' + err.message);
    }
};

// --- Analytics & Defaulters ---
const loadAnalytics = async () => {
    const yearSelect = document.getElementById('analytics-academic-year');
    const classSelect = document.getElementById('analytics-class-select');
    const compSelect = document.getElementById('analytics-comparator-select');
    const pctInput = document.getElementById('analytics-percentage-input');

    const year = yearSelect?.value || currentAcademicYear;
    const selectedClass = classSelect?.value || 'ALL';
    const comparator = compSelect?.value || 'below'; // 'below' | 'above'
    let targetPct = Number(pctInput?.value);
    if (isNaN(targetPct) || targetPct < 0) targetPct = 0;
    if (targetPct > 100) targetPct = 100;

    const tbody = document.getElementById('defaulters-tbody');
    const summaryBadge = document.getElementById('analytics-summary-badge');
    const countBadge = document.getElementById('defaulter-count-badge');
    const tableHeading = document.getElementById('analytics-table-heading');

    if (tableHeading) {
        const compSymbol = comparator === 'below' ? '<' : '≥';
        const classTitle = selectedClass === 'ALL' ? 'All Classes' : `Class ${selectedClass}`;
        tableHeading.textContent = `${classTitle} Attendance (${compSymbol} ${targetPct}%)`;
    }

    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 font-bold"><i class="fas fa-spinner fa-spin mr-2"></i>Analyzing attendance records...</td></tr>`;
    }

    try {
        // Query attendance records
        let q;
        if (selectedClass === 'ALL') {
            q = query(
                collection(db, `${BASE_PATH}/attendance`),
                where('academicYear', '==', year)
            );
        } else {
            q = query(
                collection(db, `${BASE_PATH}/attendance`),
                where('academicYear', '==', year),
                where('classLabel', '==', selectedClass)
            );
        }

        const snap = await getDocs(q);
        const docs = snap.docs.map(d => d.data());

        // Calculate working days per class & student statistics
        const classWorkingDays = {}; // classLabel -> count of non-holiday marked days
        const studentStats = {}; // studentId -> { present, absent, leave }
        let totalDocsEvaluated = 0;

        docs.forEach(d => {
            if (!d.isHoliday) {
                const cLabel = d.classLabel || '';
                classWorkingDays[cLabel] = (classWorkingDays[cLabel] || 0) + 1;
                totalDocsEvaluated++;

                const records = d.records || {};
                Object.entries(records).forEach(([stuId, rec]) => {
                    if (!studentStats[stuId]) studentStats[stuId] = { present: 0, absent: 0, leave: 0 };
                    const s = rec.status === 'E' ? 'L' : rec.status;
                    if (s === 'P') studentStats[stuId].present++;
                    else if (s === 'A') studentStats[stuId].absent++;
                    else if (s === 'L') studentStats[stuId].leave++;
                });
            }
        });

        // Filter students to evaluate
        const allowed = getAllowedClassesForTeacher();
        const targetClasses = selectedClass === 'ALL' ? allowed : [selectedClass];

        const relevantStudents = allStudents.filter(s => {
            if (s.status === 'alumni' || s.isAlumni) return false;
            const stuClass = s.academicYears?.[year]?.class || s.class || '';
            const matchesYear = (!s.academicYear || s.academicYear === year || s.academicYears?.[year]);
            return targetClasses.includes(stuClass) && matchesYear;
        });

        const filteredList = [];
        let grandPresent = 0;
        let grandTotal = 0;

        relevantStudents.forEach(student => {
            const stuClass = student.academicYears?.[year]?.class || student.class || '';
            const st = studentStats[student.id] || { present: 0, absent: 0, leave: 0 };
            const classDays = classWorkingDays[stuClass] || 0;
            const effectiveTotal = classDays > 0 ? classDays : (st.present + st.absent + st.leave);
            const pct = effectiveTotal > 0 ? Math.round((st.present / effectiveTotal) * 100) : 0;

            grandPresent += st.present;
            grandTotal += effectiveTotal;

            const matchesCondition = comparator === 'below' 
                ? (pct < targetPct && effectiveTotal > 0)
                : (pct >= targetPct && effectiveTotal > 0);

            if (matchesCondition) {
                filteredList.push({
                    student,
                    studentClass: stuClass,
                    totalDays: effectiveTotal,
                    presentDays: st.present,
                    absentDays: st.absent,
                    leaveDays: st.leave,
                    percentage: pct
                });
            }
        });

        // Sort: if below, ascending percentage; if above, descending percentage
        if (comparator === 'below') {
            filteredList.sort((a, b) => a.percentage - b.percentage);
        } else {
            filteredList.sort((a, b) => b.percentage - a.percentage);
        }

        // Summary badges
        const averagePct = grandTotal > 0 ? Math.round((grandPresent / grandTotal) * 100) : 0;
        if (summaryBadge) {
            summaryBadge.textContent = `Overall Average: ${averagePct}% (${relevantStudents.length} Students Evaluated)`;
        }
        if (countBadge) {
            countBadge.textContent = `${filteredList.length} Students`;
        }

        if (!tbody) return;

        if (filteredList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-emerald-700 font-extrabold bg-emerald-50/50"><i class="fas fa-check-circle mr-1"></i> No students match the condition (${comparator === 'below' ? '<' : '≥'} ${targetPct}%).</td></tr>`;
            return;
        }

        tbody.innerHTML = filteredList.map((item, idx) => {
            const stu = item.student;
            const phone = stu.mobile || stu.profile?.mobile || stu.parentMobile || stu.whatsapp || '';
            const cleanPhone = String(phone).replace(/\D/g, '');
            const waLink = cleanPhone ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`Dear Parent, Attendance notification from Noorul Islam Madrasa for ${stu.name || 'Student'}: Current attendance is ${item.percentage}% (${item.presentDays}/${item.totalDays} days). Please ensure regular attendance.`)}` : '';

            const badgeColor = item.percentage >= 75 
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                : (item.percentage >= 60 ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-rose-100 text-rose-800 border-rose-300');

            return `
                <tr class="hover:bg-slate-50/80">
                    <td class="py-2.5 px-3 font-bold text-slate-400">${idx + 1}</td>
                    <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded bg-slate-100 font-extrabold text-slate-700 text-xs">Class ${escapeHtml(item.studentClass)}</span></td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${escapeHtml(stu.adm || stu.admNo || '-')}</td>
                    <td class="py-2.5 px-4 font-extrabold text-slate-900">${escapeHtml(stu.name || '--')}</td>
                    <td class="py-2.5 px-3 text-center font-bold text-slate-600">${item.totalDays}</td>
                    <td class="py-2.5 px-3 text-center font-bold text-emerald-600">${item.presentDays}</td>
                    <td class="py-2.5 px-3 text-center font-black text-rose-600">${item.absentDays}</td>
                    <td class="py-2.5 px-3 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-black ${badgeColor} border">${item.percentage}%</span></td>
                    <td class="py-2.5 px-4 font-mono text-slate-600">${escapeHtml(phone || 'N/A')}</td>
                    <td class="py-2.5 px-3 text-center">
                        ${waLink ? `<a href="${waLink}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition"><i class="fab fa-whatsapp"></i> Alert</a>` : `<span class="text-slate-400 text-xs">-</span>`}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Failed to load analytics:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-rose-600 font-bold">Failed to load analytics: ${escapeHtml(err.message)}</td></tr>`;
    }
};

// --- Calendar & Holidays UI ---
const renderCalendarSettingsUI = () => {
    // 1. Weekend Checkboxes
    const container = document.getElementById('weekend-checkboxes-container');
    if (container && Array.isArray(calendarConfig.weekendDays)) {
        container.querySelectorAll('.weekend-day-check').forEach(chk => {
            chk.checked = calendarConfig.weekendDays.includes(Number(chk.value));
        });
    }

    // 2. Holidays Table (with Edit & Delete buttons)
    const tbody = document.getElementById('holidays-tbody');
    if (tbody) {
        const holidays = calendarConfig.holidays || [];
        if (!holidays.length) {
            tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-slate-400">No special holidays configured.</td></tr>`;
            return;
        }

        tbody.innerHTML = holidays.map((h, idx) => `
            <tr class="hover:bg-slate-50">
                <td class="py-2 px-4 font-bold text-slate-800">${escapeHtml(formatDisplayDate(h.date))}</td>
                <td class="py-2 px-4 font-extrabold text-slate-900">${escapeHtml(h.title || 'Official Holiday')}</td>
                <td class="py-2 px-4 text-center">
                    <div class="inline-flex items-center gap-3">
                        <button type="button" class="btn-edit-holiday text-indigo-600 hover:text-indigo-800 font-bold text-xs" data-index="${idx}" title="Edit holiday">
                            <i class="fas fa-pen-to-square"></i> Edit
                        </button>
                        <button type="button" class="btn-del-holiday text-rose-600 hover:text-rose-800 font-bold text-xs" data-index="${idx}" title="Delete holiday">
                            <i class="fas fa-trash-can"></i> Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
};

const saveWeekendConfig = async () => {
    const checks = document.querySelectorAll('.weekend-day-check:checked');
    const selectedDays = Array.from(checks).map(c => Number(c.value));

    try {
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'attendanceConfig'), {
            weekendDays: selectedDays
        }, { merge: true });
        showToast('Weekend off-days configured successfully!', 'success');
        updateDailyDateDisplay();
    } catch (err) {
        alert('Failed to save weekend config: ' + err.message);
    }
};

const startEditHoliday = (idx) => {
    const holidays = calendarConfig.holidays || [];
    if (idx < 0 || idx >= holidays.length) return;
    editingHolidayIndex = idx;
    const h = holidays[idx];

    const dateInput = document.getElementById('holiday-date-input');
    const titleInput = document.getElementById('holiday-title-input');
    const cardTitle = document.getElementById('holiday-card-title');
    const addBtnLabel = document.getElementById('btn-add-holiday-label');
    const cancelBtn = document.getElementById('btn-cancel-holiday-edit');

    if (dateInput) dateInput.value = h.date || '';
    if (titleInput) titleInput.value = h.title || '';
    if (cardTitle) cardTitle.textContent = 'Edit Scheduled Holiday';
    if (addBtnLabel) addBtnLabel.textContent = 'Update Holiday';
    if (cancelBtn) cancelBtn.classList.remove('hidden');
};

const cancelEditHoliday = () => {
    editingHolidayIndex = -1;
    const dateInput = document.getElementById('holiday-date-input');
    const titleInput = document.getElementById('holiday-title-input');
    const cardTitle = document.getElementById('holiday-card-title');
    const addBtnLabel = document.getElementById('btn-add-holiday-label');
    const cancelBtn = document.getElementById('btn-cancel-holiday-edit');

    if (dateInput) dateInput.value = '';
    if (titleInput) titleInput.value = '';
    if (cardTitle) cardTitle.textContent = 'Declare Institutional Holiday';
    if (addBtnLabel) addBtnLabel.textContent = 'Add Holiday';
    if (cancelBtn) cancelBtn.classList.add('hidden');
};

const addOrUpdateHoliday = async () => {
    const dateInput = document.getElementById('holiday-date-input');
    const titleInput = document.getElementById('holiday-title-input');

    const dateVal = dateInput?.value;
    const titleVal = titleInput?.value.trim();

    if (!dateVal) return alert('Please select a holiday date.');
    if (!titleVal) return alert('Please enter the holiday title or occasion.');

    const updatedHolidays = [...(calendarConfig.holidays || [])];

    if (editingHolidayIndex >= 0) {
        // Edit mode
        if (updatedHolidays.some((h, i) => i !== editingHolidayIndex && h.date === dateVal)) {
            return alert('Another holiday is already declared on this date.');
        }
        updatedHolidays[editingHolidayIndex] = { date: dateVal, title: titleVal };
    } else {
        // New mode
        if (updatedHolidays.some(h => h.date === dateVal)) {
            return alert('A holiday is already declared on this date.');
        }
        updatedHolidays.push({ date: dateVal, title: titleVal });
    }

    updatedHolidays.sort((a, b) => a.date.localeCompare(b.date));

    try {
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'attendanceConfig'), {
            holidays: updatedHolidays
        }, { merge: true });

        const isEditing = editingHolidayIndex >= 0;
        cancelEditHoliday();
        showToast(isEditing ? `Holiday "${titleVal}" updated.` : `Holiday "${titleVal}" added.`, 'success');
        updateDailyDateDisplay();
    } catch (err) {
        alert('Failed to save holiday: ' + err.message);
    }
};

const deleteHoliday = async (idx) => {
    const updatedHolidays = [...(calendarConfig.holidays || [])];
    if (idx < 0 || idx >= updatedHolidays.length) return;

    const removed = updatedHolidays.splice(idx, 1)[0];
    if (!confirm(`Delete holiday "${removed?.title}" on ${removed?.date}?`)) return;

    try {
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'attendanceConfig'), {
            holidays: updatedHolidays
        }, { merge: true });
        if (editingHolidayIndex === idx) {
            cancelEditHoliday();
        }
        showToast('Holiday removed.', 'success');
        updateDailyDateDisplay();
    } catch (err) {
        alert('Failed to remove holiday: ' + err.message);
    }
};

// --- Setup Event Listeners ---
const setupEventListeners = () => {
    // 1. Sidebar Collapse & Mobile Menu
    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', toggleSidebarState);
    document.getElementById('attendance-mobile-menu-btn')?.addEventListener('click', () => setSidebarCollapsed(false));
    document.getElementById('drawer-overlay')?.addEventListener('click', () => setSidebarCollapsed(true));

    window.addEventListener('resize', () => {
        if (isDesktop()) {
            const overlay = document.getElementById('drawer-overlay');
            if (overlay && !overlay.classList.contains('hidden')) {
                overlay.classList.add('opacity-0', 'hidden');
            }
        }
    });

    // 2. Daily Class & Date Selection
    document.getElementById('daily-class-select')?.addEventListener('change', () => {
        selectedDailyClass = document.getElementById('daily-class-select')?.value || '';
        const rosterClassPill = document.getElementById('roster-class-pill');
        if (rosterClassPill) rosterClassPill.textContent = selectedDailyClass ? `Class ${selectedDailyClass}` : '--';
        loadDailyAttendanceRoster();
    });

    document.getElementById('daily-academic-year')?.addEventListener('change', loadDailyAttendanceRoster);

    document.getElementById('daily-date-input')?.addEventListener('change', () => {
        selectedDailyDate = document.getElementById('daily-date-input')?.value || getTodayDateString();
        loadDailyAttendanceRoster();
    });

    document.getElementById('btn-prev-day')?.addEventListener('click', () => {
        const cur = new Date(selectedDailyDate);
        cur.setDate(cur.getDate() - 1);
        selectedDailyDate = cur.toISOString().split('T')[0];
        const dateInput = document.getElementById('daily-date-input');
        if (dateInput) dateInput.value = selectedDailyDate;
        loadDailyAttendanceRoster();
    });

    document.getElementById('btn-next-day')?.addEventListener('click', () => {
        const cur = new Date(selectedDailyDate);
        cur.setDate(cur.getDate() + 1);
        selectedDailyDate = cur.toISOString().split('T')[0];
        const dateInput = document.getElementById('daily-date-input');
        if (dateInput) dateInput.value = selectedDailyDate;
        loadDailyAttendanceRoster();
    });

    document.getElementById('btn-today')?.addEventListener('click', () => {
        selectedDailyDate = getTodayDateString();
        const dateInput = document.getElementById('daily-date-input');
        if (dateInput) dateInput.value = selectedDailyDate;
        loadDailyAttendanceRoster();
    });

    // 3. Daily Batch Actions (P, A, L, Clear)
    document.getElementById('btn-mark-all-p')?.addEventListener('click', () => markAllStudents('P'));
    document.getElementById('btn-mark-all-a')?.addEventListener('click', () => markAllStudents('A'));
    document.getElementById('btn-mark-all-l')?.addEventListener('click', () => markAllStudents('L'));
    document.getElementById('btn-clear-all')?.addEventListener('click', clearAllStudents);

    // 4. Individual Toggle Delegation
    document.getElementById('daily-roster-tbody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.att-toggle-btn');
        if (!btn) return;
        const row = btn.closest('tr[data-student-id]');
        const studentId = row?.dataset.studentId;
        const status = btn.dataset.status;
        if (studentId && status) {
            setStudentStatus(studentId, status);
        }
    });

    // Remarks change listener
    document.getElementById('daily-roster-tbody')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('student-remarks-input')) {
            markUnsavedChanges();
        }
    });

    // Save Attendance Button
    document.getElementById('btn-save-daily')?.addEventListener('click', saveDailyAttendance);

    // 5. Monthly Actions
    document.getElementById('btn-load-monthly')?.addEventListener('click', loadMonthlyRegister);
    document.getElementById('monthly-class-select')?.addEventListener('change', loadMonthlyRegister);
    document.getElementById('monthly-month-input')?.addEventListener('change', loadMonthlyRegister);
    document.getElementById('btn-export-excel')?.addEventListener('click', exportMonthlyRegisterToExcel);
    document.getElementById('btn-print-register')?.addEventListener('click', () => window.print());

    // 6. Analytics Actions
    document.getElementById('btn-refresh-analytics')?.addEventListener('click', loadAnalytics);
    document.getElementById('analytics-academic-year')?.addEventListener('change', loadAnalytics);
    document.getElementById('analytics-class-select')?.addEventListener('change', loadAnalytics);
    document.getElementById('analytics-comparator-select')?.addEventListener('change', loadAnalytics);
    document.getElementById('analytics-percentage-input')?.addEventListener('change', loadAnalytics);

    // 7. Calendar Actions
    document.getElementById('btn-save-weekends')?.addEventListener('click', saveWeekendConfig);
    document.getElementById('btn-add-holiday')?.addEventListener('click', addOrUpdateHoliday);
    document.getElementById('btn-cancel-holiday-edit')?.addEventListener('click', cancelEditHoliday);

    document.getElementById('holidays-tbody')?.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.btn-edit-holiday');
        if (editBtn) {
            startEditHoliday(Number(editBtn.dataset.index));
            return;
        }
        const delBtn = e.target.closest('.btn-del-holiday');
        if (delBtn) {
            deleteHoliday(Number(delBtn.dataset.index));
        }
    });

    // 8. Sign Out
    document.getElementById('sidebar-logout-btn')?.addEventListener('click', () => {
        window.AppSession?.clearAll?.({ redirectUrl: 'index.html' });
    });
};

// Run initialization on DOM Ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
