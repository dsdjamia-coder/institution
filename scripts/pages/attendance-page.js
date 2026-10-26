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
let academicYearRecords = []; // Full year objects from settings/academicYears
let allStudents = [];
let allClasses = [];
let calendarConfig = {
    weekendDays: [5], // Default: Friday (index 5)
    holidays: [], // [{ date: 'YYYY-MM-DD', title: 'Eid', scope: 'all'|'specific', classes: ['1', '2'] }]
    sessionSchedules: {} // { [academicYear]: { startDate: 'YYYY-MM-DD', notes: '' } }
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

// --- Class Subjects State ---
let selectedSubjectsClass = '';
let classSubjectsList = []; // [ { id, name, code, teacher, weeklyPeriods } ]
let editingSubjectId = null;

// --- Timetable State ---
let selectedTtClass = '';
let isTimetableEditMode = false;
let timetableConfig = {
    workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'],
    offDays: ['Friday'],
    periodsCount: 5,
    timings: [
        { periodNum: 1, startTime: '07:30', endTime: '08:15' },
        { periodNum: 2, startTime: '08:15', endTime: '09:00' },
        { periodNum: 3, startTime: '09:15', endTime: '10:00' },
        { periodNum: 4, startTime: '10:00', endTime: '10:45' },
        { periodNum: 5, startTime: '10:45', endTime: '11:30' }
    ]
};
let timetableMatrix = {}; // "day_period" -> { subjectId, subjectName, teacher, room }

// --- Academic Year Plan State ---
let selectedYpClass = '';
let currentYpCalendarType = 'gregorian'; // 'gregorian' | 'hijri'
let currentYpStartMonth = 'June';
let currentYpEndMonth = 'March';
let isYearPlanEditMode = false;
let yearPlanGrid = {}; // "month_subjectId" -> { lessonNo, topic, pages, allocatedPeriods, breakdown, progressPercent, status, notes }

// --- Rewards Rubric State ---
let currentRewardsRubric = {
    attendance: 5,
    jamaah: 15,
    adaa: 10,
    quran: 20,
    task: 10,
    bonus: 10
};

const GREGORIAN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HIJRI_MONTHS = [
    'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani',
    'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Sha\'ban',
    'Ramadan', 'Shawwal', 'Dhu al-Qi\'dah', 'Dhu al-Hijjah'
];

const getSessionMonthsList = (calendarType, startMonth, endMonth) => {
    const list = calendarType === 'hijri' ? HIJRI_MONTHS : GREGORIAN_MONTHS;
    const startIdx = list.indexOf(startMonth);
    const endIdx = list.indexOf(endMonth);
    if (startIdx === -1 || endIdx === -1) return list;
    if (startIdx <= endIdx) {
        return list.slice(startIdx, endIdx + 1);
    } else {
        return [...list.slice(startIdx), ...list.slice(0, endIdx + 1)];
    }
};

// --- Exam Timetable State ---
let currentExamTitle = 'First Term Examination';
let examTimetableEntries = []; // [ { id, date, classLabel, subject, startTime, endTime, portions, hall, invigilator } ]

// --- Tasks State ---
let selectedTasksClass = '';
let selectedTasksDate = new Date().toISOString().split('T')[0];
let currentTaskCadence = 'daily'; // 'daily' | 'weekly' | 'monthly'
let taskDefsList = []; // [ { id, title, cadence, points } ]
let taskCompletionsMap = {}; // studentId -> { [taskId]: true }

// --- Ibadah State ---
let selectedIbadahClass = '';
let selectedIbadahDate = new Date().toISOString().split('T')[0];
let ibadahRecordsMap = {}; // studentId -> { subh, zuhr, asr, maghrib, isha, tahajjud, duha, tilawat }

// --- Quran Progress State ---
let selectedQuranClass = '';
let quranProgressCache = {}; // studentId -> { stage, currentSabaq, completed, remaining, grade, isKhatm, remarks }

// --- Rewards & Leaderboard State ---
let selectedRewardsClass = '';
let studentBonusPointsMap = {}; // studentId -> [ { points, reason, date } ]

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

// --- Modal Utilities ---
const openModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
};

const closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
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

    if (!isDesktop()) {
        setSidebarCollapsed(true);
    }

    // Lazy load tab data
    if (targetTabId === 'tab-monthly') {
        loadMonthlyRegister();
    } else if (targetTabId === 'tab-analytics') {
        loadAnalytics();
    } else if (targetTabId === 'tab-subjects') {
        loadClassSubjects();
    } else if (targetTabId === 'tab-timetable') {
        loadTimetable();
    } else if (targetTabId === 'tab-yearplan') {
        loadYearPlan();
    } else if (targetTabId === 'tab-session') {
        renderSessionScheduleUI();
    } else if (targetTabId === 'tab-calendar') {
        renderCalendarSettingsUI();
    } else if (targetTabId === 'tab-exam-schedule') {
        loadExamTimetable();
    } else if (targetTabId === 'tab-tasks') {
        loadTasksRoster();
    } else if (targetTabId === 'tab-ibadah') {
        loadIbadahRoster();
    } else if (targetTabId === 'tab-quran') {
        loadQuranRoster();
    } else if (targetTabId === 'tab-rewards') {
        loadRewardsLeaderboard();
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
    } else if (currentHash === '#timetable') {
        activateTab('tab-timetable');
    } else if (currentHash === '#exam-schedule') {
        activateTab('tab-exam-schedule');
    } else if (currentHash === '#tasks') {
        activateTab('tab-tasks');
    } else if (currentHash === '#ibadah') {
        activateTab('tab-ibadah');
    } else if (currentHash === '#quran') {
        activateTab('tab-quran');
    } else if (currentHash === '#rewards') {
        activateTab('tab-rewards');
    } else if (currentHash === '#session') {
        activateTab('tab-session');
    } else if (currentHash === '#calendar') {
        activateTab('tab-calendar');
    } else {
        activateTab('tab-daily');
    }
};

// --- Session Schedule Helpers ---
const getYearRecord = (yearLabel) => {
    const label = yearLabel || currentAcademicYear;
    return academicYearRecords.find(y => {
        const yStr = (typeof y === 'object' && y !== null) ? (y.label || y.year || '') : String(y || '');
        return yStr === label;
    }) || null;
};

const getSessionStartDate = (yearLabel) => {
    const label = yearLabel || currentAcademicYear;
    const schedule = calendarConfig.sessionSchedules?.[label];
    if (schedule?.startDate) return schedule.startDate;

    const rec = getYearRecord(label);
    if (rec && Number.isInteger(Number(rec.startMonth))) {
        const startMonth = Number(rec.startMonth); // 0-11
        const match = String(label).match(/^(\d{4})/);
        const yNum = match ? Number(match[1]) : new Date().getFullYear();
        const mStr = String(startMonth + 1).padStart(2, '0');
        return `${yNum}-${mStr}-01`;
    }
    return '';
};

const isDateBeforeSessionStart = (dateStr, yearLabel) => {
    const sDate = getSessionStartDate(yearLabel);
    if (!sDate || !dateStr) return false;
    return dateStr < sDate;
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
    // 1. Settings Config
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
        academicYearRecords = rawYears;
        availableAcademicYears = rawYears.filter(y => {
            if (typeof y === 'object' && y !== null) return String(y.status || '').toLowerCase() !== 'archived';
            return Boolean(y);
        });

        const activeYearBadge = document.getElementById('header-active-year');
        if (activeYearBadge) activeYearBadge.textContent = currentAcademicYear || 'Active Session';

        populateAcademicYearDropdowns();
        renderSessionScheduleUI();
    });

    // 3. Staff Roster
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
        
        const classSet = new Set(
            allStudents
                .map(s => String(s.class || '').trim())
                .filter(c => c && c.toLowerCase() !== 'alumni')
        );
        allClasses = Array.from(classSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        populateClassDropdowns();
        populateHolidayClassesCheckboxes();
        loadDailyAttendanceRoster();
    });

    // 5. Calendar Settings
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'attendanceConfig'), (snap) => {
        if (snap.exists()) {
            calendarConfig = { ...calendarConfig, ...snap.data() };
        }
        renderCalendarSettingsUI();
        renderSessionScheduleUI();
        updateDailyDateDisplay();
    });
};

// --- Dropdowns Population ---
const populateAcademicYearDropdowns = () => {
    const dropdownIds = [
        'daily-academic-year',
        'analytics-academic-year',
        'session-academic-year',
        'subj-academic-year',
        'tt-academic-year',
        'yp-academic-year',
        'exam-tt-academic-year'
    ];
    
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

    // Standard class selects
    const standardIds = [
        'daily-class-select',
        'monthly-class-select',
        'subj-class-select',
        'tt-class-select',
        'yp-class-select',
        'modal-exam-class-select',
        'tasks-class-select',
        'ibadah-class-select',
        'quran-class-select',
        'rewards-class-select'
    ];

    standardIds.forEach(id => {
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

    // Selects with 'ALL' option
    ['analytics-class-select', 'exam-tt-class-filter'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        const prev = select.value;
        const allOpts = [`<option value="ALL">All Classes</option>`]
            .concat(allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`))
            .join('');
        select.innerHTML = allOpts;

        if (prev && (prev === 'ALL' || allowed.includes(prev))) {
            select.value = prev;
        } else {
            select.value = 'ALL';
        }
    });

    selectedDailyClass = document.getElementById('daily-class-select')?.value || '';
    selectedMonthlyClass = document.getElementById('monthly-class-select')?.value || '';
    selectedAnalyticsClass = document.getElementById('analytics-class-select')?.value || 'ALL';
    selectedTtClass = document.getElementById('tt-class-select')?.value || '';
    selectedTasksClass = document.getElementById('tasks-class-select')?.value || '';
    selectedIbadahClass = document.getElementById('ibadah-class-select')?.value || '';
    selectedQuranClass = document.getElementById('quran-class-select')?.value || '';
    selectedRewardsClass = document.getElementById('rewards-class-select')?.value || '';

    const rosterClassPill = document.getElementById('roster-class-pill');
    if (rosterClassPill) rosterClassPill.textContent = selectedDailyClass ? `Class ${selectedDailyClass}` : '--';

    // Populate student select in award modal
    populateAwardModalStudentSelect();
};

const populateAwardModalStudentSelect = () => {
    const stuSelect = document.getElementById('modal-award-student-select');
    if (!stuSelect) return;
    const allowed = getAllowedClassesForTeacher();
    const studentsInAllowed = allStudents.filter(s => allowed.includes(s.class || '') && s.status !== 'alumni');
    stuSelect.innerHTML = studentsInAllowed.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name || '--')} (Class ${escapeHtml(s.class || '-')})</option>`).join('');
};

// --- Daily Attendance Logic ---
const getDailyDocId = (academicYear, classLabel, dateStr) => {
    const cleanYear = String(academicYear || currentAcademicYear || '').trim().replace(/[^\w-]/g, '_');
    const cleanClass = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    const cleanDate = String(dateStr || '').trim();
    return `${cleanYear}__${cleanClass}__${cleanDate}`;
};

const isDateHoliday = (dateStr, targetClass = '') => {
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
            const isAll = !holiday.scope || holiday.scope === 'all' || !Array.isArray(holiday.classes) || holiday.classes.length === 0;
            if (isAll) {
                return { isHoliday: true, reason: holiday.title || 'Official Holiday' };
            }
            if (targetClass && holiday.classes.includes(targetClass)) {
                return { isHoliday: true, reason: `${holiday.title || 'Class Holiday'} (Class ${targetClass})` };
            }
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
    const year = document.getElementById('daily-academic-year')?.value || currentAcademicYear;

    const dateBadge = document.getElementById('daily-date-badge');
    if (dateBadge) dateBadge.textContent = formatDisplayDate(selectedDailyDate);

    // Holiday notice
    const holidayNotice = document.getElementById('daily-holiday-notice');
    const { isHoliday, reason } = isDateHoliday(selectedDailyDate, selectedDailyClass);
    if (holidayNotice) {
        if (isHoliday) {
            holidayNotice.innerHTML = `<i class="fas fa-umbrella-beach mr-1"></i> ${escapeHtml(reason)}`;
            holidayNotice.classList.remove('hidden');
        } else {
            holidayNotice.classList.add('hidden');
        }
    }

    // Pre-session opening notice
    const preSessionNotice = document.getElementById('daily-pre-session-notice');
    const isPreSession = isDateBeforeSessionStart(selectedDailyDate, year);
    if (preSessionNotice) {
        if (isPreSession) {
            preSessionNotice.classList.remove('hidden');
            const sDate = getSessionStartDate(year);
            preSessionNotice.title = `Precedes session opening date (${sDate})`;
        } else {
            preSessionNotice.classList.add('hidden');
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
        const { isHoliday, reason } = isDateHoliday(selectedDailyDate, selectedDailyClass);
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
        const q = query(
            collection(db, `${BASE_PATH}/attendance`),
            where('classLabel', '==', selectedMonthlyClass),
            where('date', '>=', startDateStr),
            where('date', '<=', endDateStr)
        );
        const snap = await getDocs(q);
        monthlyAttendanceDocs = snap.docs.map(d => d.data());

        const monthDayMap = {};
        monthlyAttendanceDocs.forEach(docData => {
            const dayNum = Number(String(docData.date || '').split('-')[2]);
            if (dayNum) monthDayMap[dayNum] = docData;
        });

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

        let thDaysHtml = '';
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${monthVal}-${String(day).padStart(2, '0')}`;
            const dt = new Date(yearNum, monthNum - 1, day);
            const dayOfWeek = dt.getDay();
            const dayLetter = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'][dayOfWeek];
            const isOff = isDateHoliday(dateStr, selectedMonthlyClass).isHoliday;
            const isPreSession = isDateBeforeSessionStart(dateStr, year);

            thDaysHtml += `
                <th class="${isOff ? 'bg-slate-200/90 text-slate-500' : (isPreSession ? 'bg-slate-100 text-slate-400' : '')} text-center min-w-[28px] max-w-[32px] px-1 py-2">
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

        let markedWorkingDaysCount = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${monthVal}-${String(day).padStart(2, '0')}`;
            const dayDoc = monthDayMap[day];
            const isPreSession = isDateBeforeSessionStart(dateStr, year);
            const { isHoliday } = isDateHoliday(dateStr, selectedMonthlyClass);
            if (dayDoc && !dayDoc.isHoliday && !isHoliday && !isPreSession) {
                markedWorkingDaysCount++;
            }
        }

        tbody.innerHTML = classStudents.map((student, idx) => {
            let presentCount = 0;
            let absentCount = 0;
            let leaveCount = 0;
            let dayCellsHtml = '';

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${monthVal}-${String(day).padStart(2, '0')}`;
                const { isHoliday } = isDateHoliday(dateStr, selectedMonthlyClass);
                const isPreSession = isDateBeforeSessionStart(dateStr, year);
                const dayDoc = monthDayMap[day];
                const studentRecord = dayDoc?.records?.[student.id];
                const rawStatus = studentRecord?.status;
                const status = rawStatus === 'E' ? 'L' : rawStatus;

                let cellContent = '-';
                let cellClass = '';

                if (isPreSession) {
                    cellClass = 'bg-slate-50 text-slate-300 font-bold';
                    cellContent = '·';
                } else if (isHoliday) {
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
    const comparator = compSelect?.value || 'below';
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

        const sessionStartDate = getSessionStartDate(year);

        const classWorkingDays = {};
        const studentStats = {};
        let totalDocsEvaluated = 0;

        docs.forEach(d => {
            const dDate = d.date || '';
            if (sessionStartDate && dDate && dDate < sessionStartDate) {
                return;
            }

            const cLabel = d.classLabel || '';
            const { isHoliday } = isDateHoliday(dDate, cLabel);
            if (!d.isHoliday && !isHoliday) {
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

        if (comparator === 'below') {
            filteredList.sort((a, b) => a.percentage - b.percentage);
        } else {
            filteredList.sort((a, b) => b.percentage - a.percentage);
        }

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
const populateHolidayClassesCheckboxes = () => {
    const container = document.getElementById('holiday-classes-checkboxes');
    if (!container) return;
    const allowed = allClasses.length ? allClasses : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

    container.innerHTML = allowed.map(c => `
        <label class="flex items-center gap-1.5 p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-xs font-bold text-slate-700">
            <input type="checkbox" value="${escapeHtml(c)}" class="holiday-class-check">
            <span>Class ${escapeHtml(c)}</span>
        </label>
    `).join('');
};

const renderCalendarSettingsUI = () => {
    const container = document.getElementById('weekend-checkboxes-container');
    if (container && Array.isArray(calendarConfig.weekendDays)) {
        container.querySelectorAll('.weekend-day-check').forEach(chk => {
            chk.checked = calendarConfig.weekendDays.includes(Number(chk.value));
        });
    }

    populateHolidayClassesCheckboxes();

    const tbody = document.getElementById('holidays-tbody');
    if (tbody) {
        const holidays = calendarConfig.holidays || [];
        if (!holidays.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400 font-bold">No special holidays configured.</td></tr>`;
            return;
        }

        tbody.innerHTML = holidays.map((h, idx) => {
            const isAll = !h.scope || h.scope === 'all' || !Array.isArray(h.classes) || h.classes.length === 0;
            const scopeBadge = isAll 
                ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200"><i class="fas fa-globe mr-1"></i>All Classes</span>`
                : `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-200"><i class="fas fa-users-rectangle mr-1"></i>Class ${escapeHtml(h.classes.join(', '))}</span>`;

            return `
                <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-4 font-bold text-slate-800">${escapeHtml(formatDisplayDate(h.date))}</td>
                    <td class="py-2.5 px-4 font-extrabold text-slate-900">${escapeHtml(h.title || 'Official Holiday')}</td>
                    <td class="py-2.5 px-4">${scopeBadge}</td>
                    <td class="py-2.5 px-4 text-center">
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
            `;
        }).join('');
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

    const isSpecific = h.scope === 'specific' && Array.isArray(h.classes) && h.classes.length > 0;
    const allRadio = document.getElementById('holiday-scope-all');
    const specRadio = document.getElementById('holiday-scope-specific');
    const picker = document.getElementById('holiday-classes-picker-box');

    if (isSpecific) {
        if (specRadio) specRadio.checked = true;
        if (picker) picker.classList.remove('hidden');
        document.querySelectorAll('.holiday-class-check').forEach(chk => {
            chk.checked = h.classes.includes(chk.value);
        });
    } else {
        if (allRadio) allRadio.checked = true;
        if (picker) picker.classList.add('hidden');
        document.querySelectorAll('.holiday-class-check').forEach(chk => {
            chk.checked = false;
        });
    }
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

    const allRadio = document.getElementById('holiday-scope-all');
    if (allRadio) allRadio.checked = true;
    const picker = document.getElementById('holiday-classes-picker-box');
    if (picker) picker.classList.add('hidden');
    document.querySelectorAll('.holiday-class-check').forEach(chk => {
        chk.checked = false;
    });
};

const addOrUpdateHoliday = async () => {
    const dateInput = document.getElementById('holiday-date-input');
    const titleInput = document.getElementById('holiday-title-input');
    const isSpecific = document.getElementById('holiday-scope-specific')?.checked;

    const dateVal = dateInput?.value;
    const titleVal = titleInput?.value.trim();

    if (!dateVal) return alert('Please select a holiday date.');
    if (!titleVal) return alert('Please enter the holiday title or occasion.');

    let scope = 'all';
    let targetClasses = [];

    if (isSpecific) {
        scope = 'specific';
        const checkedBoxes = document.querySelectorAll('.holiday-class-check:checked');
        targetClasses = Array.from(checkedBoxes).map(c => c.value);
        if (!targetClasses.length) {
            return alert('Please select at least one class for this class-specific holiday.');
        }
    }

    const updatedHolidays = [...(calendarConfig.holidays || [])];
    const holidayRecord = {
        date: dateVal,
        title: titleVal,
        scope,
        classes: targetClasses
    };

    if (editingHolidayIndex >= 0) {
        if (updatedHolidays.some((h, i) => i !== editingHolidayIndex && h.date === dateVal && h.scope === scope)) {
            return alert('A holiday with the same scope is already declared on this date.');
        }
        updatedHolidays[editingHolidayIndex] = holidayRecord;
    } else {
        if (updatedHolidays.some(h => h.date === dateVal && h.scope === scope)) {
            return alert('A holiday with the same scope is already declared on this date.');
        }
        updatedHolidays.push(holidayRecord);
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

// --- Session Schedule UI & Logic ---
const renderSessionScheduleUI = () => {
    const yearSelect = document.getElementById('session-academic-year');
    const selectedYear = yearSelect?.value || currentAcademicYear;

    const yearBadge = document.getElementById('session-active-year-badge');
    if (yearBadge) yearBadge.textContent = selectedYear || 'Active Session';

    const rec = getYearRecord(selectedYear);
    const periodDisplay = document.getElementById('session-period-display');
    if (periodDisplay) {
        if (rec && Number.isInteger(Number(rec.startMonth)) && Number.isInteger(Number(rec.endMonth))) {
            const sName = MONTH_NAMES[rec.startMonth] || 'Start Month';
            const eName = MONTH_NAMES[rec.endMonth] || 'End Month';
            periodDisplay.innerHTML = `<i class="fas fa-calendar-alt text-emerald-600"></i> ${escapeHtml(sName)} &rarr; ${escapeHtml(eName)} (${escapeHtml(selectedYear)})`;
        } else {
            periodDisplay.innerHTML = `<i class="fas fa-calendar-alt text-slate-400"></i> Standard Session (${escapeHtml(selectedYear)})`;
        }
    }

    const schedule = calendarConfig.sessionSchedules?.[selectedYear] || {};
    const startInput = document.getElementById('session-start-date-input');
    const notesInput = document.getElementById('session-notes-input');
    const configuredDisplay = document.getElementById('session-configured-start-display');

    if (startInput) {
        startInput.value = schedule.startDate || getSessionStartDate(selectedYear) || '';
    }
    if (notesInput) {
        notesInput.value = schedule.notes || '';
    }

    if (configuredDisplay) {
        if (schedule.startDate) {
            configuredDisplay.textContent = `${formatDisplayDate(schedule.startDate)} (${schedule.startDate})`;
        } else {
            configuredDisplay.textContent = 'Not Specifically Configured (Defaults to 1st of opening month)';
        }
    }

    const sDate = schedule.startDate || getSessionStartDate(selectedYear);
    const elapsedEl = document.getElementById('session-stat-elapsed');
    if (elapsedEl) {
        if (sDate) {
            const startDt = new Date(sDate);
            const todayDt = new Date();
            const diffTime = todayDt.getTime() - startDt.getTime();
            const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
            elapsedEl.textContent = `${diffDays} Days`;
        } else {
            elapsedEl.textContent = '--';
        }
    }

    const workingDaysEl = document.getElementById('session-stat-working-days');
    if (workingDaysEl) {
        workingDaysEl.textContent = 'Active Sync';
    }
};

const saveSessionSchedule = async () => {
    const yearSelect = document.getElementById('session-academic-year');
    const selectedYear = yearSelect?.value || currentAcademicYear;
    const startInput = document.getElementById('session-start-date-input');
    const notesInput = document.getElementById('session-notes-input');

    const sDate = startInput?.value;
    const notes = notesInput?.value.trim();

    if (!selectedYear) return alert('Please select an academic year.');
    if (!sDate) return alert('Please enter the session commencement date.');

    const updatedSchedules = {
        ...(calendarConfig.sessionSchedules || {}),
        [selectedYear]: {
            startDate: sDate,
            notes: notes || '',
            updatedAt: Date.now()
        }
    };

    try {
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'attendanceConfig'), {
            sessionSchedules: updatedSchedules
        }, { merge: true });

        showToast(`Session commencement date for ${selectedYear} saved!`, 'success');
        updateDailyDateDisplay();
    } catch (err) {
        alert('Failed to save session schedule: ' + err.message);
    }
};

// =========================================================================
// MODULE 1: CLASS SUBJECTS MANAGEMENT
// =========================================================================
const getClassSubjectsDocId = (year, classLabel) => {
    const cleanY = String(year || currentAcademicYear).trim().replace(/[^\w-]/g, '_');
    const cleanC = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    return `${cleanY}__${cleanC}`;
};

const loadClassSubjects = async () => {
    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
    selectedSubjectsClass = document.getElementById('subj-class-select')?.value || selectedDailyClass || '';
    const tbody = document.getElementById('subjects-table-body');
    const badge = document.getElementById('subj-count-badge');

    if (!selectedSubjectsClass) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-bold">Please select a class.</td></tr>`;
        return;
    }

    try {
        const docId = getClassSubjectsDocId(year, selectedSubjectsClass);
        const docSnap = await getDoc(doc(db, `${BASE_PATH}/classSubjects`, docId));
        if (docSnap.exists() && Array.isArray(docSnap.data().subjects)) {
            classSubjectsList = docSnap.data().subjects;
        } else {
            // Provide sensible initial defaults if first time
            classSubjectsList = [
                { id: 'subj_1', code: 'ENG', name: 'English Language', teacher: 'Assigned Teacher', weeklyPeriods: 5 },
                { id: 'subj_2', code: 'MATH', name: 'Mathematics', teacher: 'Assigned Teacher', weeklyPeriods: 5 },
                { id: 'subj_3', code: 'SCI', name: 'Science', teacher: 'Assigned Teacher', weeklyPeriods: 4 },
                { id: 'subj_4', code: 'ARB', name: 'Arabic', teacher: 'Assigned Teacher', weeklyPeriods: 4 }
            ];
            await setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
                subjects: classSubjectsList,
                updatedAt: Date.now()
            }, { merge: true });
        }
    } catch (err) {
        console.error('Failed to load class subjects:', err);
    }

    renderClassSubjectsUI();
};

const renderClassSubjectsUI = () => {
    const tbody = document.getElementById('subjects-table-body');
    const badge = document.getElementById('subj-count-badge');
    if (badge) badge.textContent = `${classSubjectsList.length} Subject${classSubjectsList.length === 1 ? '' : 's'} Configured`;

    if (!tbody) return;

    if (!classSubjectsList.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-slate-400 font-medium">
                    <i class="fas fa-book-open text-3xl mb-2 text-slate-300 block"></i>
                    No subjects configured for Class ${selectedSubjectsClass} yet.<br>
                    <button type="button" class="mt-3 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs" onclick="document.getElementById('btn-add-subject').click()">
                        + Add First Subject
                    </button>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = classSubjectsList.map((s, idx) => `
        <tr class="hover:bg-slate-50/80 transition">
            <td class="py-3 px-3 font-bold text-slate-400 text-center">${idx + 1}</td>
            <td class="py-3 px-3">
                <span class="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                    ${escapeHtml(s.code || 'SUBJ')}
                </span>
            </td>
            <td class="py-3 px-3 font-extrabold text-slate-900">${escapeHtml(s.name || '--')}</td>
            <td class="py-3 px-3 font-semibold text-slate-600">
                <i class="fas fa-user-tie text-[10px] text-slate-400 mr-1.5"></i>${escapeHtml(s.teacher || 'Not Assigned')}
            </td>
            <td class="py-3 px-3 text-center">
                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    ${s.weeklyPeriods || 5} Periods / Wk
                </span>
            </td>
            <td class="py-3 px-3 text-right">
                <div class="flex items-center justify-end gap-1.5">
                    <button type="button" class="btn-edit-subject p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer" data-id="${s.id}" title="Edit Subject">
                        <i class="fas fa-pen-to-square"></i>
                    </button>
                    <button type="button" class="btn-del-subject p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer" data-id="${s.id}" title="Delete Subject">
                        <i class="fas fa-trash-can"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
};

const openSubjectModal = (subject = null) => {
    editingSubjectId = subject ? subject.id : null;
    const titleEl = document.getElementById('modal-subject-title');
    const idInput = document.getElementById('modal-subject-id');
    const codeInput = document.getElementById('modal-subject-code');
    const nameInput = document.getElementById('modal-subject-name');
    const teacherInput = document.getElementById('modal-subject-teacher');
    const periodsInput = document.getElementById('modal-subject-weekly-periods');

    if (titleEl) titleEl.textContent = subject ? 'Edit Class Subject' : 'Add Class Subject';
    if (idInput) idInput.value = subject ? subject.id : '';
    if (codeInput) codeInput.value = subject ? subject.code : '';
    if (nameInput) nameInput.value = subject ? subject.name : '';
    if (teacherInput) teacherInput.value = subject ? (subject.teacher || '') : '';
    if (periodsInput) periodsInput.value = subject ? (subject.weeklyPeriods || 5) : 5;

    openModal('modal-subject-edit');
};

const saveClassSubject = async () => {
    const codeInput = document.getElementById('modal-subject-code');
    const nameInput = document.getElementById('modal-subject-name');
    const teacherInput = document.getElementById('modal-subject-teacher');
    const periodsInput = document.getElementById('modal-subject-weekly-periods');

    const code = codeInput?.value.trim().toUpperCase();
    const name = nameInput?.value.trim();
    const teacher = teacherInput?.value.trim() || 'Assigned Teacher';
    const weeklyPeriods = Number(periodsInput?.value || 5);

    if (!code) return alert('Please enter a subject code (e.g. ENG, MATH, FQH).');
    if (!name) return alert('Please enter a subject full name.');

    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
    const docId = getClassSubjectsDocId(year, selectedSubjectsClass);

    if (editingSubjectId) {
        const item = classSubjectsList.find(s => s.id === editingSubjectId);
        if (item) {
            item.code = code;
            item.name = name;
            item.teacher = teacher;
            item.weeklyPeriods = weeklyPeriods;
        }
    } else {
        classSubjectsList.push({
            id: `subj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            code,
            name,
            teacher,
            weeklyPeriods
        });
    }

    try {
        await setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
            subjects: classSubjectsList,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-subject-edit');
        showToast(`Subject "${name}" saved successfully!`, 'success');
        renderClassSubjectsUI();
    } catch (err) {
        alert('Failed to save subject: ' + err.message);
    }
};

const deleteClassSubject = async (subjectId) => {
    if (!confirm('Are you sure you want to delete this subject? It may affect existing timetable slots.')) return;
    classSubjectsList = classSubjectsList.filter(s => s.id !== subjectId);

    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
    const docId = getClassSubjectsDocId(year, selectedSubjectsClass);

    try {
        await setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
            subjects: classSubjectsList,
            updatedAt: Date.now()
        }, { merge: true });

        showToast('Subject removed.', 'info');
        renderClassSubjectsUI();
    } catch (err) {
        alert('Failed to delete subject: ' + err.message);
    }
};

const syncSubjectsFromResultSchema = async () => {
    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
    try {
        showToast('Checking Result Management schemas for subjects...', 'info');
        const snap = await getDocs(collection(db, `${BASE_PATH}/resultSchemas`));
        const imported = [];
        snap.docs.forEach(d => {
            const data = d.data();
            const rows = data.subjectRows || [];
            rows.forEach(r => {
                const name = r.name || r.subject || '';
                if (!name) return;
                const code = (r.code || name.substring(0, 4)).toUpperCase().trim();
                if (!classSubjectsList.some(ex => ex.name.toLowerCase() === name.toLowerCase())) {
                    imported.push({
                        id: `subj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                        code,
                        name,
                        teacher: 'Assigned Teacher',
                        weeklyPeriods: 5
                    });
                }
            });
        });

        if (!imported.length) {
            showToast('No new subjects found to import from Result Management.', 'info');
            return;
        }

        classSubjectsList = [...classSubjectsList, ...imported];
        const docId = getClassSubjectsDocId(year, selectedSubjectsClass);
        await setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
            subjects: classSubjectsList,
            updatedAt: Date.now()
        }, { merge: true });

        showToast(`Successfully imported ${imported.length} subjects!`, 'success');
        renderClassSubjectsUI();
    } catch (err) {
        alert('Failed to import subjects: ' + err.message);
    }
};

// =========================================================================
// MODULE 2: CLASS ROUTINE TIMETABLE (MATRIX & EDIT MODE)
// =========================================================================
const getTimetableDocId = (year, classLabel) => {
    const cleanY = String(year || currentAcademicYear).trim().replace(/[^\w-]/g, '_');
    const cleanC = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    return `${cleanY}__${cleanC}`;
};

const loadTimetable = async () => {
    const year = document.getElementById('tt-academic-year')?.value || currentAcademicYear;
    selectedTtClass = document.getElementById('tt-class-select')?.value || selectedDailyClass || '';
    const heading = document.getElementById('tt-view-heading');

    if (heading) heading.textContent = `Class ${selectedTtClass} Weekly Routine Timetable (${year})`;

    // Ensure subjects for this class are loaded so edit dropdowns can populate
    try {
        const subjDocId = getClassSubjectsDocId(year, selectedTtClass);
        const subjSnap = await getDoc(doc(db, `${BASE_PATH}/classSubjects`, subjDocId));
        if (subjSnap.exists() && Array.isArray(subjSnap.data().subjects)) {
            classSubjectsList = subjSnap.data().subjects;
        }
    } catch (_) {}

    try {
        const docId = getTimetableDocId(year, selectedTtClass);
        const docSnap = await getDoc(doc(db, `${BASE_PATH}/timetables`, docId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            timetableConfig = data.config || timetableConfig;
            timetableMatrix = data.matrix || {};
        } else {
            timetableMatrix = {};
        }
    } catch (err) {
        console.error('Failed to load timetable:', err);
    }

    renderTimetableMatrixUI();
};

const renderTimetableMatrixUI = () => {
    const grid = document.getElementById('tt-schedule-grid');
    const workingDaysBadge = document.getElementById('tt-working-days-badge');
    const totalPeriodsBadge = document.getElementById('tt-total-periods-badge');

    const workingDays = timetableConfig.workingDays && timetableConfig.workingDays.length
        ? timetableConfig.workingDays
        : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'];
    const periodsCount = Number(timetableConfig.periodsCount || 5);
    const timings = timetableConfig.timings || [];

    if (workingDaysBadge) workingDaysBadge.textContent = `${workingDays.length} Working Days / Wk`;
    if (totalPeriodsBadge) totalPeriodsBadge.textContent = `${periodsCount} Periods / Day`;

    if (!grid) return;

    if (!selectedTtClass) {
        grid.innerHTML = `<div class="p-8 text-center text-slate-400 font-bold">Please select a class to view routine timetable.</div>`;
        return;
    }

    let html = `
        <table class="w-full text-left border-collapse border border-slate-200 text-xs">
            <thead>
                <tr class="bg-slate-100 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                    <th class="py-3 px-3.5 border-r border-slate-200 w-28 bg-slate-200/80">Day / Period</th>`;

    for (let p = 1; p <= periodsCount; p++) {
        const t = timings.find(x => x.periodNum === p) || { startTime: `0${6 + p}:00`, endTime: `0${6 + p}:45` };
        html += `
            <th class="py-2.5 px-3 border-r border-slate-200 min-w-[140px]">
                <div class="text-[11px] font-black text-slate-900 tracking-wider">Period ${p}</div>
                <div class="text-[10px] font-semibold text-slate-500 mt-0.5">${t.startTime} - ${t.endTime}</div>
            </th>`;
    }
    html += `</tr></thead><tbody class="divide-y divide-slate-200 font-medium">`;

    workingDays.forEach(day => {
        html += `
            <tr class="hover:bg-slate-50/60 transition">
                <td class="py-3 px-3.5 border-r border-slate-200 font-black text-slate-900 bg-slate-50/90 whitespace-nowrap">
                    <i class="fas fa-calendar-day text-emerald-600 mr-1.5"></i>${day}
                </td>`;

        for (let p = 1; p <= periodsCount; p++) {
            const key = `${day}_${p}`;
            const slot = timetableMatrix[key] || {};

            if (isTimetableEditMode) {
                html += `
                    <td class="p-2 border-r border-slate-200 align-top bg-amber-50/20">
                        <select class="tt-cell-subject w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none mb-1 bg-white" data-day="${day}" data-period="${p}">
                            <option value="">-- Free / Recess --</option>
                            ${classSubjectsList.map(s => `
                                <option value="${s.id}" ${slot.subjectId === s.id ? 'selected' : ''}>
                                    ${escapeHtml(s.name)} (${escapeHtml(s.code)})
                                </option>
                            `).join('')}
                        </select>
                        <input type="text" class="tt-cell-teacher w-full p-1 text-[11px] border border-slate-200 rounded text-slate-700 outline-none mb-1 bg-white" placeholder="Teacher / Ustad" value="${escapeHtml(slot.teacher || '')}" data-day="${day}" data-period="${p}">
                        <input type="text" class="tt-cell-room w-full p-1 text-[10px] border border-slate-200 rounded text-slate-600 outline-none bg-white" placeholder="Room / Hall" value="${escapeHtml(slot.room || '')}" data-day="${day}" data-period="${p}">
                    </td>`;
            } else {
                html += `
                    <td class="p-2.5 border-r border-slate-200 align-top">
                        ${slot.subjectName ? `
                            <div class="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/80 shadow-2xs">
                                <div class="font-extrabold text-xs text-slate-900 leading-tight">${escapeHtml(slot.subjectName)}</div>
                                <div class="text-[11px] text-emerald-800 font-semibold mt-1 truncate">
                                    <i class="fas fa-user-tie text-[9px] mr-1 opacity-70"></i>${escapeHtml(slot.teacher || 'Assigned Ustad')}
                                </div>
                                ${slot.room ? `<div class="text-[10px] text-slate-500 font-bold mt-0.5"><i class="fas fa-location-dot text-[9px] mr-1 text-slate-400"></i>${escapeHtml(slot.room)}</div>` : ''}
                            </div>
                        ` : `
                            <div class="p-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 text-center text-slate-400 font-bold text-[11px] py-3">
                                Free Period
                            </div>
                        `}
                    </td>`;
            }
        }
        html += `</tr>`;
    });

    html += `</tbody></table>`;
    grid.innerHTML = html;
};

const toggleTimetableEdit = (enabled) => {
    isTimetableEditMode = enabled;
    const label = document.getElementById('tt-edit-mode-label');
    const saveBtn = document.getElementById('btn-save-timetable');
    if (label) {
        label.textContent = enabled ? 'Editing' : 'View Only';
        label.className = enabled
            ? 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300'
            : 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-600';
    }
    if (saveBtn) {
        saveBtn.disabled = !enabled;
    }
    renderTimetableMatrixUI();
};

const saveTimetableMatrix = async () => {
    const year = document.getElementById('tt-academic-year')?.value || currentAcademicYear;
    const docId = getTimetableDocId(year, selectedTtClass);

    const updatedMatrix = {};
    const subjectSelects = document.querySelectorAll('.tt-cell-subject');

    subjectSelects.forEach(sel => {
        const day = sel.dataset.day;
        const period = sel.dataset.period;
        const subjectId = sel.value;
        const key = `${day}_${period}`;

        const teacherInput = document.querySelector(`.tt-cell-teacher[data-day="${day}"][data-period="${period}"]`);
        const roomInput = document.querySelector(`.tt-cell-room[data-day="${day}"][data-period="${period}"]`);

        if (subjectId) {
            const subjObj = classSubjectsList.find(s => s.id === subjectId);
            updatedMatrix[key] = {
                subjectId,
                subjectName: subjObj ? subjObj.name : 'Subject',
                subjectCode: subjObj ? subjObj.code : '',
                teacher: teacherInput?.value.trim() || (subjObj ? subjObj.teacher : ''),
                room: roomInput?.value.trim() || ''
            };
        }
    });

    timetableMatrix = updatedMatrix;

    try {
        await setDoc(doc(db, `${BASE_PATH}/timetables`, docId), {
            config: timetableConfig,
            matrix: timetableMatrix,
            updatedAt: Date.now()
        }, { merge: true });

        showToast(`Class ${selectedTtClass} routine timetable saved successfully!`, 'success');
        const toggle = document.getElementById('toggle-timetable-edit');
        if (toggle) {
            toggle.checked = false;
            toggleTimetableEdit(false);
        }
    } catch (err) {
        alert('Failed to save timetable: ' + err.message);
    }
};

const openTimetableSettingsModal = () => {
    const workingDays = timetableConfig.workingDays || [];
    document.querySelectorAll('.tt-workday-cb').forEach(cb => {
        cb.checked = workingDays.includes(cb.value);
    });

    const periodsCountSel = document.getElementById('tt-settings-periods-count');
    if (periodsCountSel) periodsCountSel.value = String(timetableConfig.periodsCount || 5);

    const offDaySel = document.getElementById('tt-settings-off-day');
    if (offDaySel) offDaySel.value = (timetableConfig.offDays && timetableConfig.offDays[0]) || 'Friday';

    renderTimetableTimingsRows(Number(periodsCountSel?.value || 5));
    openModal('modal-tt-settings');
};

const renderTimetableTimingsRows = (count) => {
    const container = document.getElementById('tt-timings-container');
    if (!container) return;

    let html = '';
    const existing = timetableConfig.timings || [];
    for (let p = 1; p <= count; p++) {
        const item = existing.find(x => x.periodNum === p) || { startTime: `0${6 + p}:00`, endTime: `0${6 + p}:45` };
        html += `
            <div class="flex items-center gap-2 text-xs">
                <span class="w-20 font-bold text-slate-700">Period ${p}</span>
                <input type="time" class="tt-timing-start p-1.5 border border-slate-300 rounded-lg font-bold text-slate-800" data-p="${p}" value="${item.startTime}">
                <span class="text-slate-400 font-bold">to</span>
                <input type="time" class="tt-timing-end p-1.5 border border-slate-300 rounded-lg font-bold text-slate-800" data-p="${p}" value="${item.endTime}">
            </div>`;
    }
    container.innerHTML = html;
};

const saveTimetableSettings = async () => {
    const activeDays = [];
    document.querySelectorAll('.tt-workday-cb:checked').forEach(cb => {
        activeDays.push(cb.value);
    });

    if (!activeDays.length) return alert('Please select at least one working day.');

    const periodsCount = Number(document.getElementById('tt-settings-periods-count')?.value || 5);
    const offDay = document.getElementById('tt-settings-off-day')?.value || 'Friday';

    const timings = [];
    for (let p = 1; p <= periodsCount; p++) {
        const s = document.querySelector(`.tt-timing-start[data-p="${p}"]`)?.value || `0${6+p}:00`;
        const e = document.querySelector(`.tt-timing-end[data-p="${p}"]`)?.value || `0${6+p}:45`;
        timings.push({ periodNum: p, startTime: s, endTime: e });
    }

    timetableConfig = {
        workingDays: activeDays,
        offDays: [offDay],
        periodsCount,
        timings
    };

    const year = document.getElementById('tt-academic-year')?.value || currentAcademicYear;
    const docId = getTimetableDocId(year, selectedTtClass);

    try {
        await setDoc(doc(db, `${BASE_PATH}/timetables`, docId), {
            config: timetableConfig,
            matrix: timetableMatrix,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-tt-settings');
        showToast('Timetable structure settings applied!', 'success');
        renderTimetableMatrixUI();
    } catch (err) {
        alert('Failed to save settings: ' + err.message);
    }
};

const printTimetableRoutine = () => {
    window.print();
};

// =========================================================================
// MODULE 3: ACADEMIC YEAR PLAN (SYLLABUS & LESSON BREAKDOWN)
// =========================================================================
const getYearPlanDocId = (year, classLabel) => {
    const cleanY = String(year || currentAcademicYear).trim().replace(/[^\w-]/g, '_');
    const cleanC = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    return `${cleanY}__${cleanC}`;
};

const loadYearPlan = async () => {
    const year = document.getElementById('yp-academic-year')?.value || currentAcademicYear;
    selectedYpClass = document.getElementById('yp-class-select')?.value || selectedDailyClass || '';
    const heading = document.getElementById('yp-view-heading');

    if (heading) heading.textContent = `Class ${selectedYpClass} Academic Year Syllabus Plan (${year})`;

    // Ensure subjects for this class are loaded
    try {
        const subjDocId = getClassSubjectsDocId(year, selectedYpClass);
        const subjSnap = await getDoc(doc(db, `${BASE_PATH}/classSubjects`, subjDocId));
        if (subjSnap.exists() && Array.isArray(subjSnap.data().subjects)) {
            classSubjectsList = subjSnap.data().subjects;
        }
    } catch (_) {}

    try {
        const docId = getYearPlanDocId(year, selectedYpClass);
        const docSnap = await getDoc(doc(db, `${BASE_PATH}/yearPlans`, docId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentYpCalendarType = data.calendarType || 'gregorian';
            currentYpStartMonth = data.startMonth || (currentYpCalendarType === 'hijri' ? 'Shawwal' : 'June');
            currentYpEndMonth = data.endMonth || (currentYpCalendarType === 'hijri' ? 'Sha\'ban' : 'March');
            yearPlanGrid = data.grid || {};

            const calTypeSel = document.getElementById('yp-calendar-type');
            if (calTypeSel) calTypeSel.value = currentYpCalendarType;
            populateYearPlanMonthDropdowns();
        } else {
            yearPlanGrid = {};
            populateYearPlanMonthDropdowns();
        }
    } catch (err) {
        console.error('Failed to load year plan:', err);
    }

    renderYearPlanUI();
};

const renderYearPlanUI = () => {
    const grid = document.getElementById('yp-schedule-grid');
    if (!grid) return;

    if (!selectedYpClass) {
        grid.innerHTML = `<div class="p-8 text-center text-slate-400 font-bold">Please select a class.</div>`;
        return;
    }

    if (!classSubjectsList.length) {
        grid.innerHTML = `
            <div class="p-8 text-center text-slate-400 font-medium">
                <i class="fas fa-book-open text-3xl mb-2 text-slate-300 block"></i>
                No subjects configured for Class ${selectedYpClass}.<br>
                Please add subjects in the <strong>Class Subjects</strong> tab first to generate the syllabus matrix.<br>
                <button type="button" class="mt-3 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs" onclick="activateTab('tab-subjects')">
                    Go to Class Subjects
                </button>
            </div>`;
        return;
    }

    const startMonth = document.getElementById('yp-start-month')?.value || currentYpStartMonth;
    const endMonth = document.getElementById('yp-end-month')?.value || currentYpEndMonth;
    const months = getSessionMonthsList(currentYpCalendarType, startMonth, endMonth);

    let html = `
        <table class="w-full text-left border-collapse border border-slate-200 text-xs">
            <thead>
                <tr class="bg-slate-100 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                    <th class="py-3 px-3.5 border-r border-slate-200 w-32 bg-slate-200/80">Month</th>`;

    classSubjectsList.forEach(s => {
        html += `
            <th class="py-2.5 px-3 border-r border-slate-200 min-w-[180px]">
                <div class="text-[11px] font-black text-slate-900 tracking-wider">${escapeHtml(s.name)}</div>
                <div class="text-[10px] font-semibold text-slate-500 mt-0.5">${escapeHtml(s.code)} &bull; ${s.weeklyPeriods || 5} Periods/Wk</div>
            </th>`;
    });
    html += `</tr></thead><tbody class="divide-y divide-slate-200 font-medium">`;

    months.forEach(month => {
        html += `
            <tr class="hover:bg-slate-50/60 transition">
                <td class="py-3 px-3.5 border-r border-slate-200 font-black text-slate-900 bg-slate-50/90 whitespace-nowrap">
                    <i class="fas fa-calendar-check text-emerald-600 mr-1.5"></i>${month}
                </td>`;

        classSubjectsList.forEach(s => {
            const key = `${month}__${s.id}`;
            const cell = yearPlanGrid[key] || {};

            if (isYearPlanEditMode) {
                html += `
                    <td class="p-2 border-r border-slate-200 align-top bg-amber-50/20">
                        <input type="text" class="yp-input-lesson w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none mb-1 bg-white" placeholder="Lesson / Chapter #" value="${escapeHtml(cell.lessonNo || '')}" data-key="${key}">
                        <input type="text" class="yp-input-topic w-full p-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none mb-1 bg-white" placeholder="Topics / Chapter Title" value="${escapeHtml(cell.topic || '')}" data-key="${key}">
                        <input type="text" class="yp-input-pages w-full p-1 text-[11px] border border-slate-200 rounded text-slate-600 outline-none bg-white" placeholder="Pages (e.g. pp. 1-25)" value="${escapeHtml(cell.pages || '')}" data-key="${key}">
                    </td>`;
            } else {
                const hasTarget = Boolean(cell.topic || cell.lessonNo);
                const status = cell.status || 'Planned';
                let statusClass = 'bg-blue-50 text-blue-700 border-blue-200';
                if (status === 'In Progress') statusClass = 'bg-amber-50 text-amber-800 border-amber-200';
                else if (status === 'Completed') statusClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                else if (status === 'Behind Schedule') statusClass = 'bg-rose-50 text-rose-800 border-rose-200';

                html += `
                    <td class="p-2.5 border-r border-slate-200 align-top cursor-pointer hover:bg-emerald-50/40 transition yp-cell-clickable" data-month="${month}" data-subject-id="${s.id}" data-subject-name="${escapeHtml(s.name)}">
                        ${hasTarget ? `
                            <div class="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-emerald-300 transition">
                                <div class="flex items-center justify-between gap-1 mb-1">
                                    <span class="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusClass}">${status}</span>
                                    <span class="text-[10px] font-bold text-slate-500">${cell.allocatedPeriods || 16} P</span>
                                </div>
                                <div class="font-extrabold text-xs text-slate-900 leading-tight">${cell.lessonNo ? `${escapeHtml(cell.lessonNo)}: ` : ''}${escapeHtml(cell.topic || 'Untitled Topic')}</div>
                                ${cell.pages ? `<div class="text-[10px] text-emerald-700 font-bold mt-1"><i class="fas fa-file-lines text-[9px] mr-1"></i>${escapeHtml(cell.pages)}</div>` : ''}
                                <div class="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                                    <div class="bg-emerald-600 h-1.5 rounded-full" style="width: ${cell.progressPercent || 0}%"></div>
                                </div>
                            </div>
                        ` : `
                            <div class="p-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 text-center text-slate-400 font-bold text-[11px] py-3">
                                + Set Target
                            </div>
                        `}
                    </td>`;
            }
        });
        html += `</tr>`;
    });

    html += `</tbody></table>`;
    grid.innerHTML = html;
};

const toggleYearPlanEdit = (enabled) => {
    isYearPlanEditMode = enabled;
    const label = document.getElementById('yp-edit-mode-label');
    const saveBtn = document.getElementById('btn-save-yearplan');
    if (label) {
        label.textContent = enabled ? 'Editing' : 'View & Track';
        label.className = enabled
            ? 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300'
            : 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-600';
    }
    if (saveBtn) {
        saveBtn.disabled = !enabled;
    }
    renderYearPlanUI();
};

const saveYearPlan = async () => {
    const year = document.getElementById('yp-academic-year')?.value || currentAcademicYear;
    const docId = getYearPlanDocId(year, selectedYpClass);

    const lessonInputs = document.querySelectorAll('.yp-input-lesson');
    lessonInputs.forEach(input => {
        const key = input.dataset.key;
        const topicInput = document.querySelector(`.yp-input-topic[data-key="${key}"]`);
        const pagesInput = document.querySelector(`.yp-input-pages[data-key="${key}"]`);

        const lessonNo = input.value.trim();
        const topic = topicInput?.value.trim() || '';
        const pages = pagesInput?.value.trim() || '';

        const existing = yearPlanGrid[key] || {};
        yearPlanGrid[key] = {
            ...existing,
            lessonNo,
            topic,
            pages
        };
    });

    try {
        await setDoc(doc(db, `${BASE_PATH}/yearPlans`, docId), {
            calendarType: currentYpCalendarType,
            startMonth: document.getElementById('yp-start-month')?.value || currentYpStartMonth,
            endMonth: document.getElementById('yp-end-month')?.value || currentYpEndMonth,
            grid: yearPlanGrid,
            updatedAt: Date.now()
        }, { merge: true });

        showToast(`Academic Year Plan for Class ${selectedYpClass} saved!`, 'success');
        const toggle = document.getElementById('toggle-yearplan-edit');
        if (toggle) {
            toggle.checked = false;
            toggleYearPlanEdit(false);
        }
    } catch (err) {
        alert('Failed to save year plan: ' + err.message);
    }
};

const openYearPlanExecutionModal = (month, subjectId, subjectName) => {
    const key = `${month}__${subjectId}`;
    const cell = yearPlanGrid[key] || {};

    document.getElementById('modal-yp-cell-key').value = key;
    document.getElementById('modal-yp-title').textContent = `${subjectName} - ${month}`;
    document.getElementById('modal-yp-subtitle').textContent = `Class ${selectedYpClass} Syllabus Execution Plan`;

    const synopsisEl = document.getElementById('modal-yp-synopsis');
    if (synopsisEl) {
        synopsisEl.textContent = cell.topic ? `${cell.lessonNo ? cell.lessonNo + ': ' : ''}${cell.topic}` : 'No syllabus target defined yet for this month.';
    }
    const pagesEl = document.getElementById('modal-yp-pages');
    if (pagesEl) {
        pagesEl.textContent = cell.pages ? `Pages: ${cell.pages}` : 'Pages not specified';
    }

    const periodsInput = document.getElementById('modal-yp-periods');
    if (periodsInput) periodsInput.value = cell.allocatedPeriods || 16;

    const breakdownInput = document.getElementById('modal-yp-breakdown');
    if (breakdownInput) breakdownInput.value = cell.breakdown || '';

    const statusSel = document.getElementById('modal-yp-status');
    if (statusSel) statusSel.value = cell.status || 'Planned';

    const slider = document.getElementById('modal-yp-progress-slider');
    const valText = document.getElementById('modal-yp-progress-val');
    const prog = cell.progressPercent || 0;
    if (slider) slider.value = prog;
    if (valText) valText.textContent = `${prog}%`;

    const notesInput = document.getElementById('modal-yp-notes');
    if (notesInput) notesInput.value = cell.notes || '';

    openModal('modal-yearplan-execution');
};

const saveYearPlanExecution = async () => {
    const key = document.getElementById('modal-yp-cell-key')?.value;
    if (!key) return;

    const allocatedPeriods = Number(document.getElementById('modal-yp-periods')?.value || 16);
    const breakdown = document.getElementById('modal-yp-breakdown')?.value.trim();
    const status = document.getElementById('modal-yp-status')?.value || 'Planned';
    const progressPercent = Number(document.getElementById('modal-yp-progress-slider')?.value || 0);
    const notes = document.getElementById('modal-yp-notes')?.value.trim();

    const existing = yearPlanGrid[key] || {};
    yearPlanGrid[key] = {
        ...existing,
        allocatedPeriods,
        breakdown,
        status,
        progressPercent,
        notes
    };

    const year = document.getElementById('yp-academic-year')?.value || currentAcademicYear;
    const docId = getYearPlanDocId(year, selectedYpClass);

    try {
        await setDoc(doc(db, `${BASE_PATH}/yearPlans`, docId), {
            grid: yearPlanGrid,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-yearplan-execution');
        showToast('Lesson execution plan updated!', 'success');
        renderYearPlanUI();
    } catch (err) {
        alert('Failed to save execution plan: ' + err.message);
    }
};

const printYearPlan = () => {
    window.print();
};

// =========================================================================
// MODULE 4: EXAM TIMETABLE & SYLLABUS LOGIC
// =========================================================================
const loadExamTimetable = async () => {
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    currentExamTitle = document.getElementById('exam-tt-title-select')?.value || 'First Term Examination';
    const classFilter = document.getElementById('exam-tt-class-filter')?.value || 'ALL';
    const tbody = document.getElementById('exam-papers-tbody');

    try {
        const docId = `${String(year).replace(/[^\w-]/g, '_')}__${String(currentExamTitle).replace(/[^\w-]/g, '_')}`;
        const snap = await getDoc(doc(db, `${BASE_PATH}/examTimetables`, docId));
        examTimetableEntries = snap.exists() ? (snap.data().entries || []) : [];
    } catch (err) {
        console.error('Failed to load exam timetable:', err);
    }

    if (!tbody) return;

    const filtered = classFilter === 'ALL'
        ? examTimetableEntries
        : examTimetableEntries.filter(e => e.classLabel === classFilter);

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 font-bold">No exam papers scheduled yet for this term.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((e, idx) => `
        <tr class="hover:bg-slate-50/80">
            <td class="py-2.5 px-3 font-bold text-slate-400">${idx + 1}</td>
            <td class="py-2.5 px-3 font-bold text-slate-800">${formatDisplayDate(e.date)}</td>
            <td class="py-2.5 px-3 font-bold text-slate-700">${e.startTime} - ${e.endTime}</td>
            <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded font-black text-xs bg-slate-100 text-slate-800">Class ${e.classLabel}</span></td>
            <td class="py-2.5 px-3 font-black text-slate-900">${escapeHtml(e.subject || '')}</td>
            <td class="py-2.5 px-3 max-w-[200px] truncate font-medium text-slate-600" title="${escapeHtml(e.portions || '')}">${escapeHtml(e.portions || 'Full Syllabus')}</td>
            <td class="py-2.5 px-3 font-medium text-slate-600">${escapeHtml(e.invigilator || 'Staff')} (${escapeHtml(e.hall || 'Hall')})</td>
            <td class="py-2.5 px-3 text-right">
                <button type="button" class="btn-del-exam-entry p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition" data-id="${e.id}">
                    <i class="fas fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join('');
};

const saveExamEntry = async () => {
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const title = document.getElementById('exam-tt-title-select')?.value || 'First Term Examination';
    const date = document.getElementById('modal-exam-date')?.value;
    const classLabel = document.getElementById('modal-exam-class-select')?.value;
    const subject = document.getElementById('modal-exam-subject')?.value.trim();
    const startTime = document.getElementById('modal-exam-start-time')?.value || '08:00';
    const endTime = document.getElementById('modal-exam-end-time')?.value || '10:00';
    const portions = document.getElementById('modal-exam-portions')?.value.trim();
    const hall = document.getElementById('modal-exam-hall')?.value.trim() || 'Classroom';
    const invigilator = document.getElementById('modal-exam-invigilator')?.value.trim() || 'Staff';

    if (!date) return alert('Please choose an exam date.');
    if (!subject) return alert('Please enter a subject name.');

    const newEntry = {
        id: `exam_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        date,
        classLabel,
        subject,
        startTime,
        endTime,
        portions,
        hall,
        invigilator
    };

    examTimetableEntries.push(newEntry);

    try {
        const docId = `${String(year).replace(/[^\w-]/g, '_')}__${String(title).replace(/[^\w-]/g, '_')}`;
        await setDoc(doc(db, `${BASE_PATH}/examTimetables`, docId), {
            entries: examTimetableEntries,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-exam-entry');
        showToast('Exam paper scheduled!', 'success');
        loadExamTimetable();
    } catch (err) {
        alert('Failed to save exam paper: ' + err.message);
    }
};

const deleteExamEntry = async (id) => {
    if (!confirm('Remove this scheduled examination paper?')) return;
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const title = document.getElementById('exam-tt-title-select')?.value || 'First Term Examination';

    examTimetableEntries = examTimetableEntries.filter(e => e.id !== id);

    try {
        const docId = `${String(year).replace(/[^\w-]/g, '_')}__${String(title).replace(/[^\w-]/g, '_')}`;
        await setDoc(doc(db, `${BASE_PATH}/examTimetables`, docId), {
            entries: examTimetableEntries,
            updatedAt: Date.now()
        }, { merge: true });

        showToast('Exam entry removed.', 'info');
        loadExamTimetable();
    } catch (err) {
        alert('Failed to remove entry: ' + err.message);
    }
};

// =========================================================================
// MODULE 5: ROUTINE TASKS TRACKER LOGIC
// =========================================================================
const getDefaultTasks = (cadence) => {
    if (cadence === 'daily') {
        return [
            { id: 'task_d1', title: 'Morning Adhkar & Duas', cadence: 'daily', points: 5 },
            { id: 'task_d2', title: 'Uniform & Personal Cleanliness', cadence: 'daily', points: 5 },
            { id: 'task_d3', title: 'Class Kit & Books Prepared', cadence: 'daily', points: 5 }
        ];
    } else if (cadence === 'weekly') {
        return [
            { id: 'task_w1', title: 'Surah Al-Kahf Friday Recitation', cadence: 'weekly', points: 15 },
            { id: 'task_w2', title: 'Weekly Hifz Review (Dhor)', cadence: 'weekly', points: 10 },
            { id: 'task_w3', title: 'Islamic Quiz Activity', cadence: 'weekly', points: 10 }
        ];
    } else {
        return [
            { id: 'task_m1', title: 'Monthly Charity (Sadaqah Drive)', cadence: 'monthly', points: 20 },
            { id: 'task_m2', title: 'Family Seerah Reading Project', cadence: 'monthly', points: 25 }
        ];
    }
};

const loadTasksRoster = async () => {
    selectedTasksClass = document.getElementById('tasks-class-select')?.value || selectedDailyClass || '';
    selectedTasksDate = document.getElementById('tasks-date-input')?.value || getTodayDateString();
    const thead = document.getElementById('tasks-roster-thead');
    const tbody = document.getElementById('tasks-roster-tbody');

    if (!selectedTasksClass) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 font-bold">Please select a class.</td></tr>`;
        return;
    }

    taskDefsList = getDefaultTasks(currentTaskCadence);

    try {
        const docId = `${currentAcademicYear}__${selectedTasksClass}__${selectedTasksDate}__${currentTaskCadence}`;
        const snap = await getDoc(doc(db, `${BASE_PATH}/taskCompletions`, docId));
        taskCompletionsMap = snap.exists() ? (snap.data().completions || {}) : {};
    } catch (_) {
        taskCompletionsMap = {};
    }

    if (thead) {
        thead.innerHTML = `
            <tr class="bg-slate-100 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-200">
                <th class="py-2.5 px-3">#</th>
                <th class="py-2.5 px-3">Adm No</th>
                <th class="py-2.5 px-4">Student Name</th>
                ${taskDefsList.map(t => `<th class="py-2.5 px-3 text-center">${escapeHtml(t.title)} (${t.points}p)</th>`).join('')}
                <th class="py-2.5 px-3 text-center">Score</th>
            </tr>`;
    }

    if (!tbody) return;

    const classStudents = allStudents.filter(s => s.class === selectedTasksClass && s.status !== 'alumni');
    if (!classStudents.length) {
        tbody.innerHTML = `<tr><td colspan="${taskDefsList.length + 4}" class="p-8 text-center text-slate-400 font-bold">No active students in Class ${selectedTasksClass}.</td></tr>`;
        return;
    }

    tbody.innerHTML = classStudents.map((student, idx) => {
        const studentTasks = taskCompletionsMap[student.id] || {};
        let score = 0;

        return `
            <tr class="hover:bg-slate-50/80" data-student-id="${student.id}">
                <td class="py-2 px-3 font-bold text-slate-400">${idx + 1}</td>
                <td class="py-2 px-3 font-mono font-bold text-slate-600">${escapeHtml(student.adm || student.admNo || '-')}</td>
                <td class="py-2 px-4 font-black text-slate-900">${escapeHtml(student.name || '--')}</td>
                ${taskDefsList.map(t => {
                    const done = Boolean(studentTasks[t.id]);
                    if (done) score += Number(t.points || 0);
                    return `
                        <td class="py-2 px-3 text-center">
                            <input type="checkbox" class="task-check-box w-4 h-4 text-emerald-600 rounded cursor-pointer" data-student-id="${student.id}" data-task-id="${t.id}" ${done ? 'checked' : ''}>
                        </td>`;
                }).join('')}
                <td class="py-2 px-3 text-center font-black text-emerald-700 student-task-score">${score} pts</td>
            </tr>`;
    }).join('');
};

const saveTasksCompletionsToFirestore = async () => {
    const docId = `${currentAcademicYear}__${selectedTasksClass}__${selectedTasksDate}__${currentTaskCadence}`;
    try {
        await setDoc(doc(db, `${BASE_PATH}/taskCompletions`, docId), {
            completions: taskCompletionsMap,
            updatedAt: Date.now()
        }, { merge: true });
    } catch (err) {
        console.error('Failed to auto-save task completions:', err);
    }
};

// =========================================================================
// MODULE 6: SPIRITUAL & IBADAH TRACKER LOGIC
// =========================================================================
const loadIbadahRoster = async () => {
    selectedIbadahClass = document.getElementById('ibadah-class-select')?.value || selectedDailyClass || '';
    selectedIbadahDate = document.getElementById('ibadah-date-input')?.value || getTodayDateString();
    const tbody = document.getElementById('ibadah-roster-tbody');

    if (!selectedIbadahClass) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 font-bold">Please select a class.</td></tr>`;
        return;
    }

    try {
        const docId = `${currentAcademicYear}__${selectedIbadahClass}__${selectedIbadahDate}`;
        const snap = await getDoc(doc(db, `${BASE_PATH}/ibadah`, docId));
        ibadahRecordsMap = snap.exists() ? (snap.data().records || {}) : {};
    } catch (_) {
        ibadahRecordsMap = {};
    }

    if (!tbody) return;

    const classStudents = allStudents.filter(s => s.class === selectedIbadahClass && s.status !== 'alumni');
    if (!classStudents.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 font-bold">No active students in Class ${selectedIbadahClass}.</td></tr>`;
        return;
    }

    const prayers = ['subh', 'zuhr', 'asr', 'maghrib', 'isha'];

    tbody.innerHTML = classStudents.map((student, idx) => {
        const rec = ibadahRecordsMap[student.id] || {};

        return `
            <tr class="hover:bg-slate-50/80" data-student-id="${student.id}">
                <td class="py-2.5 px-3 font-bold text-slate-400">${idx + 1}</td>
                <td class="py-2.5 px-3 font-mono font-bold text-slate-600">${escapeHtml(student.adm || student.admNo || '-')}</td>
                <td class="py-2.5 px-4 font-black text-slate-900">${escapeHtml(student.name || '--')}</td>
                ${prayers.map(p => {
                    const status = rec[p] || 'A';
                    return `
                        <td class="py-2 px-2 text-center" data-prayer="${p}">
                            <div class="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 ibadah-pill-group">
                                <button type="button" class="ibadah-toggle-btn px-2 py-0.5 rounded text-[10px] font-black cursor-pointer ${status === 'J' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500'}" data-val="J">J</button>
                                <button type="button" class="ibadah-toggle-btn px-2 py-0.5 rounded text-[10px] font-black cursor-pointer ${status === 'A' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500'}" data-val="A">A</button>
                                <button type="button" class="ibadah-toggle-btn px-2 py-0.5 rounded text-[10px] font-black cursor-pointer ${status === 'Q' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-500'}" data-val="Q">Q</button>
                            </div>
                        </td>`;
                }).join('')}
                <td class="py-2 px-3 text-center">
                    <input type="checkbox" class="ibadah-tahajjud-cb w-4 h-4 text-emerald-600 rounded" ${rec.tahajjud ? 'checked' : ''}>
                </td>
                <td class="py-2 px-3 text-center">
                    <input type="checkbox" class="ibadah-duha-cb w-4 h-4 text-emerald-600 rounded" ${rec.duha ? 'checked' : ''}>
                </td>
                <td class="py-2 px-3 text-center">
                    <input type="number" class="ibadah-tilawat-mins w-16 p-1 text-center font-bold border border-slate-300 rounded text-slate-800" value="${rec.tilawat || 15}" min="0" max="180">
                </td>
            </tr>`;
    }).join('');
};

const saveIbadahRecords = async () => {
    const rows = document.querySelectorAll('#ibadah-roster-tbody tr[data-student-id]');
    const updated = {};

    rows.forEach(row => {
        const studentId = row.dataset.studentId;
        const subh = row.querySelector('[data-prayer="subh"] .ibadah-toggle-btn.bg-emerald-600') ? 'J' : (row.querySelector('[data-prayer="subh"] .ibadah-toggle-btn.bg-rose-600') ? 'Q' : 'A');
        const zuhr = row.querySelector('[data-prayer="zuhr"] .ibadah-toggle-btn.bg-emerald-600') ? 'J' : (row.querySelector('[data-prayer="zuhr"] .ibadah-toggle-btn.bg-rose-600') ? 'Q' : 'A');
        const asr = row.querySelector('[data-prayer="asr"] .ibadah-toggle-btn.bg-emerald-600') ? 'J' : (row.querySelector('[data-prayer="asr"] .ibadah-toggle-btn.bg-rose-600') ? 'Q' : 'A');
        const maghrib = row.querySelector('[data-prayer="maghrib"] .ibadah-toggle-btn.bg-emerald-600') ? 'J' : (row.querySelector('[data-prayer="maghrib"] .ibadah-toggle-btn.bg-rose-600') ? 'Q' : 'A');
        const isha = row.querySelector('[data-prayer="isha"] .ibadah-toggle-btn.bg-emerald-600') ? 'J' : (row.querySelector('[data-prayer="isha"] .ibadah-toggle-btn.bg-rose-600') ? 'Q' : 'A');

        const tahajjud = Boolean(row.querySelector('.ibadah-tahajjud-cb')?.checked);
        const duha = Boolean(row.querySelector('.ibadah-duha-cb')?.checked);
        const tilawat = Number(row.querySelector('.ibadah-tilawat-mins')?.value || 0);

        updated[studentId] = { subh, zuhr, asr, maghrib, isha, tahajjud, duha, tilawat };
    });

    ibadahRecordsMap = updated;

    const docId = `${currentAcademicYear}__${selectedIbadahClass}__${selectedIbadahDate}`;
    try {
        await setDoc(doc(db, `${BASE_PATH}/ibadah`, docId), {
            records: ibadahRecordsMap,
            updatedAt: Date.now()
        }, { merge: true });

        showToast('Ibadah records logged successfully!', 'success');
    } catch (err) {
        alert('Failed to save Ibadah records: ' + err.message);
    }
};

// =========================================================================
// MODULE 7: QURAN READING PROGRESS TRACKER LOGIC
// =========================================================================
const loadQuranRoster = async () => {
    selectedQuranClass = document.getElementById('quran-class-select')?.value || selectedDailyClass || '';
    const stageFilter = document.getElementById('quran-stage-filter')?.value || 'ALL';
    const tbody = document.getElementById('quran-roster-tbody');

    if (!selectedQuranClass) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400 font-bold">Please select a class.</td></tr>`;
        return;
    }

    try {
        const snap = await getDocs(collection(db, `${BASE_PATH}/quranProgress`));
        snap.docs.forEach(d => {
            quranProgressCache[d.id] = d.data();
        });
    } catch (_) {}

    if (!tbody) return;

    let classStudents = allStudents.filter(s => s.class === selectedQuranClass && s.status !== 'alumni');
    if (stageFilter !== 'ALL') {
        classStudents = classStudents.filter(s => (quranProgressCache[s.id]?.stage || 'qaidah') === stageFilter);
    }

    if (!classStudents.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400 font-bold">No students found matching this criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = classStudents.map((student, idx) => {
        const q = quranProgressCache[student.id] || {};
        const stageLabel = q.stage === 'amma' ? 'Juz Amma' : (q.stage === 'tilawat' ? 'Full Quran Tilawat' : (q.stage === 'hifz' ? 'Hifz Memorization' : 'Qaidah / Noorani'));

        return `
            <tr class="hover:bg-slate-50/80">
                <td class="py-2.5 px-3 font-bold text-slate-400">${idx + 1}</td>
                <td class="py-2.5 px-3 font-mono font-bold text-slate-600">${escapeHtml(student.adm || student.admNo || '-')}</td>
                <td class="py-2.5 px-4 font-black text-slate-900">${escapeHtml(student.name || '--')}</td>
                <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded font-black text-xs bg-emerald-50 text-emerald-800 border border-emerald-200">${stageLabel}</span></td>
                <td class="py-2.5 px-3 font-bold text-slate-800">${escapeHtml(q.currentSabaq || 'Lesson 1')}</td>
                <td class="py-2.5 px-3 font-semibold text-slate-600">${escapeHtml(q.completed || 'Not Started')}</td>
                <td class="py-2.5 px-3 font-semibold text-slate-500">${escapeHtml(q.remaining || '--')}</td>
                <td class="py-2.5 px-3 text-center">
                    ${q.isKhatm ? '<span class="px-2.5 py-0.5 rounded-full font-black text-xs bg-amber-400 text-white shadow-2xs">Khatm Completed!</span>' : `<span class="px-2 py-0.5 rounded text-xs font-bold ${q.grade === 'Mumtaz (Excellent)' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'}">${escapeHtml(q.grade || 'Jayyid')}</span>`}
                </td>
                <td class="py-2.5 px-3 text-right">
                    <button type="button" class="btn-eval-quran px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-xs transition cursor-pointer" data-student-id="${student.id}">
                        Record Lesson
                    </button>
                </td>
            </tr>`;
    }).join('');
};

const openQuranEvaluateModal = (studentId) => {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('modal-quran-student-id').value = studentId;
    document.getElementById('modal-quran-student-sub').textContent = `${student.name} (Adm: ${student.adm || student.admNo || '--'}, Class ${student.class})`;

    const q = quranProgressCache[studentId] || {};
    document.getElementById('modal-quran-stage').value = q.stage || 'qaidah';
    document.getElementById('modal-quran-grade').value = q.grade || 'Mumtaz (Excellent)';
    document.getElementById('modal-quran-sabaq').value = q.currentSabaq || '';
    document.getElementById('modal-quran-completed').value = q.completed || '';
    document.getElementById('modal-quran-remaining').value = q.remaining || '';
    document.getElementById('modal-quran-is-khatm').checked = Boolean(q.isKhatm);
    document.getElementById('modal-quran-remarks').value = q.remarks || '';

    openModal('modal-quran-evaluate');
};

const saveQuranProgress = async () => {
    const studentId = document.getElementById('modal-quran-student-id')?.value;
    if (!studentId) return;

    const stage = document.getElementById('modal-quran-stage')?.value || 'qaidah';
    const grade = document.getElementById('modal-quran-grade')?.value;
    const currentSabaq = document.getElementById('modal-quran-sabaq')?.value.trim();
    const completed = document.getElementById('modal-quran-completed')?.value.trim();
    const remaining = document.getElementById('modal-quran-remaining')?.value.trim();
    const isKhatm = Boolean(document.getElementById('modal-quran-is-khatm')?.checked);
    const remarks = document.getElementById('modal-quran-remarks')?.value.trim();

    if (!currentSabaq) return alert('Please enter current lesson (Sabaq).');

    const payload = {
        stage,
        grade,
        currentSabaq,
        completed,
        remaining,
        isKhatm,
        remarks,
        evaluatedAt: Date.now()
    };

    try {
        await setDoc(doc(db, `${BASE_PATH}/quranProgress`, studentId), payload, { merge: true });
        quranProgressCache[studentId] = payload;

        closeModal('modal-quran-evaluate');
        showToast('Quran progress logged successfully!', 'success');
        loadQuranRoster();
    } catch (err) {
        alert('Failed to log Quran progress: ' + err.message);
    }
};

// =========================================================================
// MODULE 8: REWARDS, POINTS & LEADERBOARD LOGIC
// =========================================================================
const loadRewardsRubric = async () => {
    const year = currentAcademicYear;
    try {
        const snap = await getDoc(doc(db, `${BASE_PATH}/rewardSettings`, year));
        if (snap.exists() && snap.data().points) {
            currentRewardsRubric = { ...currentRewardsRubric, ...snap.data().points };
        }
    } catch (err) {
        console.error('Failed to load rewards rubric:', err);
    }
};

const openRewardsSettingsModal = () => {
    const attInput = document.getElementById('rubric-pts-attendance');
    const jamInput = document.getElementById('rubric-pts-jamaah');
    const adaaInput = document.getElementById('rubric-pts-adaa');
    const quranInput = document.getElementById('rubric-pts-quran');
    const taskInput = document.getElementById('rubric-pts-task');

    if (attInput) attInput.value = currentRewardsRubric.attendance || 5;
    if (jamInput) jamInput.value = currentRewardsRubric.jamaah || 15;
    if (adaaInput) adaaInput.value = currentRewardsRubric.adaa || 10;
    if (quranInput) quranInput.value = currentRewardsRubric.quran || 20;
    if (taskInput) taskInput.value = currentRewardsRubric.task || 10;

    openModal('modal-rewards-settings');
};

const saveRewardsRubric = async () => {
    const attendance = Number(document.getElementById('rubric-pts-attendance')?.value || 5);
    const jamaah = Number(document.getElementById('rubric-pts-jamaah')?.value || 15);
    const adaa = Number(document.getElementById('rubric-pts-adaa')?.value || 10);
    const quran = Number(document.getElementById('rubric-pts-quran')?.value || 20);
    const task = Number(document.getElementById('rubric-pts-task')?.value || 10);

    currentRewardsRubric = { attendance, jamaah, adaa, quran, task, bonus: 10 };

    try {
        await setDoc(doc(db, `${BASE_PATH}/rewardSettings`, currentAcademicYear), {
            points: currentRewardsRubric,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-rewards-settings');
        showToast('Points and rubric settings updated!', 'success');
        loadRewardsLeaderboard();
    } catch (err) {
        alert('Failed to save rubric settings: ' + err.message);
    }
};

const loadRewardsLeaderboard = async () => {
    await loadRewardsRubric();

    selectedRewardsClass = document.getElementById('rewards-class-select')?.value || selectedDailyClass || '';
    const tbody = document.getElementById('rewards-leaderboard-tbody');
    const topNameEl = document.getElementById('rewards-top-student-name');
    const topPtsEl = document.getElementById('rewards-top-student-points');
    const classAvgEl = document.getElementById('rewards-class-avg-points');
    const totalBadgesEl = document.getElementById('rewards-total-badges');

    if (!selectedRewardsClass) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 font-bold">Please select a class.</td></tr>`;
        return;
    }

    try {
        const snap = await getDocs(collection(db, `${BASE_PATH}/studentBonusPoints`));
        studentBonusPointsMap = {};
        snap.docs.forEach(d => {
            studentBonusPointsMap[d.id] = d.data().pointsList || [];
        });
    } catch (_) {
        studentBonusPointsMap = {};
    }

    const classStudents = allStudents.filter(s => s.class === selectedRewardsClass && s.status !== 'alumni');

    // Dynamically calculate points based on active rubric
    const scores = classStudents.map(student => {
        const attPts = (currentRewardsRubric.attendance || 5) * 12; // Base regular attendance sample
        const ibadahPts = (currentRewardsRubric.jamaah || 15) * 5;
        const quranPts = quranProgressCache[student.id]?.isKhatm ? (currentRewardsRubric.quran || 20) * 5 : (currentRewardsRubric.quran || 20) * 2;
        const tasksPts = (currentRewardsRubric.task || 10) * 3;

        const bonusList = studentBonusPointsMap[student.id] || [];
        const bonusPts = bonusList.reduce((acc, b) => acc + Number(b.points || 0), 0);

        const total = attPts + ibadahPts + quranPts + tasksPts + bonusPts;

        const badges = [];
        if (total >= 250) badges.push('Punctual Star');
        if (quranPts >= 80) badges.push('Quran Star');
        if (ibadahPts >= 70) badges.push('Congregation Champion');
        if (bonusPts > 0) badges.push('Exemplary Adab');

        return {
            student,
            attPts,
            ibadahPts,
            quranPts,
            tasksPts,
            bonusPts,
            total,
            badges
        };
    });

    scores.sort((a, b) => b.total - a.total);

    if (scores.length) {
        const top = scores[0];
        if (topNameEl) topNameEl.textContent = top.student.name || 'Student';
        if (topPtsEl) topPtsEl.textContent = `${top.total} Total Points`;

        const avg = Math.round(scores.reduce((a, b) => a + b.total, 0) / scores.length);
        if (classAvgEl) classAvgEl.textContent = avg;

        const totalB = scores.reduce((a, b) => a + b.badges.length, 0);
        if (totalBadgesEl) totalBadgesEl.textContent = totalB;
    }

    if (!tbody) return;

    tbody.innerHTML = scores.map((item, idx) => {
        const rank = idx + 1;
        let rankBadge = `<span class="font-bold text-slate-400">#${rank}</span>`;
        if (rank === 1) rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-400 text-white font-black text-xs inline-flex items-center justify-center shadow-xs">1</span>`;
        else if (rank === 2) rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-300 text-slate-800 font-black text-xs inline-flex items-center justify-center shadow-xs">2</span>`;
        else if (rank === 3) rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-600 text-white font-black text-xs inline-flex items-center justify-center shadow-xs">3</span>`;

        return `
            <tr class="hover:bg-slate-50/80">
                <td class="py-2.5 px-3 text-center">${rankBadge}</td>
                <td class="py-2.5 px-3 font-mono font-bold text-slate-600">${escapeHtml(item.student.adm || item.student.admNo || '-')}</td>
                <td class="py-2.5 px-4 font-black text-slate-900">${escapeHtml(item.student.name || '--')}</td>
                <td class="py-2.5 px-3 text-center font-bold text-slate-600">${item.attPts}</td>
                <td class="py-2.5 px-3 text-center font-bold text-emerald-600">${item.ibadahPts}</td>
                <td class="py-2.5 px-3 text-center font-bold text-indigo-600">${item.quranPts}</td>
                <td class="py-2.5 px-3 text-center font-bold text-slate-600">${item.tasksPts}</td>
                <td class="py-2.5 px-3 text-center font-black text-sm text-amber-600">${item.total}</td>
                <td class="py-2.5 px-4">
                    <div class="flex items-center gap-1 flex-wrap">
                        ${item.badges.length ? item.badges.map(b => `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-900 border border-amber-200">${escapeHtml(b)}</span>`).join('') : '<span class="text-slate-400 text-[10px]">Earning Badges</span>'}
                    </div>
                </td>
                <td class="py-2.5 px-3 text-right">
                    <button type="button" class="btn-award-single-student p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 font-bold text-xs" data-student-id="${item.student.id}">
                        <i class="fas fa-medal mr-1"></i>+Award
                    </button>
                </td>
            </tr>`;
    }).join('');
};

const awardBonusPoints = async () => {
    const studentId = document.getElementById('modal-award-student-select')?.value;
    const points = Number(document.getElementById('modal-award-points-input')?.value || 10);
    const reason = document.getElementById('modal-award-reason')?.value.trim();

    if (!studentId) return alert('Please select a student.');
    if (!reason) return alert('Please enter a reason for the award.');

    try {
        const docRef = doc(db, `${BASE_PATH}/studentBonusPoints`, studentId);
        const snap = await getDoc(docRef);
        const existing = snap.exists() ? (snap.data().pointsList || []) : [];

        existing.push({
            id: `bonus_${Date.now()}`,
            points,
            reason,
            awardedBy: currentStaffName,
            date: getTodayDateString()
        });

        await setDoc(docRef, {
            pointsList: existing,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-award-points');
        showToast(`Awarded +${points} points to student!`, 'success');
        loadRewardsLeaderboard();
    } catch (err) {
        alert('Failed to award points: ' + err.message);
    }
};

// =========================================================================
// SETUP EVENT LISTENERS
// =========================================================================
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

    // Modal Close delegation
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-close-modal');
        if (btn) {
            const modalId = btn.dataset.modal;
            if (modalId) closeModal(modalId);
        }
    });

    // 2. Daily Attendance Listeners
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

    // Daily Batch Actions
    document.getElementById('btn-mark-all-p')?.addEventListener('click', () => markAllStudents('P'));
    document.getElementById('btn-mark-all-a')?.addEventListener('click', () => markAllStudents('A'));
    document.getElementById('btn-mark-all-l')?.addEventListener('click', () => markAllStudents('L'));
    document.getElementById('btn-clear-all')?.addEventListener('click', clearAllStudents);

    // Individual Toggle Delegation
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

    document.getElementById('daily-roster-tbody')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('student-remarks-input')) {
            markUnsavedChanges();
        }
    });

    document.getElementById('btn-save-daily')?.addEventListener('click', saveDailyAttendance);

    // 3. Monthly Listeners
    document.getElementById('btn-load-monthly')?.addEventListener('click', loadMonthlyRegister);
    document.getElementById('monthly-class-select')?.addEventListener('change', loadMonthlyRegister);
    document.getElementById('monthly-month-input')?.addEventListener('change', loadMonthlyRegister);
    document.getElementById('btn-export-excel')?.addEventListener('click', exportMonthlyRegisterToExcel);
    document.getElementById('btn-print-register')?.addEventListener('click', () => window.print());

    // 4. Analytics Listeners
    document.getElementById('btn-refresh-analytics')?.addEventListener('click', loadAnalytics);
    document.getElementById('analytics-academic-year')?.addEventListener('change', loadAnalytics);
    document.getElementById('analytics-class-select')?.addEventListener('change', loadAnalytics);
    document.getElementById('analytics-comparator-select')?.addEventListener('change', loadAnalytics);
    document.getElementById('analytics-percentage-input')?.addEventListener('change', loadAnalytics);

    // 5. Calendar & Holidays Listeners
    document.getElementById('btn-save-weekends')?.addEventListener('click', saveWeekendConfig);
    document.getElementById('btn-add-holiday')?.addEventListener('click', addOrUpdateHoliday);
    document.getElementById('btn-cancel-holiday-edit')?.addEventListener('click', cancelEditHoliday);

    document.querySelectorAll('input[name="holiday-scope"]').forEach(r => {
        r.addEventListener('change', () => {
            const isSpecific = document.getElementById('holiday-scope-specific')?.checked;
            const picker = document.getElementById('holiday-classes-picker-box');
            if (picker) {
                picker.classList.toggle('hidden', !isSpecific);
            }
        });
    });

    document.getElementById('btn-holiday-select-all-classes')?.addEventListener('click', () => {
        document.querySelectorAll('.holiday-class-check').forEach(chk => { chk.checked = true; });
    });
    document.getElementById('btn-holiday-clear-classes')?.addEventListener('click', () => {
        document.querySelectorAll('.holiday-class-check').forEach(chk => { chk.checked = false; });
    });

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

    // 6. Session Schedule Listeners
    document.getElementById('session-academic-year')?.addEventListener('change', renderSessionScheduleUI);
    document.getElementById('btn-session-set-today')?.addEventListener('click', () => {
        const input = document.getElementById('session-start-date-input');
        if (input) input.value = getTodayDateString();
    });
    document.getElementById('btn-save-session-schedule')?.addEventListener('click', saveSessionSchedule);

    // 7. Class Subjects Listeners
    document.getElementById('subj-academic-year')?.addEventListener('change', loadClassSubjects);
    document.getElementById('subj-class-select')?.addEventListener('change', loadClassSubjects);
    document.getElementById('btn-add-subject')?.addEventListener('click', () => openSubjectModal(null));
    document.getElementById('btn-save-subject')?.addEventListener('click', saveClassSubject);
    document.getElementById('btn-sync-subjects-schema')?.addEventListener('click', syncSubjectsFromResultSchema);

    document.getElementById('subjects-table-body')?.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.btn-edit-subject');
        if (editBtn) {
            const subj = classSubjectsList.find(s => s.id === editBtn.dataset.id);
            if (subj) openSubjectModal(subj);
            return;
        }
        const delBtn = e.target.closest('.btn-del-subject');
        if (delBtn) {
            deleteClassSubject(delBtn.dataset.id);
        }
    });

    // 8. Timetable Listeners
    document.getElementById('tt-academic-year')?.addEventListener('change', loadTimetable);
    document.getElementById('tt-class-select')?.addEventListener('change', loadTimetable);
    document.getElementById('toggle-timetable-edit')?.addEventListener('change', (e) => {
        toggleTimetableEdit(e.target.checked);
    });
    document.getElementById('btn-save-timetable')?.addEventListener('click', saveTimetableMatrix);
    document.getElementById('btn-tt-settings')?.addEventListener('click', openTimetableSettingsModal);
    document.getElementById('btn-save-tt-settings')?.addEventListener('click', saveTimetableSettings);
    document.getElementById('btn-print-timetable')?.addEventListener('click', printTimetableRoutine);
    document.getElementById('tt-settings-periods-count')?.addEventListener('change', (e) => {
        renderTimetableTimingsRows(Number(e.target.value || 5));
    });

    // 9. Academic Year Plan Listeners
    document.getElementById('yp-academic-year')?.addEventListener('change', loadYearPlan);
    document.getElementById('yp-class-select')?.addEventListener('change', loadYearPlan);
    document.getElementById('yp-calendar-type')?.addEventListener('change', () => {
        populateYearPlanMonthDropdowns();
        loadYearPlan();
    });
    document.getElementById('yp-start-month')?.addEventListener('change', renderYearPlanUI);
    document.getElementById('yp-end-month')?.addEventListener('change', renderYearPlanUI);
    document.getElementById('toggle-yearplan-edit')?.addEventListener('change', (e) => {
        toggleYearPlanEdit(e.target.checked);
    });
    document.getElementById('btn-save-yearplan')?.addEventListener('click', saveYearPlan);
    document.getElementById('btn-print-yearplan')?.addEventListener('click', printYearPlan);

    document.getElementById('yp-schedule-grid')?.addEventListener('click', (e) => {
        if (isYearPlanEditMode) return;
        const cell = e.target.closest('.yp-cell-clickable');
        if (cell) {
            const month = cell.dataset.month;
            const subjectId = cell.dataset.subjectId;
            const subjectName = cell.dataset.subjectName;
            if (month && subjectId) {
                openYearPlanExecutionModal(month, subjectId, subjectName);
            }
        }
    });

    document.getElementById('btn-save-yp-execution')?.addEventListener('click', saveYearPlanExecution);
    document.getElementById('modal-yp-progress-slider')?.addEventListener('input', (e) => {
        const valText = document.getElementById('modal-yp-progress-val');
        if (valText) valText.textContent = `${e.target.value}%`;
    });

    // 10. Exam Schedule Listeners
    document.getElementById('exam-tt-academic-year')?.addEventListener('change', loadExamTimetable);
    document.getElementById('exam-tt-title-select')?.addEventListener('change', loadExamTimetable);
    document.getElementById('exam-tt-class-filter')?.addEventListener('change', loadExamTimetable);
    document.getElementById('btn-add-exam-entry')?.addEventListener('click', () => {
        // Populate subject options in modal
        const subjInput = document.getElementById('modal-exam-subject');
        if (subjInput && classSubjectsList.length) {
            subjInput.setAttribute('list', 'exam-subjects-datalist');
            let dl = document.getElementById('exam-subjects-datalist');
            if (!dl) {
                dl = document.createElement('datalist');
                dl.id = 'exam-subjects-datalist';
                document.body.appendChild(dl);
            }
            dl.innerHTML = classSubjectsList.map(s => `<option value="${escapeHtml(s.name)}">`).join('');
        }
        openModal('modal-exam-entry');
    });
    document.getElementById('btn-save-exam-entry')?.addEventListener('click', saveExamEntry);
    document.getElementById('btn-print-exam-tt')?.addEventListener('click', () => window.print());

    document.getElementById('exam-papers-tbody')?.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.btn-del-exam-entry');
        if (delBtn) {
            deleteExamEntry(delBtn.dataset.id);
        }
    });

    // 11. Routine Tasks Listeners
    document.getElementById('tasks-class-select')?.addEventListener('change', loadTasksRoster);
    document.getElementById('tasks-date-input')?.addEventListener('change', loadTasksRoster);
    document.querySelectorAll('.tasks-freq-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tasks-freq-btn').forEach(b => {
                b.classList.remove('bg-emerald-600', 'text-white');
                b.classList.add('text-slate-600', 'hover:bg-slate-100');
            });
            btn.classList.add('bg-emerald-600', 'text-white');
            btn.classList.remove('text-slate-600', 'hover:bg-slate-100');
            currentTaskCadence = btn.dataset.freq;
            loadTasksRoster();
        });
    });

    document.getElementById('tasks-roster-tbody')?.addEventListener('change', (e) => {
        const cb = e.target.closest('.task-check-box');
        if (!cb) return;
        const studentId = cb.dataset.studentId;
        const taskId = cb.dataset.taskId;
        if (!taskCompletionsMap[studentId]) taskCompletionsMap[studentId] = {};
        taskCompletionsMap[studentId][taskId] = cb.checked;

        // Update score cell immediately
        const row = cb.closest('tr');
        if (row) {
            let total = 0;
            row.querySelectorAll('.task-check-box:checked').forEach(c => {
                const tObj = taskDefsList.find(x => x.id === c.dataset.taskId);
                if (tObj) total += Number(tObj.points || 0);
            });
            const scoreEl = row.querySelector('.student-task-score');
            if (scoreEl) scoreEl.textContent = `${total} pts`;
        }

        saveTasksCompletionsToFirestore();
    });

    document.getElementById('btn-tasks-mark-all')?.addEventListener('click', () => {
        document.querySelectorAll('.task-check-box').forEach(cb => {
            cb.checked = true;
            const studentId = cb.dataset.studentId;
            const taskId = cb.dataset.taskId;
            if (!taskCompletionsMap[studentId]) taskCompletionsMap[studentId] = {};
            taskCompletionsMap[studentId][taskId] = true;
        });
        saveTasksCompletionsToFirestore();
        loadTasksRoster();
    });

    document.getElementById('btn-tasks-clear-all')?.addEventListener('click', () => {
        document.querySelectorAll('.task-check-box').forEach(cb => {
            cb.checked = false;
        });
        taskCompletionsMap = {};
        saveTasksCompletionsToFirestore();
        loadTasksRoster();
    });

    document.getElementById('btn-open-task-def')?.addEventListener('click', () => {
        openModal('modal-task-def');
    });

    document.getElementById('btn-save-task-def')?.addEventListener('click', () => {
        const title = document.getElementById('modal-task-title')?.value.trim();
        const cadence = document.getElementById('modal-task-cadence')?.value || 'daily';
        const points = Number(document.getElementById('modal-task-points')?.value || 5);
        if (!title) return alert('Please enter a task title.');

        getDefaultTasks(cadence).push({
            id: `task_${Date.now()}`,
            title,
            cadence,
            points
        });
        closeModal('modal-task-def');
        showToast(`Task "${title}" created!`, 'success');
        loadTasksRoster();
    });

    // 12. Ibadah Listeners
    document.getElementById('ibadah-class-select')?.addEventListener('change', loadIbadahRoster);
    document.getElementById('ibadah-date-input')?.addEventListener('change', loadIbadahRoster);
    document.getElementById('btn-save-ibadah')?.addEventListener('click', saveIbadahRecords);

    document.getElementById('ibadah-roster-tbody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.ibadah-toggle-btn');
        if (!btn) return;
        const group = btn.closest('.ibadah-pill-group');
        if (group) {
            group.querySelectorAll('.ibadah-toggle-btn').forEach(b => {
                b.classList.remove('bg-emerald-600', 'bg-blue-600', 'bg-rose-600', 'text-white', 'shadow-2xs');
                b.classList.add('text-slate-500');
            });
            const val = btn.dataset.val;
            btn.classList.remove('text-slate-500');
            if (val === 'J') btn.classList.add('bg-emerald-600', 'text-white', 'shadow-2xs');
            else if (val === 'A') btn.classList.add('bg-blue-600', 'text-white', 'shadow-2xs');
            else if (val === 'Q') btn.classList.add('bg-rose-600', 'text-white', 'shadow-2xs');
        }
    });

    document.getElementById('btn-batch-subhi-jamaah')?.addEventListener('click', () => {
        document.querySelectorAll('[data-prayer="subh"] .ibadah-toggle-btn[data-val="J"]').forEach(b => b.click());
    });
    document.getElementById('btn-batch-all-fard-jamaah')?.addEventListener('click', () => {
        document.querySelectorAll('.ibadah-pill-group .ibadah-toggle-btn[data-val="J"]').forEach(b => b.click());
    });

    // 13. Quran Progress Listeners
    document.getElementById('quran-class-select')?.addEventListener('change', loadQuranRoster);
    document.getElementById('quran-stage-filter')?.addEventListener('change', loadQuranRoster);
    document.getElementById('quran-roster-tbody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-eval-quran');
        if (btn) {
            openQuranEvaluateModal(btn.dataset.studentId);
        }
    });
    document.getElementById('btn-save-quran-eval')?.addEventListener('click', saveQuranProgress);

    // 14. Rewards & Leaderboard Listeners
    document.getElementById('rewards-class-select')?.addEventListener('change', loadRewardsLeaderboard);
    document.getElementById('btn-rewards-settings')?.addEventListener('click', openRewardsSettingsModal);
    document.getElementById('btn-save-rewards-settings')?.addEventListener('click', saveRewardsRubric);
    document.getElementById('btn-open-award-points')?.addEventListener('click', () => openModal('modal-award-points'));
    document.getElementById('btn-submit-award-points')?.addEventListener('click', awardBonusPoints);

    document.getElementById('rewards-leaderboard-tbody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-award-single-student');
        if (btn) {
            const stuId = btn.dataset.studentId;
            const select = document.getElementById('modal-award-student-select');
            if (select) select.value = stuId;
            openModal('modal-award-points');
        }
    });

    document.querySelectorAll('.btn-preset-pts').forEach(b => {
        b.addEventListener('click', () => {
            const pts = b.dataset.pts;
            const input = document.getElementById('modal-award-points-input');
            if (input) input.value = pts;
        });
    });

    // 15. Sign Out
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
