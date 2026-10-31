import { signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, onSnapshot, collection, getDocs, setDoc, query, where, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
let allStaffList = [];

let institutionConfig = {};
let currentAcademicYear = '';
let availableAcademicYears = [];
let allClasses = [];

// --- Class Subjects State & Cards ---
let selectedSubjectsClass = 'all';
let classSubjectsList = []; // [ { id, name, code, teacher, weeklyPeriods } ]
let editingSubjectId = null;
let editingSubjectClass = '';
let classCardsData = {}; // classLabel -> { subjects: [], customExams: [] }
let subjectSearchQuery = '';

// --- Exam Definitions & Arabic Constants ---
const DEFAULT_EXAM_DEFS = [
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'halfYearly', label: 'Half-Yearly' },
    { key: 'annual', label: 'Annual' }
];

const ARABIC_WEEKDAYS = {
    'Sunday': 'الأحد',
    'Monday': 'الإثنين',
    'Tuesday': 'الثلاثاء',
    'Wednesday': 'الأربعاء',
    'Thursday': 'الخميس',
    'Friday': 'الجمعة',
    'Saturday': 'السبت'
};

const getActiveTeachers = () => {
    return allStaffList.filter(s => s && s.isActive !== false);
};

const populateTeacherDropdowns = () => {
    const teachers = getActiveTeachers();
    const modalTeacherSel = document.getElementById('modal-subject-teacher');
    if (modalTeacherSel) {
        const prev = modalTeacherSel.value;
        modalTeacherSel.innerHTML = `<option value="">-- Select Teacher --</option>` +
            teachers.map(t => `<option value="${escapeHtml(t.name || t.id)}">${escapeHtml(t.name || 'Staff')} (${escapeHtml(t.role || 'Teacher')})</option>`).join('');
        if (prev) modalTeacherSel.value = prev;
    }

    const modalInvigSel = document.getElementById('modal-exam-invigilator');
    if (modalInvigSel && modalInvigSel.tagName === 'SELECT') {
        const prev = modalInvigSel.value;
        modalInvigSel.innerHTML = `<option value="">-- Unassigned --</option>` +
            teachers.map(t => `<option value="${escapeHtml(t.name || t.id)}">${escapeHtml(t.name || 'Staff')}</option>`).join('');
        if (prev) modalInvigSel.value = prev;
    }
};

// --- Attendance & Weekly Off Sync State ---
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let attendanceConfig = {
    weekendDays: [5], // Default: Friday (index 5)
    weekendHistory: []
};

const getWorkingDaysFromWeekendDays = (weekendDays = [5]) => {
    return WEEKDAY_NAMES.filter((_, idx) => !weekendDays.includes(idx));
};

const getOffDaysFromWeekendDays = (weekendDays = [5]) => {
    return WEEKDAY_NAMES.filter((_, idx) => weekendDays.includes(idx));
};

// --- Timetable State ---
let selectedTtClass = '';
let isTimetableEditMode = false;
let currentClassSlots = [];
let editingTtSlotId = null;
let editingExamSessionId = null;

const normalizeTimeTo24h = (str) => {
    if (!str) return '08:00';
    str = String(str).trim();
    const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return str.slice(0, 5);
    let hours = parseInt(match[1], 10);
    const mins = match[2];
    const ampm = match[3] ? match[3].toUpperCase() : null;
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${mins}`;
};

const getDefaultClassSlots = () => [
    { slotId: 'period_1', slotNum: 1, label: 'Period 1', startTime: '07:00', endTime: '08:00', isBreak: false },
    { slotId: 'period_2', slotNum: 2, label: 'Period 2', startTime: '08:00', endTime: '09:00', isBreak: false }
];

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

// --- Exam Timetable State ---
let currentExamTitle = 'Half-Yearly';
let examTimetableEntries = [];
let examViewMode = 'single'; // 'single' | 'master'
let isMasterExamEditMode = false;
let masterExamDates = [];
let masterExamTimetables = {};
let masterExamSessions = [
    { id: 'session_1', label: 'Paper 1 (Morning)', startTime: '06:30', endTime: '08:30' }
];

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

const getArabicDayName = (dateStr) => {
    if (!dateStr) return '';
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        const dayIdx = dt.getDay(); // 0 is Sunday
        const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        return days[dayIdx] || '';
    } catch (_) {
        return '';
    }
};

const getEnglishDayName = (dateStr) => {
    if (!dateStr) return '';
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-GB', { weekday: 'short' });
    } catch (_) {
        return '';
    }
};

const normalizeClassLabel = (str = '') => String(str || '').replace(/^class\s*/i, '').trim().toLowerCase();
const isClassInDutyScope = (clsName = '', dutyList = []) => {
    if (!Array.isArray(dutyList) || dutyList.length === 0) return true;
    const targetNorm = normalizeClassLabel(clsName);
    return dutyList.some((d) => normalizeClassLabel(d) === targetNorm || String(d).trim().toLowerCase() === String(clsName).trim().toLowerCase());
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
            str.split(',').forEach((part) => addIfClass(part));
            return;
        }
        if (str.includes('/')) {
            str.split('/').forEach((part) => addIfClass(part));
            return;
        }
        classesSet.add(str);
    };

    if (staffDoc) {
        addIfClass(staffDoc.dutyClasses);
        addIfClass(staffDoc.assignedClass);
        addIfClass(staffDoc.assignedClasses);
        addIfClass(staffDoc.class);
        addIfClass(staffDoc.classes);
        addIfClass(staffDoc.teachingClasses);
        if (staffDoc.customFields) {
            addIfClass(staffDoc.customFields.dutyClasses);
            addIfClass(staffDoc.customFields.assignedClass);
            addIfClass(staffDoc.customFields.assignedClasses);
            addIfClass(staffDoc.customFields.class);
            addIfClass(staffDoc.customFields.classes);
        }
    }
    if (staffAccess) {
        addIfClass(staffAccess.dutyClasses);
        addIfClass(staffAccess.assignedClass);
        addIfClass(staffAccess.assignedClasses);
        addIfClass(staffAccess.class);
        addIfClass(staffAccess.classes);
    }
    return Array.from(classesSet).map(c => c.trim()).filter(Boolean);
};

// --- Sidebar Management ---
const isDesktop = () => window.innerWidth >= 1024;

const setSidebarCollapsed = (collapsed) => {
    const appEl = document.getElementById('academic-app');
    const overlay = document.getElementById('drawer-overlay');
    if (!appEl) return;

    if (collapsed) {
        appEl.classList.add('sidebar-collapsed');
        if (overlay) {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        }
    } else {
        appEl.classList.remove('sidebar-collapsed');
        if (!isDesktop() && overlay) {
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.remove('opacity-0'), 10);
        }
    }

    try {
        localStorage.setItem('academic_sidebar_collapsed', collapsed ? 'true' : 'false');
    } catch (_) {}
};

const toggleSidebarState = () => {
    const appEl = document.getElementById('academic-app');
    if (!appEl) return;
    setSidebarCollapsed(!appEl.classList.contains('sidebar-collapsed'));
};

const initSidebarState = () => {
    try {
        const saved = localStorage.getItem('academic_sidebar_collapsed');
        if (saved !== null) {
            setSidebarCollapsed(saved === 'true');
        } else {
            setSidebarCollapsed(!isDesktop());
        }
    } catch (_) {
        setSidebarCollapsed(!isDesktop());
    }
};

// --- Modal Utilities ---
const openModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    }
};

const closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
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
    if (targetTabId === 'tab-subjects') {
        loadClassSubjects();
    } else if (targetTabId === 'tab-timetable') {
        loadTimetable();
    } else if (targetTabId === 'tab-yearplan') {
        loadYearPlan();
    } else if (targetTabId === 'tab-exam-schedule') {
        const y = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
        const c = document.getElementById('exam-tt-class-select')?.value || '1';
        loadAvailableExams(y, c).then(() => {
            loadExamTimetable();
        });
    } else if (targetTabId === 'tab-master-timetable') {
        const y = document.getElementById('master-tt-academic-year')?.value || currentAcademicYear;
        loadAvailableExams(y, 'all').then(() => {
            loadMasterExamTimetable();
        });
    }
};

const initTabNavigation = () => {
    const drawerLinks = document.querySelectorAll('.drawer-link');
    drawerLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.dataset.tab;
            if (tabId) {
                activateTab(tabId);
                const hash = link.getAttribute('href');
                if (hash && window.location.hash !== hash) {
                    history.pushState(null, '', hash);
                }
            }
        });
    });

    const hash = window.location.hash;
    if (hash === '#timetable') activateTab('tab-timetable');
    else if (hash === '#year-plan' || hash === '#yearplan') activateTab('tab-yearplan');
    else if (hash === '#exam-schedule') activateTab('tab-exam-schedule');
    else if (hash === '#master-timetable') activateTab('tab-master-timetable');
    else activateTab('tab-subjects');
};

// --- Clock Display ---
const startClock = () => {
    const clockEl = document.getElementById('live-clock-display');
    const update = () => {
        if (!clockEl) return;
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };
    update();
    setInterval(update, 1000);
};

// --- Initialization & Auth ---
const initApp = async () => {
    initSidebarState();
    initTabNavigation();
    startClock();
    setupEventListeners();

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            try {
                await signInAnonymously(auth);
            } catch (err) {
                console.warn('Anonymous auth failed, checking session store:', err);
            }
        }
        await restoreSessionContext();
        setupRealtimeListeners();
    });
};

const restoreSessionContext = async () => {
    const staffState = window.AppSession?.getStaffState?.() || {};
    const adminState = window.AppSession?.getAdminState?.() || {};

    if (adminState && (adminState.role === 'admin' || adminState.isMasterAdmin)) {
        isSuperAdmin = true;
        currentStaffName = 'Administrator';
        currentStaffRole = 'Super Administrator';
    } else if (staffState && staffState.profile) {
        currentStaffDoc = staffState.profile;
        currentStaffName = staffState.profile.name || 'Staff Member';
        currentStaffRole = staffState.profile.role || 'Class Teacher';
        teacherAssignedClasses = getStaffAssignedClasses(staffState.profile, staffState.access);
    }

    const userNameEl = document.getElementById('header-user-name');
    const userRoleEl = document.getElementById('header-user-role');
    if (userNameEl) userNameEl.textContent = currentStaffName;
    if (userRoleEl) userRoleEl.textContent = currentStaffRole;
};

const setupRealtimeListeners = () => {
    // 1. Institution Branding & Settings
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'institution'), (snap) => {
        if (snap.exists()) {
            institutionConfig = snap.data();
            applyInstitutionBranding(institutionConfig);
            const titleEl = document.getElementById('header-title');
            if (titleEl && institutionConfig.name) {
                titleEl.textContent = institutionConfig.name;
            }
        }
    });

    // 2. Academic Years
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'academicYears'), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            availableAcademicYears = data.years || [];
            currentAcademicYear = data.activeYear || (availableAcademicYears[0]?.year || availableAcademicYears[0] || '2025-2026');
            if (typeof currentAcademicYear === 'object') {
                currentAcademicYear = currentAcademicYear.year || currentAcademicYear.label || '';
            }
        }
        const activeYearEl = document.getElementById('header-active-year');
        if (activeYearEl) {
            activeYearEl.textContent = currentAcademicYear ? `Session ${currentAcademicYear}` : 'No Active Session';
        }
        populateAcademicYearDropdowns();
    });

    // 3. Classes
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'classes'), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            allClasses = (data.list || data.classes || []).map(c => String(c.id || c.name || c).trim()).filter(Boolean);
        }
        if (!allClasses.length) {
            allClasses = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
        }
        populateClassDropdowns();
    });

    // 4. Attendance Calendar & Weekly Off Settings Sync
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'attendanceConfig'), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            attendanceConfig = {
                ...attendanceConfig,
                ...data,
                weekendDays: Array.isArray(data.weekendDays) ? data.weekendDays : [5],
                weekendHistory: Array.isArray(data.weekendHistory) ? data.weekendHistory : []
            };
            syncTimetableWorkingDaysWithAttendance();
        }
    });

    // 5. Institutional Timetable Structure Sync
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'timetableStructure'), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data.slots) && data.slots.length) {
                timetableConfig.slots = data.slots;
                timetableConfig.periodsCount = data.slots.length;
                timetableConfig.timings = data.slots.map((s, idx) => ({
                    periodNum: idx + 1,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    label: s.label
                }));
                renderTimetableMatrixUI();
            }
        }
    });

    // 6. Live Staff & Duty Classes Sync
    onSnapshot(collection(db, `${BASE_PATH}/staff`), (snap) => {
        const staffDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        allStaffList = staffDocs;
        populateTeacherDropdowns();
        if (!isSuperAdmin) {
            const staffAccess = window.AppSession?.getStaffAccess?.() || {};
            const staffEmailKey = String(staffAccess.email || '').trim().toLowerCase();
            const staffPhoneKey = String(staffAccess.phone || '').replace(/\D/g, '');
            const staffIdKey = staffAccess.staffId || '';

            const matchedStaff = staffDocs.find(s => 
                (staffIdKey && s.id === staffIdKey) ||
                (staffEmailKey && s.email && s.email.toLowerCase() === staffEmailKey) ||
                (staffPhoneKey && s.phone && String(s.phone).replace(/\D/g, '').includes(staffPhoneKey)) ||
                (s.name && currentStaffName && s.name.toLowerCase() === currentStaffName.toLowerCase())
            );
            if (matchedStaff) {
                currentStaffDoc = matchedStaff;
                teacherAssignedClasses = getStaffAssignedClasses(matchedStaff, staffAccess);
                if (window.AppSession?.updateStaffAccess) {
                    window.AppSession.updateStaffAccess({
                        dutyClasses: Array.isArray(matchedStaff.dutyClasses) ? matchedStaff.dutyClasses : [],
                        staffId: matchedStaff.id,
                        name: matchedStaff.name || ''
                    });
                }
                if (teacherAssignedClasses.length > 0) {
                    currentStaffRole = `Class ${teacherAssignedClasses.join(', ')} Teacher`;
                    const userRoleEl = document.getElementById('header-user-role');
                    if (userRoleEl) userRoleEl.textContent = currentStaffRole;
                }
            } else if (staffAccess) {
                teacherAssignedClasses = getStaffAssignedClasses(null, staffAccess);
            }
            populateClassDropdowns();
        } else {
            populateTeacherDropdowns();
        }
    });
};

const syncTimetableWorkingDaysWithAttendance = () => {
    const derivedWorkingDays = getWorkingDaysFromWeekendDays(attendanceConfig.weekendDays || [5]);
    const derivedOffDays = getOffDaysFromWeekendDays(attendanceConfig.weekendDays || [5]);

    timetableConfig.workingDays = derivedWorkingDays;
    timetableConfig.offDays = derivedOffDays;

    renderTimetableMatrixUI();
};

const populateAcademicYearDropdowns = () => {
    const dropdownIds = [
        'subj-academic-year',
        'tt-academic-year',
        'yp-academic-year',
        'exam-tt-academic-year',
        'master-tt-academic-year'
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
    if (isSuperAdmin) {
        return allClasses;
    }
    if (teacherAssignedClasses && teacherAssignedClasses.length > 0) {
        const filtered = allClasses.filter(c => isClassInDutyScope(c, teacherAssignedClasses));
        if (filtered.length) return filtered;
    }
    return allClasses;
};

const populateClassDropdowns = () => {
    const allowed = getAllowedClassesForTeacher();

    // 1. Subject class filter
    const subjClassSelect = document.getElementById('subj-class-select');
    if (subjClassSelect) {
        const prev = subjClassSelect.value;
        let opts = '';
        if (isSuperAdmin) {
            opts += `<option value="all">All Classes</option>`;
        }
        opts += allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`).join('');
        subjClassSelect.innerHTML = opts || `<option value="">No Classes Assigned</option>`;
        if (prev && (prev === 'all' || allowed.some(c => isClassInDutyScope(prev, [c])))) {
            subjClassSelect.value = prev;
        } else {
            subjClassSelect.value = isSuperAdmin ? 'all' : (allowed[0] || '1');
        }
        selectedSubjectsClass = subjClassSelect.value;
    }

    // 2. Timetable class select
    const ttClassSelect = document.getElementById('tt-class-select');
    if (ttClassSelect) {
        const prev = ttClassSelect.value;
        let opts = '';
        if (isSuperAdmin) {
            opts += `<option value="all">All Classes (Full Routine)</option>`;
        }
        opts += allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`).join('');
        ttClassSelect.innerHTML = opts || `<option value="">No Classes Assigned</option>`;
        if (prev && (prev === 'all' || allowed.some(c => isClassInDutyScope(prev, [c])))) {
            ttClassSelect.value = prev;
        } else if (allowed.length > 0) {
            ttClassSelect.value = allowed[0];
        }
        selectedTtClass = ttClassSelect.value;
    }

    // 3. Year plan class select
    const ypClassSelect = document.getElementById('yp-class-select');
    if (ypClassSelect) {
        const prev = ypClassSelect.value;
        let opts = '';
        if (isSuperAdmin) {
            opts += `<option value="all">All Classes (Full Syllabus)</option>`;
        }
        opts += allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`).join('');
        ypClassSelect.innerHTML = opts || `<option value="">No Classes Assigned</option>`;
        if (prev && (prev === 'all' || allowed.some(c => isClassInDutyScope(prev, [c])))) {
            ypClassSelect.value = prev;
        } else if (allowed.length > 0) {
            ypClassSelect.value = allowed[0];
        }
        selectedYpClass = ypClassSelect.value;
    }

    // 4. Exam Timetable class select
    const examClassSelect = document.getElementById('exam-tt-class-select');
    if (examClassSelect) {
        const prev = examClassSelect.value;
        const opts = allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`).join('');
        examClassSelect.innerHTML = opts || `<option value="">No Classes Assigned</option>`;
        if (prev && allowed.some(c => isClassInDutyScope(prev, [c]))) {
            examClassSelect.value = prev;
        } else if (allowed.length > 0) {
            examClassSelect.value = allowed[0];
        }
    }

    // 5. Modal Subject Class Select
    const modalSubjClass = document.getElementById('modal-subject-class-select');
    if (modalSubjClass) {
        const prev = modalSubjClass.value;
        modalSubjClass.innerHTML = allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`).join('');
        if (prev && allowed.includes(prev)) {
            modalSubjClass.value = prev;
        } else if (allowed.length > 0) {
            modalSubjClass.value = allowed[0];
        }
    }

    // 6. Modal Exam Specific Class Select
    const modalExamSpecificClass = document.getElementById('modal-new-exam-specific-class');
    if (modalExamSpecificClass) {
        const list = (allClasses && allClasses.length) ? allClasses : allowed;
        modalExamSpecificClass.innerHTML = list.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`).join('');
    }

    // 7. Modal Exam Class Display
    const modalExamClassDisplay = document.getElementById('modal-exam-class-display');
    const modalExamClassInput = document.getElementById('modal-exam-class-select');
    if (modalExamClassDisplay && modalExamClassInput) {
        const cls = examClassSelect?.value || allowed[0] || '1';
        modalExamClassDisplay.textContent = `Class ${cls}`;
        modalExamClassInput.value = cls;
    }

    populateYearPlanMonthDropdowns();
};

const populateYearPlanMonthDropdowns = () => {
    const calTypeSel = document.getElementById('yp-calendar-type');
    const startSel = document.getElementById('yp-start-month');
    const endSel = document.getElementById('yp-end-month');
    if (!startSel || !endSel) return;

    currentYpCalendarType = calTypeSel?.value || 'gregorian';
    const monthsList = currentYpCalendarType === 'hijri' ? HIJRI_MONTHS : GREGORIAN_MONTHS;

    startSel.innerHTML = monthsList.map(m => `<option value="${m}">${m}</option>`).join('');
    endSel.innerHTML = monthsList.map(m => `<option value="${m}">${m}</option>`).join('');

    if (currentYpCalendarType === 'hijri') {
        startSel.value = currentYpStartMonth && HIJRI_MONTHS.includes(currentYpStartMonth) ? currentYpStartMonth : 'Shawwal';
        endSel.value = currentYpEndMonth && HIJRI_MONTHS.includes(currentYpEndMonth) ? currentYpEndMonth : 'Sha\'ban';
    } else {
        startSel.value = currentYpStartMonth && GREGORIAN_MONTHS.includes(currentYpStartMonth) ? currentYpStartMonth : 'June';
        endSel.value = currentYpEndMonth && GREGORIAN_MONTHS.includes(currentYpEndMonth) ? currentYpEndMonth : 'March';
    }
};

// =========================================================================
// MODULE 1: CLASS SUBJECTS MANAGEMENT
// =========================================================================
// MODULE 1: CLASS SUBJECTS MANAGEMENT & BI-DIRECTIONAL SYNC
// =========================================================================
const getClassSubjectsDocId = (year, classLabel) => {
    const cleanY = String(year || currentAcademicYear).trim().replace(/[^\w-]/g, '_');
    const cleanC = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    return `${cleanY}__${cleanC}`;
};

const getResultSchemaDocId = (year, classLabel) => {
    const cleanY = String(year || currentAcademicYear).trim().replace(/[^\w-]/g, '_');
    const cleanC = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    return `${cleanY}_${cleanC}`;
};

const syncClassSubjectsToResultSchema = async (year, classLabel, subjects) => {
    if (!year || !classLabel) return;
    try {
        const resultDocId = getResultSchemaDocId(year, classLabel);
        const resultRef = doc(db, `${BASE_PATH}/resultSchemas`, resultDocId);
        const snap = await getDoc(resultRef);

        const existingData = snap.exists() ? snap.data() : {};
        const existingSubjectRows = Array.isArray(existingData.subjectRows) ? existingData.subjectRows : [];
        const existingExamConfigs = existingData.examConfigs || {};

        const subjectNames = subjects.map(s => String(s.name || '').trim()).filter(Boolean);

        const newSubjectRows = subjectNames.map((name, index) => {
            const existingRow = existingSubjectRows.find(r => String(r.name || '').trim().toLowerCase() === name.toLowerCase());
            return {
                name: name,
                maxMarks: existingRow ? Number(existingRow.maxMarks || 100) : 100,
                passMarks: existingRow ? Number(existingRow.passMarks || 35) : 35,
                index: index
            };
        });

        await setDoc(resultRef, {
            classLabel: String(classLabel),
            academicYear: String(year),
            subjects: subjectNames,
            subjectRows: newSubjectRows,
            examConfigs: existingExamConfigs,
            updatedAt: Date.now()
        }, { merge: true });
    } catch (err) {
        console.warn('Failed to sync subjects to result schema:', err);
    }
};

const loadAllClassCardsData = async (year = currentAcademicYear) => {
    const allowed = getAllowedClassesForTeacher();
    const tasks = allowed.map(async (cls) => {
        const docId = getClassSubjectsDocId(year, cls);
        const resultDocId = getResultSchemaDocId(year, cls);
        try {
            const [subjSnap, resultSnap] = await Promise.all([
                getDoc(doc(db, `${BASE_PATH}/classSubjects`, docId)).catch(() => null),
                getDoc(doc(db, `${BASE_PATH}/resultSchemas`, resultDocId)).catch(() => null)
            ]);

            let loadedFromPlan = [];
            if (subjSnap && subjSnap.exists() && Array.isArray(subjSnap.data().subjects)) {
                loadedFromPlan = subjSnap.data().subjects;
            }

            let loadedFromResult = [];
            let customExams = [];
            if (resultSnap && resultSnap.exists()) {
                const rData = resultSnap.data();
                if (Array.isArray(rData.subjectRows) && rData.subjectRows.length) {
                    loadedFromResult = rData.subjectRows.map(r => r.name).filter(Boolean);
                } else if (Array.isArray(rData.subjects) && rData.subjects.length) {
                    loadedFromResult = rData.subjects.filter(Boolean);
                }

                const configs = rData.examConfigs || {};
                Object.entries(configs).forEach(([key, cfg]) => {
                    if (cfg && cfg.disabled !== true && !['quarterly', 'halfYearly', 'annual'].includes(key.toLowerCase())) {
                        customExams.push({
                            key,
                            label: cfg.label || key
                        });
                    }
                });
            }

            let mergedSubjects = [];
            if (loadedFromPlan.length > 0) {
                mergedSubjects = [...loadedFromPlan];
                let hasNew = false;
                loadedFromResult.forEach(rName => {
                    const trimmed = String(rName).trim();
                    if (!trimmed) return;
                    if (!mergedSubjects.some(s => String(s.name || '').trim().toLowerCase() === trimmed.toLowerCase())) {
                        mergedSubjects.push({
                            id: `subj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                            name: trimmed,
                            code: trimmed.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'SUB',
                            teacher: '',
                            weeklyPeriods: 5
                        });
                        hasNew = true;
                    }
                });
                if (hasNew) {
                    setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
                        subjects: mergedSubjects,
                        updatedAt: Date.now()
                    }, { merge: true }).catch(() => null);
                }
            } else if (loadedFromResult.length > 0) {
                mergedSubjects = loadedFromResult.map((rName, idx) => {
                    const trimmed = String(rName).trim();
                    return {
                        id: `subj_${Date.now()}_${idx}`,
                        name: trimmed,
                        code: trimmed.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || `S${idx + 1}`,
                        teacher: '',
                        weeklyPeriods: 5
                    };
                });
                setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
                    subjects: mergedSubjects,
                    updatedAt: Date.now()
                }, { merge: true }).catch(() => null);
            }

            return {
                classLabel: cls,
                subjects: mergedSubjects,
                customExams
            };
        } catch (_) {
            return {
                classLabel: cls,
                subjects: [],
                customExams: []
            };
        }
    });

    const results = await Promise.all(tasks);
    classCardsData = {};
    results.forEach(res => {
        classCardsData[res.classLabel] = res;
    });
};

const loadClassSubjects = async () => {
    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
    selectedSubjectsClass = 'all';

    await loadAllClassCardsData(year);
    renderClassSubjectsUI();
};

const renderClassSubjectsUI = () => {
    const grid = document.getElementById('subjects-cards-grid');
    const badge = document.getElementById('subj-count-badge');
    if (!grid) return;

    const allowed = getAllowedClassesForTeacher();
    const targetClasses = allowed;

    let totalSubjectsAcrossCards = 0;
    targetClasses.forEach(c => {
        totalSubjectsAcrossCards += (classCardsData[c]?.subjects?.length || 0);
    });

    if (badge) {
        badge.textContent = `${targetClasses.length} Class Card${targetClasses.length === 1 ? '' : 's'} • ${totalSubjectsAcrossCards} Total Subjects`;
    }

    if (!targetClasses.length) {
        grid.innerHTML = `
            <div class="col-span-full p-12 text-center text-slate-400 font-bold bg-white rounded-3xl border border-slate-200">
                <i class="fas fa-layer-group text-4xl mb-3 text-slate-300 block"></i>
                No duty classes assigned for this account.<br>
                <span class="text-xs text-slate-500 font-medium">Please contact administrator to configure assigned classes.</span>
            </div>`;
        return;
    }

    grid.innerHTML = targetClasses.map(c => {
        const cardData = classCardsData[c] || { subjects: [], customExams: [] };
        const subjects = cardData.subjects || [];
        const customExams = cardData.customExams || [];
        const totalPeriods = subjects.reduce((sum, s) => sum + Number(s.weeklyPeriods || 5), 0);

        return `
            <div class="class-card bg-white rounded-3xl border border-slate-200 shadow-2xs hover:shadow-md transition overflow-hidden flex flex-col justify-between" data-class="${escapeHtml(c)}">
                <!-- Card Top Header -->
                <div class="p-4 bg-gradient-to-r from-slate-50 via-white to-indigo-50/40 border-b border-slate-200 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
                            ${escapeHtml(c)}
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h4 class="font-black text-sm text-slate-900">Class ${escapeHtml(c)}</h4>
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    ${subjects.length} Subj
                                </span>
                            </div>
                            <div class="text-[11px] font-bold text-slate-500 mt-0.5">
                                <i class="fas fa-clock text-slate-400 text-[10px] mr-1"></i>${totalPeriods} Periods / Week
                            </div>
                        </div>
                    </div>
                    <button type="button" class="btn-card-add-subject px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black transition flex items-center gap-1 cursor-pointer" data-class="${escapeHtml(c)}">
                        <i class="fas fa-plus text-[10px]"></i> Add Subj
                    </button>
                </div>

                <!-- Subjects Roster Area -->
                <div class="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div class="space-y-2">
                        <div class="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                            <span>Configured Subjects (${subjects.length})</span>
                            <span>Periods</span>
                        </div>

                        ${subjects.length ? `
                            <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                ${subjects.map(s => `
                                    <div class="p-2.5 rounded-2xl bg-slate-50/80 hover:bg-slate-100/70 border border-slate-200/80 transition flex items-center justify-between gap-2 text-xs">
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center gap-1.5">
                                                <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">
                                                    ${escapeHtml(s.code || 'SUB')}
                                                </span>
                                                <span class="font-black text-slate-900 truncate">${escapeHtml(s.name)}</span>
                                            </div>
                                            <div class="flex items-center gap-2 text-[10px] text-slate-500 font-semibold mt-1">
                                                <span class="truncate"><i class="fas fa-user-tie text-[9px] mr-1 text-slate-400"></i>${escapeHtml(s.teacher || 'Unassigned')}</span>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2 shrink-0">
                                            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-white text-indigo-700 border border-slate-200">
                                                ${s.weeklyPeriods || 5} P/Wk
                                            </span>
                                            <div class="flex items-center gap-1">
                                                <button type="button" class="btn-edit-subject p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white transition cursor-pointer" data-id="${escapeHtml(s.id)}" data-class="${escapeHtml(c)}" title="Edit Subject">
                                                    <i class="fas fa-pen-to-square text-xs"></i>
                                                </button>
                                                <button type="button" class="btn-del-subject p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white transition cursor-pointer" data-id="${escapeHtml(s.id)}" data-class="${escapeHtml(c)}" title="Delete Subject">
                                                    <i class="fas fa-trash-can text-xs"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="p-4 rounded-2xl border border-dashed border-slate-200 text-center text-slate-400 font-bold text-xs py-5">
                                No subjects added for Class ${escapeHtml(c)} yet.<br>
                                <span class="text-[11px] text-slate-500 font-medium">Click "Add Subj" to configure the first subject.</span>
                            </div>
                        `}
                    </div>

                    <!-- Active Examinations Roster for this Class -->
                    <div class="pt-3 border-t border-slate-100 space-y-1.5">
                        <div class="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                            <span>Applicable Examinations</span>
                            <button type="button" class="btn-card-manage-exams text-indigo-600 hover:text-indigo-800 text-[10px] font-extrabold cursor-pointer" data-class="${escapeHtml(c)}">
                                <i class="fas fa-plus-circle mr-0.5"></i> Custom Exam
                            </button>
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <i class="fas fa-check-circle text-[8px] text-emerald-600"></i> Quarterly
                            </span>
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <i class="fas fa-check-circle text-[8px] text-emerald-600"></i> Half-Yearly
                            </span>
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <i class="fas fa-check-circle text-[8px] text-emerald-600"></i> Annual
                            </span>
                            ${customExams.map(ex => `
                                <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                                    ${escapeHtml(ex.label)}
                                    <i class="fas fa-times text-[9px] hover:text-rose-600 cursor-pointer btn-card-delete-exam" data-key="${escapeHtml(ex.key)}" data-class="${escapeHtml(c)}" title="Delete custom exam from this class"></i>
                                </span>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- Card Bottom Direct Navigation Shortcuts -->
                <div class="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold gap-2">
                    <button type="button" class="btn-card-goto-tt flex-1 py-1.5 px-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 hover:text-indigo-600 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs" data-class="${escapeHtml(c)}" title="Open Routine Timetable for Class ${escapeHtml(c)}">
                        <i class="fas fa-calendar-days text-[10px] text-indigo-600"></i> Routine
                    </button>
                    <button type="button" class="btn-card-goto-yp flex-1 py-1.5 px-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 hover:text-indigo-600 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs" data-class="${escapeHtml(c)}" title="Open Syllabus Year Plan for Class ${escapeHtml(c)}">
                        <i class="fas fa-calendar-check text-[10px] text-indigo-600"></i> Syllabus
                    </button>
                    <button type="button" class="btn-card-goto-exam flex-1 py-1.5 px-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 hover:text-indigo-600 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs" data-class="${escapeHtml(c)}" title="Open Exam Timetable for Class ${escapeHtml(c)}">
                        <i class="fas fa-file-pen text-[10px] text-indigo-600"></i> Exam TT
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

const openSubjectModal = (subject = null, targetClass = null) => {
    editingSubjectId = subject ? subject.id : null;
    const allowed = getAllowedClassesForTeacher();
    editingSubjectClass = targetClass || (subject ? (editingSubjectClass || selectedSubjectsClass) : (selectedSubjectsClass !== 'all' ? selectedSubjectsClass : (allowed[0] || '1')));

    const titleEl = document.getElementById('modal-subject-title');
    const idInput = document.getElementById('modal-subject-id');
    const codeInput = document.getElementById('modal-subject-code');
    const nameInput = document.getElementById('modal-subject-name');
    const teacherSelect = document.getElementById('modal-subject-teacher');
    const periodsInput = document.getElementById('modal-subject-weekly-periods');
    const classSelect = document.getElementById('modal-subject-class-select');

    if (titleEl) titleEl.textContent = subject ? `Edit Subject (Class ${editingSubjectClass})` : `Add Subject (Class ${editingSubjectClass})`;
    if (idInput) idInput.value = subject ? subject.id : '';
    if (codeInput) codeInput.value = subject ? subject.code : '';
    if (nameInput) nameInput.value = subject ? subject.name : '';
    if (periodsInput) periodsInput.value = subject ? (subject.weeklyPeriods || 5) : 5;

    if (classSelect) {
        classSelect.innerHTML = allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`).join('');
        classSelect.value = editingSubjectClass;
    }

    populateTeacherDropdowns();
    if (teacherSelect && subject) {
        teacherSelect.value = subject.teacher || '';
    }

    openModal('modal-subject-edit');
};

const saveClassSubject = async () => {
    let code = document.getElementById('modal-subject-code')?.value.trim().toUpperCase();
    const name = document.getElementById('modal-subject-name')?.value.trim();
    const teacher = document.getElementById('modal-subject-teacher')?.value.trim() || '';
    const weeklyPeriods = Number(document.getElementById('modal-subject-weekly-periods')?.value || 5);
    const targetClass = document.getElementById('modal-subject-class-select')?.value || editingSubjectClass || '1';

    if (!name) return alert('Please enter a subject name.');

    if (!code) {
        code = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'SUB';
    }

    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
    const docId = getClassSubjectsDocId(year, targetClass);

    try {
        const snap = await getDoc(doc(db, `${BASE_PATH}/classSubjects`, docId)).catch(() => null);
        let subjectsList = snap && snap.exists() && Array.isArray(snap.data().subjects) ? snap.data().subjects : [];

        if (editingSubjectId) {
            const item = subjectsList.find(s => s.id === editingSubjectId);
            if (item) {
                item.code = code;
                item.name = name;
                item.teacher = teacher;
                item.weeklyPeriods = weeklyPeriods;
            } else {
                subjectsList.push({ id: editingSubjectId, code, name, teacher, weeklyPeriods });
            }
        } else {
            subjectsList.push({
                id: `subj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                code,
                name,
                teacher,
                weeklyPeriods
            });
        }

        await setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
            subjects: subjectsList,
            updatedAt: Date.now()
        }, { merge: true });

        // Bi-directional sync: update resultSchemas as well
        await syncClassSubjectsToResultSchema(year, targetClass, subjectsList);

        closeModal('modal-subject-edit');
        showToast(`Subject "${name}" saved for Class ${targetClass}!`, 'success');
        await loadClassSubjects();
    } catch (err) {
        alert('Failed to save subject: ' + err.message);
    }
};

const deleteClassSubject = async (subjectId, targetClass) => {
    if (!confirm(`Are you sure you want to delete this subject from Class ${targetClass}?`)) return;

    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
    const docId = getClassSubjectsDocId(year, targetClass);

    try {
        const snap = await getDoc(doc(db, `${BASE_PATH}/classSubjects`, docId)).catch(() => null);
        let subjectsList = snap && snap.exists() && Array.isArray(snap.data().subjects) ? snap.data().subjects : [];
        subjectsList = subjectsList.filter(s => s.id !== subjectId);

        await setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
            subjects: subjectsList,
            updatedAt: Date.now()
        }, { merge: true });

        await syncClassSubjectsToResultSchema(year, targetClass, subjectsList);
        showToast(`Subject removed from Class ${targetClass}.`, 'info');
        await loadClassSubjects();
    } catch (err) {
        alert('Failed to delete subject: ' + err.message);
    }
};

const deleteCustomExamFromCard = async (examKey, targetClass) => {
    if (!confirm(`Are you sure you want to delete this custom exam from Class ${targetClass}?`)) return;
    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
    const resultDocId = getResultSchemaDocId(year, targetClass);

    try {
        const snap = await getDoc(doc(db, `${BASE_PATH}/resultSchemas`, resultDocId));
        if (snap.exists()) {
            const data = snap.data();
            const configs = data.examConfigs || {};
            if (configs[examKey]) {
                delete configs[examKey];
                await setDoc(doc(db, `${BASE_PATH}/resultSchemas`, resultDocId), {
                    examConfigs: configs,
                    updatedAt: Date.now()
                }, { merge: true });
                showToast(`Custom exam deleted from Class ${targetClass}.`, 'info');
                await loadClassSubjects();
            }
        }
    } catch (err) {
        alert('Failed to delete exam: ' + err.message);
    }
};

const jumpToClassTab = (tabId, targetClass) => {
    const tabLink = document.querySelector(`.drawer-link[data-tab="${tabId}"]`);
    if (tabLink) tabLink.click();

    if (tabId === 'tab-timetable') {
        const sel = document.getElementById('tt-class-select');
        if (sel) { sel.value = targetClass; sel.dispatchEvent(new Event('change')); }
    } else if (tabId === 'tab-yearplan') {
        const sel = document.getElementById('yp-class-select');
        if (sel) { sel.value = targetClass; sel.dispatchEvent(new Event('change')); }
    } else if (tabId === 'tab-exam-schedule') {
        const sel = document.getElementById('exam-tt-class-select');
        if (sel) { sel.value = targetClass; sel.dispatchEvent(new Event('change')); }
    }
};

const syncSubjectsFromResultSchema = async () => {
    try {
        showToast('Synchronizing with Result Management...', 'info');
        await loadClassSubjects();
        showToast('Class subjects synchronized successfully!', 'success');
    } catch (err) {
        alert('Failed to synchronize subjects: ' + err.message);
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

const ensureClassSubjectsLoaded = async (year, classLabel) => {
    try {
        const docId = getClassSubjectsDocId(year, classLabel);
        const subjSnap = await getDoc(doc(db, `${BASE_PATH}/classSubjects`, docId));
        if (subjSnap.exists() && Array.isArray(subjSnap.data().subjects) && subjSnap.data().subjects.length) {
            classSubjectsList = subjSnap.data().subjects;
            return;
        }

        const resultDocId = getResultSchemaDocId(year, classLabel);
        const resultSnap = await getDoc(doc(db, `${BASE_PATH}/resultSchemas`, resultDocId));
        if (resultSnap.exists()) {
            const rData = resultSnap.data();
            const names = Array.isArray(rData.subjectRows) && rData.subjectRows.length
                ? rData.subjectRows.map(r => r.name).filter(Boolean)
                : (rData.subjects || []).filter(Boolean);
            if (names.length) {
                classSubjectsList = names.map((name, idx) => ({
                    id: `subj_${Date.now()}_${idx}`,
                    name: name,
                    code: name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || `S${idx + 1}`,
                    teacher: '',
                    weeklyPeriods: 5
                }));
                await setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
                    subjects: classSubjectsList,
                    updatedAt: Date.now()
                }, { merge: true });
                return;
            }
        }
        classSubjectsList = [];
    } catch (err) {
        console.warn('Failed to ensure class subjects loaded:', err);
    }
};

let allClassesTimetables = {}; // classLabel -> { matrix, subjects }

const loadTimetable = async () => {
    const year = document.getElementById('tt-academic-year')?.value || currentAcademicYear;
    selectedTtClass = document.getElementById('tt-class-select')?.value || selectedSubjectsClass || '1';
    const heading = document.getElementById('tt-view-heading');

    if (selectedTtClass === 'all') {
        if (heading) heading.textContent = `All Classes Routine Timetables (${year})`;
        const allowed = getAllowedClassesForTeacher();
        const tasks = allowed.map(async (cls) => {
            const docId = getTimetableDocId(year, cls);
            const subjDocId = getClassSubjectsDocId(year, cls);
            const [tSnap, sSnap] = await Promise.all([
                getDoc(doc(db, `${BASE_PATH}/timetables`, docId)).catch(() => null),
                getDoc(doc(db, `${BASE_PATH}/classSubjects`, subjDocId)).catch(() => null)
            ]);
            let clsSlots = getDefaultClassSlots();
            if (tSnap && tSnap.exists()) {
                const td = tSnap.data();
                if (Array.isArray(td.slots) && td.slots.length) clsSlots = td.slots;
                else if (td.config && Array.isArray(td.config.slots) && td.config.slots.length) clsSlots = td.config.slots;
            }
            return {
                classLabel: cls,
                slots: clsSlots,
                matrix: tSnap && tSnap.exists() ? (tSnap.data().matrix || {}) : {},
                subjects: sSnap && sSnap.exists() && Array.isArray(sSnap.data().subjects) ? sSnap.data().subjects : []
            };
        });
        const results = await Promise.all(tasks);
        allClassesTimetables = {};
        results.forEach(r => { allClassesTimetables[r.classLabel] = r; });
        timetableConfig.workingDays = getWorkingDaysFromWeekendDays(attendanceConfig.weekendDays || [5]);
        timetableConfig.offDays = getOffDaysFromWeekendDays(attendanceConfig.weekendDays || [5]);
        renderTimetableMatrixUI();
        return;
    }

    if (heading) heading.textContent = `Class ${selectedTtClass} Weekly Routine Timetable (${year})`;

    await ensureClassSubjectsLoaded(year, selectedTtClass);

    try {
        const docId = getTimetableDocId(year, selectedTtClass);
        const docSnap = await getDoc(doc(db, `${BASE_PATH}/timetables`, docId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            timetableMatrix = data.matrix || {};
            if (Array.isArray(data.slots) && data.slots.length > 0) {
                currentClassSlots = data.slots;
            } else if (data.config && Array.isArray(data.config.slots) && data.config.slots.length > 0) {
                currentClassSlots = data.config.slots;
            } else {
                currentClassSlots = getDefaultClassSlots();
            }
        } else {
            timetableMatrix = {};
            currentClassSlots = getDefaultClassSlots();
        }
        // Always enforce institutional working days and off days derived from attendanceConfig
        timetableConfig.workingDays = getWorkingDaysFromWeekendDays(attendanceConfig.weekendDays || [5]);
        timetableConfig.offDays = getOffDaysFromWeekendDays(attendanceConfig.weekendDays || [5]);
    } catch (err) {
        console.error('Failed to load timetable:', err);
    }

    renderTimetableMatrixUI();
};

const normalizeTimetableSlots = (config = {}) => {
    if (Array.isArray(config.slots) && config.slots.length) {
        return config.slots.map((s, idx) => ({
            slotId: s.slotId || `slot_${idx + 1}`,
            slotNum: Number(s.slotNum || idx + 1),
            label: s.label || `Period ${idx + 1}`,
            startTime: s.startTime || '08:00',
            endTime: s.endTime || '08:45',
            isBreak: Boolean(s.isBreak)
        }));
    }
    const count = Number(config.periodsCount || (Array.isArray(config.timings) ? config.timings.length : 5));
    const timings = Array.isArray(config.timings) ? config.timings : [];
    const slots = [];
    for (let p = 1; p <= count; p++) {
        const t = timings.find(x => x.periodNum === p) || { startTime: `0${6 + p}:00`, endTime: `0${6 + p}:45` };
        slots.push({
            slotId: `slot_${p}`,
            slotNum: p,
            label: t.label || `Period ${p}`,
            startTime: t.startTime || '08:00',
            endTime: t.endTime || '08:45',
            isBreak: false
        });
    }
    return slots;
};

const renderTimetableMatrixUI = () => {
    const grid = document.getElementById('tt-schedule-grid');
    const workingDaysBadge = document.getElementById('tt-working-days-badge');
    const totalPeriodsBadge = document.getElementById('tt-total-periods-badge');

    const workingDays = timetableConfig.workingDays && timetableConfig.workingDays.length
        ? timetableConfig.workingDays
        : getWorkingDaysFromWeekendDays(attendanceConfig.weekendDays || [5]);

    const slots = (selectedTtClass !== 'all' && Array.isArray(currentClassSlots) && currentClassSlots.length > 0)
        ? currentClassSlots
        : normalizeTimetableSlots(timetableConfig);
    const teachingSlotsCount = slots.filter(s => !s.isBreak).length;

    if (workingDaysBadge) workingDaysBadge.textContent = `${workingDays.length} Working Days / Wk`;
    if (totalPeriodsBadge) totalPeriodsBadge.textContent = `${teachingSlotsCount} Teaching Periods / Day`;

    if (!grid) return;

    if (selectedTtClass === 'all') {
        const allowed = getAllowedClassesForTeacher();
        grid.innerHTML = allowed.map(cls => {
            const cData = allClassesTimetables[cls] || { matrix: {}, subjects: [], slots: [] };
            const matrix = cData.matrix || {};
            const cSlots = (Array.isArray(cData.slots) && cData.slots.length > 0) ? cData.slots : slots;

            return `
                <div class="mb-8 bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
                    <div class="p-3.5 bg-gradient-to-r from-slate-50 to-indigo-50/50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                        <div class="flex items-center gap-2.5">
                            <span class="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs">${escapeHtml(cls)}</span>
                            <h4 class="font-black text-sm text-slate-900">Class ${escapeHtml(cls)} Routine Timetable</h4>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-slate-500 font-bold">${cData.subjects.length} Subjects</span>
                            <button type="button" class="btn-goto-class-tt px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black cursor-pointer transition shadow-2xs inline-flex items-center gap-1.5" data-class="${escapeHtml(cls)}">
                                <i class="fas fa-pen-to-square"></i> Manage Class ${escapeHtml(cls)}
                            </button>
                        </div>
                    </div>
                    <div class="overflow-x-auto p-4">
                        <table class="w-full text-left border-collapse border border-slate-200 text-xs">
                            <thead>
                                <tr class="bg-slate-50 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                                    <th class="py-2.5 px-3 border-r border-slate-200 w-28 bg-slate-100 font-black">Day / Period</th>
                                    ${cSlots.map(s => `
                                        <th class="py-2 px-2.5 border-r border-slate-200 min-w-[120px] text-center ${s.isBreak ? 'bg-amber-50 text-amber-900' : ''}">
                                            <div class="font-black text-[11px]">${escapeHtml(s.label)}</div>
                                            <div class="text-[9px] font-semibold text-slate-500">${s.startTime} - ${s.endTime}</div>
                                        </th>
                                    `).join('')}
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200 font-medium">
                                ${workingDays.map(day => `
                                    <tr class="hover:bg-slate-50/60 transition">
                                        <td class="py-2.5 px-3 border-r border-slate-200 font-black text-slate-900 bg-slate-50/70 whitespace-nowrap">
                                            <i class="fas fa-calendar-day text-indigo-600 mr-1.5 text-xs"></i>${day}
                                        </td>
                                        ${cSlots.map((s, pIdx) => {
                                            const p = pIdx + 1;
                                            const slotKey = `${day}_${s.slotId}`;
                                            const legacyKey = `${day}_${p}`;
                                            const legacyNumKey = `${day}_${s.slotNum}`;
                                            const sData = matrix[slotKey] || matrix[legacyKey] || matrix[legacyNumKey] || {};
                                            if (s.isBreak) {
                                                return `<td class="p-2 border-r border-slate-200 text-center bg-amber-50/30 text-amber-700 font-black text-[10px] uppercase select-none"><i class="fas fa-mug-hot text-amber-500 mr-1"></i>${escapeHtml(s.label)}</td>`;
                                            }
                                            return `
                                                <td class="p-2 border-r border-slate-200 align-top">
                                                    ${sData.subjectName ? `
                                                        <div class="p-2 rounded-xl bg-indigo-50/70 border border-indigo-200/80">
                                                            <div class="font-black text-xs text-slate-900 leading-tight">${escapeHtml(sData.subjectName)}</div>
                                                            <div class="text-[11px] text-indigo-800 font-semibold mt-1 truncate"><i class="fas fa-user-tie text-[9px] mr-1 opacity-70"></i>${escapeHtml(sData.teacher || 'Ustad')}</div>
                                                        </div>
                                                    ` : `<span class="text-[10px] text-slate-400 italic block text-center py-2">-- Free --</span>`}
                                                </td>`;
                                        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');
        return;
    }

    if (!selectedTtClass) {
        grid.innerHTML = `<div class="p-8 text-center text-slate-400 font-bold">Please select a class to view routine timetable.</div>`;
        return;
    }

    let html = `
        <table class="w-full text-left border-collapse border border-slate-200 text-xs">
            <thead>
                <tr class="bg-slate-100 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                    <th class="py-3 px-3.5 border-r border-slate-200 w-28 bg-slate-200/80">Day / Period</th>`;

    slots.forEach((slot) => {
        if (slot.isBreak) {
            html += `
                <th class="py-2.5 px-3 border-r border-slate-200 min-w-[130px] text-center bg-amber-50/70 border-b-2 border-b-amber-300">
                    <div class="flex items-center justify-between gap-1 mb-1">
                        <span class="text-[10px] font-black text-amber-900 tracking-wider flex items-center gap-1">
                            <i class="fas fa-mug-hot text-amber-600"></i> ${escapeHtml(slot.label)}
                        </span>
                        <div class="flex items-center gap-0.5">
                            <button type="button" class="btn-edit-tt-slot p-1 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer" data-slot-id="${slot.slotId}" title="Edit Break">
                                <i class="fas fa-pen-to-square text-[11px]"></i>
                            </button>
                            <button type="button" class="btn-delete-tt-slot p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer" data-slot-id="${slot.slotId}" title="Delete Break">
                                <i class="fas fa-trash-can text-[11px]"></i>
                            </button>
                        </div>
                    </div>
                    <div class="text-[10px] font-bold text-amber-700/80">${slot.startTime} - ${slot.endTime}</div>
                </th>`;
        } else {
            html += `
                <th class="py-2.5 px-3 border-r border-slate-200 min-w-[140px]">
                    <div class="flex items-center justify-between gap-1 mb-1">
                        <div class="text-[11px] font-black text-slate-900 tracking-wider">${escapeHtml(slot.label)}</div>
                        <div class="flex items-center gap-0.5">
                            <button type="button" class="btn-edit-tt-slot p-1 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer" data-slot-id="${slot.slotId}" title="Edit Period">
                                <i class="fas fa-pen-to-square text-[11px]"></i>
                            </button>
                            <button type="button" class="btn-delete-tt-slot p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer" data-slot-id="${slot.slotId}" title="Delete Period">
                                <i class="fas fa-trash-can text-[11px]"></i>
                            </button>
                        </div>
                    </div>
                    <div class="text-[10px] font-semibold text-slate-500 mt-0.5">${slot.startTime} - ${slot.endTime}</div>
                </th>`;
        }
    });
    html += `
        <th class="py-2.5 px-3 border-r border-slate-200 min-w-[75px] text-center bg-indigo-50/40">
            <button type="button" id="btn-add-tt-slot-header" class="btn-add-tt-slot inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black cursor-pointer shadow-2xs transition" title="Add Period or Break">
                <i class="fas fa-plus"></i> Add
            </button>
        </th>
    </tr></thead><tbody class="divide-y divide-slate-200 font-medium">`;

    workingDays.forEach(day => {
        html += `
            <tr class="hover:bg-slate-50/60 transition">
                <td class="py-3 px-3.5 border-r border-slate-200 font-black text-slate-900 bg-slate-50/90 whitespace-nowrap">
                    <i class="fas fa-calendar-day text-indigo-600 mr-1.5"></i>${day}
                </td>`;

        slots.forEach((slot, pIdx) => {
            const p = pIdx + 1;
            const slotKey = `${day}_${slot.slotId}`;
            const legacyKey = `${day}_${p}`;
            const legacyNumKey = `${day}_${slot.slotNum}`;
            const slotData = timetableMatrix[slotKey] || timetableMatrix[legacyKey] || timetableMatrix[legacyNumKey] || {};

            if (slot.isBreak) {
                html += `
                    <td class="p-2 border-r border-slate-200 text-center bg-amber-50/30 text-amber-700/80 font-black text-[10px] tracking-wider uppercase select-none align-middle">
                        <span class="inline-flex items-center gap-1"><i class="fas fa-mug-hot text-amber-500 text-[10px]"></i> ${escapeHtml(slot.label)}</span>
                    </td>`;
            } else if (isTimetableEditMode) {
                html += `
                    <td class="p-2 border-r border-slate-200 align-top bg-amber-50/20">
                        <select class="tt-cell-subject w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none mb-1 bg-white" data-day="${day}" data-slot="${slot.slotId}" data-period="${p}">
                            <option value="">-- Free / Recess --</option>
                            ${classSubjectsList.map(s => `
                                <option value="${s.id}" ${(slotData.subjectId === s.id || slotData.subjectName === s.name) ? 'selected' : ''}>
                                    ${escapeHtml(s.name)} (${escapeHtml(s.code)})
                                </option>
                            `).join('')}
                        </select>
                        <select class="tt-cell-teacher w-full p-1 text-[11px] border border-slate-300 rounded-lg text-slate-800 outline-none mb-1 bg-white font-bold" data-day="${day}" data-slot="${slot.slotId}" data-period="${p}">
                            <option value="">-- Select Teacher --</option>
                            ${getActiveTeachers().map(t => `
                                <option value="${escapeHtml(t.name || t.id)}" ${(slotData.teacher === t.name || slotData.teacher === t.id) ? 'selected' : ''}>
                                    ${escapeHtml(t.name || 'Staff')}
                                </option>
                            `).join('')}
                            ${slotData.teacher && !getActiveTeachers().some(t => t.name === slotData.teacher || t.id === slotData.teacher) ? `
                                <option value="${escapeHtml(slotData.teacher)}" selected>${escapeHtml(slotData.teacher)}</option>
                            ` : ''}
                        </select>
                        <input type="text" class="tt-cell-room w-full p-1 text-[10px] border border-slate-200 rounded text-slate-600 outline-none bg-white" placeholder="Room / Hall" value="${escapeHtml(slotData.room || '')}" data-day="${day}" data-slot="${slot.slotId}" data-period="${p}">
                    </td>`;
            } else {
                html += `
                    <td class="p-2.5 border-r border-slate-200 align-top">
                        ${slotData.subjectName ? `
                            <div class="p-2 rounded-xl bg-indigo-50/70 border border-indigo-200/80 shadow-2xs">
                                <div class="font-extrabold text-xs text-slate-900 leading-tight">${escapeHtml(slotData.subjectName)}</div>
                                <div class="text-[11px] text-indigo-800 font-semibold mt-1 truncate">
                                    <i class="fas fa-user-tie text-[9px] mr-1 opacity-70"></i>${escapeHtml(slotData.teacher || 'Assigned Ustad')}
                                </div>
                                ${slotData.room ? `<div class="text-[10px] text-slate-500 font-bold mt-0.5"><i class="fas fa-location-dot text-[9px] mr-1 text-slate-400"></i>${escapeHtml(slotData.room)}</div>` : ''}
                            </div>
                        ` : `
                            <div class="p-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 text-center text-slate-400 font-bold text-[11px] py-3">
                                Free Period
                            </div>
                        `}
                    </td>`;
            }
        });
        html += `
            <td class="p-2 border-r border-slate-200 bg-slate-50/20 text-center text-slate-300 font-bold text-xs select-none">
                --
            </td>
        </tr>`;
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
        const slotId = sel.dataset.slot;
        const period = sel.dataset.period;
        const subjectId = sel.value;
        const primaryKey = `${day}_${slotId}`;
        const legacyKey = `${day}_${period}`;

        const teacherInput = document.querySelector(`.tt-cell-teacher[data-day="${day}"][data-slot="${slotId}"]`)
            || document.querySelector(`.tt-cell-teacher[data-day="${day}"][data-period="${period}"]`);
        const roomInput = document.querySelector(`.tt-cell-room[data-day="${day}"][data-slot="${slotId}"]`)
            || document.querySelector(`.tt-cell-room[data-day="${day}"][data-period="${period}"]`);

        if (subjectId) {
            const subjObj = classSubjectsList.find(s => s.id === subjectId);
            const entry = {
                subjectId,
                subjectName: subjObj ? subjObj.name : 'Subject',
                subjectCode: subjObj ? subjObj.code : '',
                teacher: teacherInput?.value.trim() || (subjObj ? subjObj.teacher : ''),
                room: roomInput?.value.trim() || ''
            };
            updatedMatrix[primaryKey] = entry;
            updatedMatrix[legacyKey] = entry;
        }
    });

    timetableMatrix = updatedMatrix;

    try {
        await setDoc(doc(db, `${BASE_PATH}/timetables`, docId), {
            config: timetableConfig,
            slots: currentClassSlots,
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

const openAddEditTimetableSlotModal = (slotId = null) => {
    editingTtSlotId = slotId;
    if (!selectedTtClass || selectedTtClass === 'all') {
        const sel = document.getElementById('tt-class-select');
        const allowed = getAllowedClassesForTeacher();
        if (sel && sel.value && sel.value !== 'all') {
            selectedTtClass = sel.value;
        } else if (allowed.length > 0) {
            selectedTtClass = allowed[0];
            if (sel) sel.value = selectedTtClass;
        }
    }
    const titleEl = document.getElementById('modal-tt-slot-title');
    const subtitleEl = document.getElementById('modal-tt-slot-subtitle');
    const idInput = document.getElementById('modal-tt-slot-id');
    const labelInput = document.getElementById('modal-tt-slot-label');
    const startInput = document.getElementById('modal-tt-slot-start');
    const endInput = document.getElementById('modal-tt-slot-end');
    const typeRadios = document.querySelectorAll('input[name="modal-tt-slot-type"]');

    if (slotId) {
        const slot = currentClassSlots.find(s => s.slotId === slotId);
        if (!slot) return;
        if (titleEl) titleEl.textContent = 'Edit Period / Break';
        if (subtitleEl) subtitleEl.textContent = `Modify timing & label for Class ${selectedTtClass}`;
        if (idInput) idInput.value = slot.slotId;
        if (labelInput) labelInput.value = slot.label;
        if (startInput) startInput.value = normalizeTimeTo24h(slot.startTime);
        if (endInput) endInput.value = normalizeTimeTo24h(slot.endTime);
        typeRadios.forEach(r => {
            r.checked = slot.isBreak ? (r.value === 'break') : (r.value === 'period');
        });
    } else {
        const nextNum = currentClassSlots.filter(s => !s.isBreak).length + 1;
        const lastSlot = currentClassSlots.length > 0 ? currentClassSlots[currentClassSlots.length - 1] : null;
        let defaultStart = '09:00';
        let defaultEnd = '10:00';
        if (lastSlot && lastSlot.endTime) {
            defaultStart = normalizeTimeTo24h(lastSlot.endTime);
            const [h, m] = defaultStart.split(':').map(Number);
            const nextH = (h + 1) % 24;
            defaultEnd = `${String(nextH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
        }
        if (titleEl) titleEl.textContent = 'Add Period / Break';
        if (subtitleEl) subtitleEl.textContent = `Configure new slot for Class ${selectedTtClass}`;
        if (idInput) idInput.value = '';
        if (labelInput) labelInput.value = `Period ${nextNum}`;
        if (startInput) startInput.value = defaultStart;
        if (endInput) endInput.value = defaultEnd;
        typeRadios.forEach(r => {
            r.checked = (r.value === 'period');
        });
    }
    openModal('modal-add-edit-tt-slot');
    setTimeout(() => { labelInput?.focus(); labelInput?.select(); }, 50);
};

const saveTimetableSlot = async () => {
    const year = document.getElementById('tt-academic-year')?.value || currentAcademicYear;
    if (!selectedTtClass || selectedTtClass === 'all') {
        const sel = document.getElementById('tt-class-select');
        const allowed = getAllowedClassesForTeacher();
        if (sel && sel.value && sel.value !== 'all') {
            selectedTtClass = sel.value;
        } else if (allowed.length > 0) {
            selectedTtClass = allowed[0];
            if (sel) sel.value = selectedTtClass;
        } else {
            alert('Please select a specific class to configure periods.');
            return;
        }
    }
    const labelInput = document.getElementById('modal-tt-slot-label');
    const startInput = document.getElementById('modal-tt-slot-start');
    const endInput = document.getElementById('modal-tt-slot-end');
    const isBreak = document.querySelector('input[name="modal-tt-slot-type"]:checked')?.value === 'break';

    const label = labelInput?.value.trim();
    const startTime = startInput?.value.trim() || '08:00';
    const endTime = endInput?.value.trim() || '09:00';

    if (!label) {
        alert('Please provide a name or label for this slot.');
        return;
    }

    if (editingTtSlotId) {
        const idx = currentClassSlots.findIndex(s => s.slotId === editingTtSlotId);
        if (idx !== -1) {
            currentClassSlots[idx] = {
                ...currentClassSlots[idx],
                label,
                startTime,
                endTime,
                isBreak
            };
        }
    } else {
        const slotNum = currentClassSlots.length + 1;
        const newSlot = {
            slotId: `slot_${Date.now()}`,
            slotNum,
            label,
            startTime,
            endTime,
            isBreak
        };
        currentClassSlots.push(newSlot);
    }

    try {
        const docId = getTimetableDocId(year, selectedTtClass);
        await setDoc(doc(db, `${BASE_PATH}/timetables`, docId), {
            slots: currentClassSlots,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-add-edit-tt-slot');
        renderTimetableMatrixUI();
        showToast('Timetable period saved successfully.', 'success');
    } catch (err) {
        alert('Failed to save period: ' + err.message);
    }
};

const deleteTimetableSlot = async (slotId) => {
    const year = document.getElementById('tt-academic-year')?.value || currentAcademicYear;
    if (!selectedTtClass || selectedTtClass === 'all') return;
    const targetSlot = currentClassSlots.find(s => s.slotId === slotId);
    if (!targetSlot) return;

    if (!confirm(`Are you sure you want to delete ${targetSlot.label}? Any assigned classes for this period will also be removed.`)) {
        return;
    }

    currentClassSlots = currentClassSlots.filter(s => s.slotId !== slotId);

    // Clean up matrix entries matching this slot
    const cleanedMatrix = {};
    Object.entries(timetableMatrix).forEach(([k, v]) => {
        if (!k.endsWith(`_${slotId}`) && !k.endsWith(`_${targetSlot.slotNum}`)) {
            cleanedMatrix[k] = v;
        }
    });
    timetableMatrix = cleanedMatrix;

    try {
        const docId = getTimetableDocId(year, selectedTtClass);
        await setDoc(doc(db, `${BASE_PATH}/timetables`, docId), {
            slots: currentClassSlots,
            matrix: timetableMatrix,
            updatedAt: Date.now()
        }, { merge: true });

        renderTimetableMatrixUI();
        showToast('Period removed successfully.', 'success');
    } catch (err) {
        alert('Failed to remove period: ' + err.message);
    }
};

let currentEditingSlots = [];
let pendingTimetableWeekendIndices = null;
let pendingTimetableConfigToSave = null;

const calcSlotDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return 45;
    try {
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        let diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff < 0) diff += 24 * 60;
        return diff > 0 ? diff : 45;
    } catch (_) {
        return 45;
    }
};

const syncSlotInputsToMemory = () => {
    const container = document.getElementById('tt-timings-container');
    if (!container) return;
    const cards = container.querySelectorAll('.tt-slot-card');
    cards.forEach((card, idx) => {
        if (!currentEditingSlots[idx]) return;
        const labelInput = card.querySelector('.tt-slot-label');
        const startInput = card.querySelector('.tt-slot-start');
        const endInput = card.querySelector('.tt-slot-end');
        const breakCheckbox = card.querySelector('.tt-slot-is-break');
        if (labelInput) currentEditingSlots[idx].label = labelInput.value.trim() || `Period ${idx + 1}`;
        if (startInput) currentEditingSlots[idx].startTime = startInput.value || '08:00';
        if (endInput) currentEditingSlots[idx].endTime = endInput.value || '08:45';
        if (breakCheckbox) currentEditingSlots[idx].isBreak = breakCheckbox.checked;
    });
};

const renderTimetableSlotsEditor = () => {
    const container = document.getElementById('tt-timings-container');
    const badge = document.getElementById('tt-slots-count-badge');
    const totalPeriodsInput = document.getElementById('tt-settings-total-periods');

    if (badge) badge.textContent = `${currentEditingSlots.length} Slot${currentEditingSlots.length === 1 ? '' : 's'}`;
    if (totalPeriodsInput && document.activeElement !== totalPeriodsInput) {
        totalPeriodsInput.value = currentEditingSlots.length;
    }
    if (!container) return;

    if (!currentEditingSlots.length) {
        container.innerHTML = `
            <div class="p-6 text-center text-slate-400 font-semibold">
                No slots configured yet. Use the Total Daily Periods input above to set slots.
            </div>`;
        return;
    }

    container.innerHTML = currentEditingSlots.map((slot, idx) => {
        const duration = calcSlotDuration(slot.startTime, slot.endTime);
        const isBreak = Boolean(slot.isBreak);
        return `
            <div class="tt-slot-card bg-white p-3 rounded-2xl border ${isBreak ? 'border-amber-200/90 bg-amber-50/20' : 'border-slate-200/90'} shadow-2xs hover:border-slate-300 transition space-y-2" data-slot-id="${escapeHtml(slot.slotId)}" data-index="${idx}">
                <!-- Line 1: Badge, Label, Break Pill, Delete -->
                <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-xl ${isBreak ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-slate-100 text-slate-800'} font-black text-xs flex items-center justify-center shrink-0">
                        ${isBreak ? '<i class="fas fa-mug-hot text-[11px]"></i>' : idx + 1}
                    </div>
                    <div class="flex-1 min-w-0">
                        <input type="text" class="tt-slot-label w-full px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500" placeholder="e.g. Period ${idx + 1}" value="${escapeHtml(slot.label || '')}" data-index="${idx}">
                    </div>
                    <label class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border ${isBreak ? 'border-amber-300 bg-amber-100/60 text-amber-900 font-black' : 'border-slate-200 bg-slate-50 text-slate-600 font-bold'} cursor-pointer shrink-0 text-xs select-none hover:bg-amber-50 transition" title="Check if this is a Break, Interval, Prayer or Assembly slot">
                        <input type="checkbox" class="tt-slot-is-break rounded text-amber-600 focus:ring-amber-500" ${isBreak ? 'checked' : ''} data-index="${idx}">
                        <span class="text-[11px]">Break</span>
                    </label>
                    <button type="button" class="btn-remove-slot p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition shrink-0 cursor-pointer" data-index="${idx}" title="Remove slot">
                        <i class="fas fa-trash-can text-xs"></i>
                    </button>
                </div>
                <!-- Line 2: Timings Controls -->
                <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t ${isBreak ? 'border-amber-100' : 'border-slate-100'} text-xs">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider"><i class="far fa-clock mr-1 text-slate-400"></i>Start:</span>
                        <input type="time" class="tt-slot-start px-2 py-1 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 bg-white outline-none focus:border-indigo-500" value="${slot.startTime || '08:00'}" data-index="${idx}">
                        <span class="text-slate-400 font-black text-xs px-0.5">→</span>
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End:</span>
                        <input type="time" class="tt-slot-end px-2 py-1 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 bg-white outline-none focus:border-indigo-500" value="${slot.endTime || '08:45'}" data-index="${idx}">
                    </div>
                    <div class="slot-duration-badge text-[10px] font-black px-2 py-0.5 rounded-md ${isBreak ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-slate-100 text-slate-700'}">
                        ${duration} mins
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

const setTimetableSlotsCount = (newCount) => {
    syncSlotInputsToMemory();
    const count = Math.max(1, Math.min(15, Number(newCount) || 1));
    const curCount = currentEditingSlots.length;

    if (count > curCount) {
        for (let i = curCount + 1; i <= count; i++) {
            let newStart = '08:00';
            let newEnd = '08:45';
            if (currentEditingSlots.length > 0) {
                const prev = currentEditingSlots[currentEditingSlots.length - 1];
                if (prev.endTime) {
                    newStart = prev.endTime;
                    try {
                        const [h, m] = newStart.split(':').map(Number);
                        const totalMins = h * 60 + m + 45;
                        const nh = Math.floor(totalMins / 60) % 24;
                        const nm = totalMins % 60;
                        newEnd = `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
                    } catch (_) {
                        newEnd = '09:30';
                    }
                }
            }
            currentEditingSlots.push({
                slotId: `slot_${Date.now()}_${i}`,
                slotNum: i,
                label: `Period ${i}`,
                startTime: newStart,
                endTime: newEnd,
                isBreak: false
            });
        }
    } else if (count < curCount) {
        currentEditingSlots = currentEditingSlots.slice(0, count);
    }

    renderTimetableSlotsEditor();
};

const applyAutoTimings = () => {
    syncSlotInputsToMemory();
    if (!currentEditingSlots.length) return;

    const startInput = document.getElementById('tt-autotime-start');
    const durInput = document.getElementById('tt-autotime-duration');
    let curStart = startInput?.value || '08:00';
    const periodDuration = Math.max(10, Math.min(180, Number(durInput?.value) || 45));

    currentEditingSlots.forEach((slot, idx) => {
        const slotDuration = slot.isBreak ? 15 : periodDuration;
        try {
            const [h, m] = curStart.split(':').map(Number);
            const totalMins = h * 60 + m + slotDuration;
            const nh = Math.floor(totalMins / 60) % 24;
            const nm = totalMins % 60;
            const curEnd = `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
            slot.startTime = curStart;
            slot.endTime = curEnd;
            curStart = curEnd;
        } catch (_) {
            slot.startTime = '08:00';
            slot.endTime = '08:45';
        }
    });

    renderTimetableSlotsEditor();
    showToast('Auto-timings applied across all slots!', 'success');
};

const insertBreakSlot = () => {
    syncSlotInputsToMemory();
    let newStart = '09:30';
    let newEnd = '09:50';
    if (currentEditingSlots.length > 0) {
        const lastSlot = currentEditingSlots[currentEditingSlots.length - 1];
        if (lastSlot.endTime) {
            newStart = lastSlot.endTime;
            try {
                const [h, m] = newStart.split(':').map(Number);
                const totalMinutes = h * 60 + m + 20; // 20 min recess
                const newH = Math.floor(totalMinutes / 60) % 24;
                const newM = totalMinutes % 60;
                newEnd = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
            } catch (_) {
                newEnd = '10:00';
            }
        }
    }
    const nextNum = currentEditingSlots.length + 1;
    currentEditingSlots.push({
        slotId: `slot_${Date.now()}_break`,
        slotNum: nextNum,
        label: 'Interval / Break',
        startTime: newStart,
        endTime: newEnd,
        isBreak: true
    });
    renderTimetableSlotsEditor();
};

const updateDaysSummaryAndCardStyles = () => {
    const cbs = document.querySelectorAll('.tt-workday-cb');
    let workCount = 0;
    const offDayLabels = [];

    cbs.forEach(cb => {
        const card = cb.closest('.tt-day-card');
        const pill = card?.querySelector('.tt-day-status-pill');
        const dayName = cb.value;
        const dayShort = dayName.slice(0, 3);

        if (cb.checked) {
            workCount++;
            if (card) {
                card.className = 'tt-day-card flex flex-col items-center p-2 rounded-xl border-2 border-indigo-500 bg-indigo-50/40 cursor-pointer text-center select-none transition';
            }
            if (pill) {
                pill.textContent = 'Work';
                pill.className = 'tt-day-status-pill text-[9px] font-black text-indigo-700 mt-0.5';
            }
        } else {
            offDayLabels.push(dayShort);
            if (card) {
                card.className = 'tt-day-card flex flex-col items-center p-2 rounded-xl border-2 border-rose-200 bg-rose-50/70 cursor-pointer text-center select-none transition';
            }
            if (pill) {
                pill.textContent = 'Off';
                pill.className = 'tt-day-status-pill text-[9px] font-black text-rose-600 mt-0.5';
            }
        }
    });

    const summaryEl = document.getElementById('tt-settings-days-summary');
    if (summaryEl) {
        const offText = offDayLabels.length ? `${offDayLabels.length} Off Day${offDayLabels.length > 1 ? 's' : ''} (${offDayLabels.join(', ')})` : 'No Weekly Off';
        summaryEl.innerHTML = `<span class="text-indigo-900 font-extrabold">${workCount} Working</span> • <span class="text-rose-600 font-extrabold">${offText}</span>`;
    }
};

const openTimetableSettingsModal = () => {
    const activeWeekendDays = attendanceConfig.weekendDays || [5];

    document.querySelectorAll('.tt-workday-cb').forEach(cb => {
        const dayIdx = Number(cb.dataset.dayIndex);
        cb.checked = !activeWeekendDays.includes(dayIdx);
    });

    updateDaysSummaryAndCardStyles();

    currentEditingSlots = normalizeTimetableSlots(timetableConfig).map(s => ({ ...s }));
    renderTimetableSlotsEditor();
    openModal('modal-tt-settings');
};

const saveTimetableSettings = async () => {
    syncSlotInputsToMemory();

    const workdayCbs = document.querySelectorAll('.tt-workday-cb');
    const activeWorkingDays = [];
    const selectedWeekendDays = [];

    workdayCbs.forEach(cb => {
        const dayIdx = Number(cb.dataset.dayIndex);
        if (cb.checked) {
            activeWorkingDays.push(cb.value);
        } else {
            selectedWeekendDays.push(dayIdx);
        }
    });

    if (!activeWorkingDays.length) {
        return alert('Please select at least one working day.');
    }
    if (!currentEditingSlots.length) {
        return alert('Please configure at least one period slot.');
    }

    const offDays = selectedWeekendDays.map(idx => WEEKDAY_NAMES[idx]);

    const timings = currentEditingSlots.map((s, idx) => ({
        periodNum: idx + 1,
        startTime: s.startTime,
        endTime: s.endTime,
        label: s.label
    }));

    const newConfig = {
        workingDays: activeWorkingDays,
        offDays: offDays,
        periodsCount: currentEditingSlots.length,
        slots: currentEditingSlots,
        timings: timings
    };

    pendingTimetableConfigToSave = newConfig;

    // Compare selectedWeekendDays with attendanceConfig.weekendDays
    const currentWeekends = [...(attendanceConfig.weekendDays || [5])].sort((a, b) => a - b);
    const newWeekends = [...selectedWeekendDays].sort((a, b) => a - b);
    const weekendsChanged = currentWeekends.length !== newWeekends.length || currentWeekends.some((v, i) => v !== newWeekends[i]);

    if (weekendsChanged) {
        pendingTimetableWeekendIndices = newWeekends;
        const oldLabels = currentWeekends.length ? currentWeekends.map(d => WEEKDAY_NAMES[d]).join(', ') : 'None';
        const newLabels = newWeekends.length ? newWeekends.map(d => WEEKDAY_NAMES[d]).join(', ') : 'None';

        const oldSpan = document.getElementById('tt-confirm-old-weekends');
        const newSpan = document.getElementById('tt-confirm-new-weekends');
        const todaySpan = document.getElementById('tt-confirm-today-date');

        if (oldSpan) oldSpan.textContent = oldLabels;
        if (newSpan) newSpan.textContent = newLabels;
        if (todaySpan) todaySpan.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

        openModal('modal-tt-weekend-confirm');
        return;
    }

    await executeSaveTimetableConfig(newConfig);
};

const executeSaveTimetableConfig = async (newConfig) => {
    timetableConfig = newConfig;
    const year = document.getElementById('tt-academic-year')?.value || currentAcademicYear;
    const docId = getTimetableDocId(year, selectedTtClass);

    try {
        // 1. Save globally to institutional structure settings
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'timetableStructure'), {
            slots: newConfig.slots,
            periodsCount: newConfig.periodsCount,
            timings: newConfig.timings,
            updatedAt: Date.now()
        }, { merge: true });

        // 2. Save to current class timetable document
        await setDoc(doc(db, `${BASE_PATH}/timetables`, docId), {
            config: timetableConfig,
            matrix: timetableMatrix,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-tt-settings');
        showToast('Timetable structure settings applied across all classes!', 'success');
        renderTimetableMatrixUI();
    } catch (err) {
        alert('Failed to save settings: ' + err.message);
    }
};

const applyTimetableWeekendSync = async (mode) => {
    if (!pendingTimetableWeekendIndices || !pendingTimetableConfigToSave) return;
    const newWeekends = pendingTimetableWeekendIndices;
    const todayStr = new Date().toISOString().split('T')[0];

    let newHistory = Array.isArray(attendanceConfig.weekendHistory) ? [...attendanceConfig.weekendHistory] : [];

    if (mode === 'today') {
        if (newHistory.length === 0) {
            newHistory.push({
                effectiveFrom: '2020-01-01',
                weekendDays: attendanceConfig.weekendDays || [5],
                updatedAt: Date.now() - 1000
            });
        }
        newHistory = newHistory.filter(h => h.effectiveFrom < todayStr);
        newHistory.push({
            effectiveFrom: todayStr,
            weekendDays: newWeekends,
            updatedAt: Date.now()
        });
    } else {
        newHistory = [{
            effectiveFrom: '2000-01-01',
            weekendDays: newWeekends,
            updatedAt: Date.now()
        }];
    }

    try {
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'attendanceConfig'), {
            weekendDays: newWeekends,
            weekendHistory: newHistory
        }, { merge: true });

        attendanceConfig.weekendDays = newWeekends;
        attendanceConfig.weekendHistory = newHistory;

        closeModal('modal-tt-weekend-confirm');
        await executeSaveTimetableConfig(pendingTimetableConfigToSave);
    } catch (err) {
        alert('Failed to synchronize weekly off with attendance: ' + err.message);
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

let allClassesYearPlans = {}; // classLabel -> { grid, subjects, calendarType, startMonth, endMonth }

const loadYearPlan = async () => {
    const year = document.getElementById('yp-academic-year')?.value || currentAcademicYear;
    selectedYpClass = document.getElementById('yp-class-select')?.value || selectedSubjectsClass || '1';
    const heading = document.getElementById('yp-view-heading');

    if (selectedYpClass === 'all') {
        if (heading) heading.textContent = `All Classes Academic Year Syllabus Plans (${year})`;
        const allowed = getAllowedClassesForTeacher();
        const tasks = allowed.map(async (cls) => {
            const docId = getYearPlanDocId(year, cls);
            const subjDocId = getClassSubjectsDocId(year, cls);
            const [ySnap, sSnap] = await Promise.all([
                getDoc(doc(db, `${BASE_PATH}/yearPlans`, docId)).catch(() => null),
                getDoc(doc(db, `${BASE_PATH}/classSubjects`, subjDocId)).catch(() => null)
            ]);
            return {
                classLabel: cls,
                grid: ySnap && ySnap.exists() ? (ySnap.data().grid || {}) : {},
                subjects: sSnap && sSnap.exists() && Array.isArray(sSnap.data().subjects) ? sSnap.data().subjects : []
            };
        });
        const results = await Promise.all(tasks);
        allClassesYearPlans = {};
        results.forEach(r => { allClassesYearPlans[r.classLabel] = r; });
        renderYearPlanUI();
        return;
    }

    if (heading) heading.textContent = `Class ${selectedYpClass} Academic Year Syllabus Plan (${year})`;

    await ensureClassSubjectsLoaded(year, selectedYpClass);

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

    const startMonth = document.getElementById('yp-start-month')?.value || currentYpStartMonth;
    const endMonth = document.getElementById('yp-end-month')?.value || currentYpEndMonth;
    const months = getSessionMonthsList(currentYpCalendarType, startMonth, endMonth);

    if (selectedYpClass === 'all') {
        const allowed = getAllowedClassesForTeacher();
        grid.innerHTML = allowed.map(cls => {
            const cData = allClassesYearPlans[cls] || { grid: {}, subjects: [] };
            const subjs = cData.subjects || [];
            const cGrid = cData.grid || {};

            if (!subjs.length) {
                return `
                    <div class="mb-8 p-6 bg-white rounded-3xl border border-slate-200 text-center text-slate-400 font-bold">
                        Class ${escapeHtml(cls)} has no subjects configured yet.
                    </div>`;
            }

            return `
                <div class="mb-8 bg-white rounded-3xl border-2 border-slate-800 shadow-sm overflow-hidden">
                    <div class="p-4 bg-slate-100 border-b-2 border-slate-800 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs">${escapeHtml(cls)}</span>
                            <h4 class="font-black text-sm text-slate-900">Class ${escapeHtml(cls)} Monthly Syllabus Plan</h4>
                        </div>
                        <span class="text-xs text-slate-600 font-bold">${subjs.length} Subjects</span>
                    </div>
                    <div class="overflow-x-auto p-4">
                        <table class="w-full text-left border-collapse border-2 border-slate-800 text-xs">
                            <thead>
                                <tr class="bg-slate-100 text-slate-800 border-b-2 border-slate-800 font-extrabold text-[11px]">
                                    <th class="py-2.5 px-3 border-r-2 border-slate-800 w-36 text-center font-black text-slate-900">
                                        Periods Allocation
                                    </th>
                                    ${subjs.map(s => `
                                        <th class="py-2 px-3 border-r-2 border-slate-800 min-w-[150px] text-center font-black">
                                            ${(s.weeklyPeriods || 5) * 35} - ${s.weeklyPeriods || 5}
                                        </th>
                                    `).join('')}
                                </tr>
                                <tr class="bg-slate-50 text-slate-900 border-b-2 border-slate-800 font-black text-xs">
                                    <th class="py-2.5 px-3 border-r-2 border-slate-800 w-36 text-center bg-slate-200/60 font-black">
                                        Academic Months
                                    </th>
                                    ${subjs.map(s => `
                                        <th class="py-2.5 px-3 border-r-2 border-slate-800 min-w-[150px] text-center">
                                            <div class="font-black text-sm text-slate-950">${escapeHtml(s.name)}</div>
                                            <div class="text-[10px] text-indigo-700 font-bold uppercase mt-0.5">${escapeHtml(s.code || '')}</div>
                                        </th>
                                    `).join('')}
                                </tr>
                            </thead>
                            <tbody class="divide-y-2 divide-slate-800 font-medium">
                                ${months.map((month, mIdx) => {
                                    const isRevisionMonth = (month === 'Sha\'ban' || month === 'March');
                                    if (isRevisionMonth) {
                                        return `
                                            <tr class="bg-slate-100/90 border-b-2 border-slate-800">
                                                <td class="py-3 px-3 border-r-2 border-slate-800 font-black text-slate-900 bg-slate-200/60 text-center text-sm">
                                                    ${month}
                                                </td>
                                                <td colspan="${subjs.length}" class="py-3.5 px-4 text-center font-black text-sm text-slate-900 bg-slate-100 border-r-2 border-slate-800 tracking-wider">
                                                    Revision &amp; Annual Examinations
                                                </td>
                                            </tr>`;
                                    }

                                    return `
                                        <tr class="hover:bg-slate-50 transition border-b border-slate-300">
                                            <td class="py-3 px-3 border-r-2 border-slate-800 font-black text-slate-900 bg-slate-50 text-center text-sm">
                                                ${month}
                                            </td>
                                            ${subjs.map(s => {
                                                const key = `${month}__${s.id}`;
                                                const idxKey = `idx_${mIdx}__${s.id}`;
                                                const cell = cGrid[key] || cGrid[idxKey] || {};
                                                return `
                                                    <td class="p-2 border-r-2 border-slate-800 text-center align-middle text-xs">
                                                        ${cell.lessonNo ? `<span class="font-black text-slate-900">${escapeHtml(cell.lessonNo)}</span>` : ''}
                                                        ${cell.topic ? `<div class="text-[11px] text-slate-700 font-semibold mt-0.5">${escapeHtml(cell.topic)}</div>` : ''}
                                                        ${(!cell.lessonNo && !cell.topic) ? `<span class="text-slate-300 italic text-[11px]">--</span>` : ''}
                                                    </td>`;
                                            }).join('')}
                                        </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');
        return;
    }

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
                <button type="button" class="mt-3 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs" onclick="activateTab('tab-subjects')">
                    Go to Class Subjects
                </button>
            </div>`;
        return;
    }

    let html = `
        <table class="w-full text-left border-collapse border-2 border-slate-800 text-xs">
            <thead>
                <!-- Top Tier Header: Period Ratio / Breakdown matching Image 2 -->
                <tr class="bg-slate-100 text-slate-800 border-b-2 border-slate-800 font-extrabold text-[11px]">
                    <th class="py-2.5 px-3 border-r-2 border-slate-800 w-36 text-center font-black text-slate-900">
                        Periods Allocation
                    </th>
                    ${classSubjectsList.map(s => `
                        <th class="py-2 px-3 border-r-2 border-slate-800 min-w-[150px] text-center font-black">
                            ${(s.weeklyPeriods || 5) * 35} - ${s.weeklyPeriods || 5}
                        </th>
                    `).join('')}
                </tr>

                <!-- Second Tier Header: Subject Names -->
                <tr class="bg-slate-50 text-slate-900 border-b-2 border-slate-800 font-black text-xs">
                    <th class="py-3 px-3.5 border-r-2 border-slate-800 w-36 text-center bg-slate-200/60 font-black">
                        Academic Months
                    </th>
                    ${classSubjectsList.map(s => `
                        <th class="py-2.5 px-3 border-r-2 border-slate-800 min-w-[150px] text-center">
                            <div class="font-black text-sm text-slate-950">${escapeHtml(s.name)}</div>
                            <div class="text-[10px] text-indigo-700 font-bold uppercase mt-0.5">${escapeHtml(s.code || '')}</div>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody class="divide-y-2 divide-slate-800 font-medium">`;

    months.forEach((month, mIdx) => {
        const isRevisionMonth = (month === 'Sha\'ban' || month === 'March');

        if (isRevisionMonth && !isYearPlanEditMode) {
            html += `
                <tr class="bg-slate-100/90 border-b-2 border-slate-800">
                    <td class="py-3 px-3 border-r-2 border-slate-800 font-black text-slate-900 bg-slate-200/60 text-center text-sm">
                        ${month}
                    </td>
                    <td colspan="${classSubjectsList.length}" class="py-3.5 px-4 text-center font-black text-sm text-slate-900 bg-slate-100 border-r-2 border-slate-800 tracking-wider">
                        Revision &amp; Annual Examinations
                    </td>
                </tr>`;
            return;
        }

        html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-300">
                <td class="py-3 px-3 border-r-2 border-slate-800 font-black text-slate-900 bg-slate-50 text-center text-sm">
                    ${month}
                </td>`;

        classSubjectsList.forEach(s => {
            const key = `${month}__${s.id}`;
            const idxKey = `idx_${mIdx}__${s.id}`;
            const cell = yearPlanGrid[key] || yearPlanGrid[idxKey] || {};

            if (isYearPlanEditMode) {
                html += `
                    <td class="p-2 border-r-2 border-slate-800 align-top bg-amber-50/20">
                        <input type="text" class="yp-input-lesson w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none mb-1 bg-white" placeholder="Lesson / Unit" value="${escapeHtml(cell.lessonNo || '')}" data-key="${key}" data-idx-key="${idxKey}">
                        <input type="text" class="yp-input-topic w-full p-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none mb-1 bg-white" placeholder="Topic / Chapters" value="${escapeHtml(cell.topic || '')}" data-key="${key}">
                        <input type="text" class="yp-input-pages w-full p-1 text-[11px] border border-slate-200 rounded text-slate-600 outline-none bg-white" placeholder="Pages" value="${escapeHtml(cell.pages || '')}" data-key="${key}">
                    </td>`;
            } else {
                const hasTarget = Boolean(cell.topic || cell.lessonNo);

                html += `
                    <td class="p-2.5 border-r-2 border-slate-800 text-center align-middle cursor-pointer hover:bg-indigo-50/40 transition yp-cell-clickable" data-month="${month}" data-subject-id="${s.id}" data-subject-name="${escapeHtml(s.name)}">
                        ${hasTarget ? `
                            <div class="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-indigo-300 transition text-center space-y-0.5">
                                <div class="font-black text-sm text-slate-900">${escapeHtml(cell.lessonNo || '')}</div>
                                ${cell.topic ? `<div class="font-semibold text-xs text-slate-700">${escapeHtml(cell.topic)}</div>` : ''}
                                ${cell.pages ? `<div class="text-[10px] text-indigo-700 font-bold mt-1">${escapeHtml(cell.pages)}</div>` : ''}
                            </div>
                        ` : `
                            <div class="p-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/40 text-center text-slate-400 text-xs py-3">
                                + Plan
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
        const idxKey = input.dataset.idxKey;
        const topicInput = document.querySelector(`.yp-input-topic[data-key="${key}"]`);
        const pagesInput = document.querySelector(`.yp-input-pages[data-key="${key}"]`);

        const lessonNo = input.value.trim();
        const topic = topicInput?.value.trim() || '';
        const pages = pagesInput?.value.trim() || '';

        const existing = yearPlanGrid[key] || (idxKey ? yearPlanGrid[idxKey] : {}) || {};
        const cellData = {
            ...existing,
            lessonNo,
            topic,
            pages
        };
        yearPlanGrid[key] = cellData;
        if (idxKey) {
            yearPlanGrid[idxKey] = cellData;
        }
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
// MODULE 4: EXAM TIMETABLE & SYLLABUS LOGIC (CLASS-SCOPED & RESULT-SYNCED)
// =========================================================================
const getExamTimetableDocId = (year, classLabel, examTitle) => {
    const cleanY = String(year || currentAcademicYear).trim().replace(/[^\w-]/g, '_');
    const cleanC = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    const cleanT = String(examTitle || '').trim().replace(/[^\w-]/g, '_');
    return `${cleanY}__${cleanC}__${cleanT}`;
};

const loadAvailableExams = async (year, classLabel) => {
    const examsSet = new Map();

    // 1. Seed standard defaults aligned with Result Management
    DEFAULT_EXAM_DEFS.forEach(e => {
        examsSet.set(e.label, e.label);
    });

    // 2. Fetch class-specific custom exams from resultSchemas
    if (classLabel && classLabel !== 'all') {
        try {
            const resultDocId = getResultSchemaDocId(year, classLabel);
            const snap = await getDoc(doc(db, `${BASE_PATH}/resultSchemas`, resultDocId));
            if (snap.exists()) {
                const data = snap.data();
                const configs = data.examConfigs || {};
                Object.entries(configs).forEach(([key, cfg]) => {
                    if (cfg && cfg.disabled !== true) {
                        const lbl = cfg.label || key;
                        examsSet.set(lbl, lbl);
                    }
                });
            }
        } catch (_) {}
    } else {
        // Only if "all" (e.g. Admin Master view), gather exams
        try {
            const qSnap = await getDocs(query(collection(db, `${BASE_PATH}/resultSchemas`), where('academicYear', '==', String(year))));
            qSnap.docs.forEach(d => {
                const configs = d.data().examConfigs || {};
                Object.entries(configs).forEach(([key, cfg]) => {
                    if (cfg && cfg.disabled !== true) {
                        const lbl = cfg.label || key;
                        examsSet.set(lbl, lbl);
                    }
                });
            });
        } catch (_) {}
    }

    const dropdownIds = ['exam-tt-title-select', 'master-tt-exam-select'];
    dropdownIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        const prevVal = select.value;
        select.innerHTML = Array.from(examsSet.values()).map(name => `
            <option value="${escapeHtml(name)}">${escapeHtml(name)}</option>
        `).join('');

        if (prevVal && examsSet.has(prevVal)) {
            select.value = prevVal;
        } else {
            select.value = examsSet.has('Half-Yearly') ? 'Half-Yearly' : (select.options[0]?.value || '');
        }
    });

    currentExamTitle = document.getElementById('exam-tt-title-select')?.value
        || document.getElementById('master-tt-exam-select')?.value
        || 'Half-Yearly';
};

const openAddExamNameModal = () => {
    const input = document.getElementById('modal-new-exam-title');
    if (input) input.value = '';

    const scopeSel = document.getElementById('modal-new-exam-class-scope');
    const specificWrapper = document.getElementById('modal-new-exam-specific-class-wrapper');
    const specificSel = document.getElementById('modal-new-exam-specific-class');

    if (scopeSel) {
        scopeSel.value = 'current';
        // If not admin, hide 'all' option
        const allOpt = scopeSel.querySelector('option[value="all"]');
        if (allOpt) allOpt.disabled = !isSuperAdmin;
    }
    if (specificWrapper) specificWrapper.classList.add('hidden');

    if (specificSel) {
        const allowed = getAllowedClassesForTeacher();
        specificSel.innerHTML = allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`).join('');
    }

    openModal('modal-add-exam-name');
};

const saveNewExamName = async () => {
    const titleInput = document.getElementById('modal-new-exam-title');
    const title = titleInput?.value.trim();
    if (!title) return alert('Please enter an examination title.');

    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const selectedClass = document.getElementById('exam-tt-class-select')?.value || '1';
    const scope = document.getElementById('modal-new-exam-class-scope')?.value || 'current';
    const specificClass = document.getElementById('modal-new-exam-specific-class')?.value || selectedClass;

    let targetClasses = [];
    if (scope === 'all' && isSuperAdmin) {
        targetClasses = (allClasses && allClasses.length) ? allClasses : getAllowedClassesForTeacher();
    } else if (scope === 'specific') {
        targetClasses = [specificClass];
    } else {
        targetClasses = [selectedClass];
    }

    try {
        const examKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `exam_${Date.now()}`;

        const tasks = targetClasses.map(async (cls) => {
            const resultDocId = getResultSchemaDocId(year, cls);
            const resultRef = doc(db, `${BASE_PATH}/resultSchemas`, resultDocId);
            const snap = await getDoc(resultRef);

            const existingData = snap.exists() ? snap.data() : {};
            const examConfigs = existingData.examConfigs || {};

            examConfigs[examKey] = {
                label: title,
                subjects: [],
                isDefault: false
            };

            return setDoc(resultRef, {
                classLabel: String(cls),
                academicYear: String(year),
                examConfigs: examConfigs,
                updatedAt: Date.now()
            }, { merge: true });
        });

        await Promise.all(tasks);

        closeModal('modal-add-exam-name');
        showToast(`Examination "${title}" created for ${targetClasses.length === 1 ? `Class ${targetClasses[0]}` : 'all classes'}!`, 'success');

        await loadAvailableExams(year, selectedClass);
        const select = document.getElementById('exam-tt-title-select');
        if (select) select.value = title;
        currentExamTitle = title;

        if (examViewMode === 'master') {
            await loadMasterExamTimetable();
        } else {
            await loadExamTimetable();
        }
    } catch (err) {
        alert('Failed to save examination: ' + err.message);
    }
};

// --- Exam Timetable Routine Matrix State ---
let isExamTimetableEditMode = false;
let examDates = [];
let examSessions = [
    { id: 'session_1', label: 'Paper 1 (Morning)', startTime: '06:30', endTime: '08:30' },
    { id: 'session_2', label: 'Paper 2 (Second)', startTime: '08:30', endTime: '09:30' }
];
let examMatrix = {}; // "${date}_${sessionId}" -> { subjectId, subjectName, subjectCode, isNoExam, portions, invigilator, hall }

const switchExamViewMode = async (mode) => {
    examViewMode = mode;
    const btnSingle = document.getElementById('btn-exam-view-single');
    const btnMaster = document.getElementById('btn-exam-view-master');
    const singleContainer = document.getElementById('exam-timetable-container');
    const masterContainer = document.getElementById('exam-master-timetable-container');
    const classWrapper = document.getElementById('exam-tt-class-wrapper');
    const addDateBtn = document.getElementById('btn-add-exam-date');
    const saveScheduleBtn = document.getElementById('btn-save-exam-timetable');
    const printRoutineBtn = document.getElementById('btn-print-exam-tt');
    const editToggle = document.getElementById('toggle-exam-timetable-edit');

    if (mode === 'master') {
        if (btnSingle) {
            btnSingle.className = 'px-3 py-1.5 rounded-lg text-xs font-extrabold transition text-slate-600 hover:text-slate-900 cursor-pointer';
        }
        if (btnMaster) {
            btnMaster.className = 'px-3 py-1.5 rounded-lg text-xs font-extrabold transition bg-white text-indigo-900 shadow-2xs cursor-pointer';
        }
        if (singleContainer) singleContainer.classList.add('hidden');
        if (masterContainer) masterContainer.classList.remove('hidden');
        if (classWrapper) classWrapper.classList.add('hidden');
        if (addDateBtn) addDateBtn.classList.add('hidden');
        if (saveScheduleBtn) saveScheduleBtn.classList.add('hidden');
        if (printRoutineBtn) printRoutineBtn.classList.add('hidden');

        if (editToggle) {
            editToggle.checked = isMasterExamEditMode;
            updateExamEditToggleUI(isMasterExamEditMode);
        }

        await loadMasterExamTimetable();
    } else {
        if (btnSingle) {
            btnSingle.className = 'px-3 py-1.5 rounded-lg text-xs font-extrabold transition bg-white text-indigo-900 shadow-2xs cursor-pointer';
        }
        if (btnMaster) {
            btnMaster.className = 'px-3 py-1.5 rounded-lg text-xs font-extrabold transition text-slate-600 hover:text-slate-900 cursor-pointer';
        }
        if (singleContainer) singleContainer.classList.remove('hidden');
        if (masterContainer) masterContainer.classList.add('hidden');
        if (classWrapper) classWrapper.classList.remove('hidden');
        if (addDateBtn) addDateBtn.classList.remove('hidden');
        if (printRoutineBtn) printRoutineBtn.classList.remove('hidden');

        if (editToggle) {
            editToggle.checked = isExamTimetableEditMode;
            updateExamEditToggleUI(isExamTimetableEditMode);
        }

        await loadExamTimetable();
    }
};

const updateExamEditToggleUI = (isEditing) => {
    const label = document.getElementById('exam-tt-edit-mode-label');
    if (label) {
        label.textContent = isEditing ? 'Editing' : 'View Only';
        label.className = isEditing
            ? 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-600 text-white'
            : 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-600';
    }
};

const toggleExamTimetableEdit = (isEditing) => {
    if (examViewMode === 'master') {
        if (!isSuperAdmin) {
            const toggle = document.getElementById('toggle-exam-timetable-edit');
            if (toggle) toggle.checked = false;
            updateExamEditToggleUI(false);
            showToast('Only Admin can toggle Edit Mode on the Master Timetable.', 'warning');
            return;
        }
        isMasterExamEditMode = isEditing;
        updateExamEditToggleUI(isEditing);
        renderMasterExamGridUI();
    } else {
        const selectedClass = document.getElementById('exam-tt-class-select')?.value || '1';
        if (!isSuperAdmin && !isClassInDutyScope(selectedClass, teacherAssignedClasses)) {
            const toggle = document.getElementById('toggle-exam-timetable-edit');
            if (toggle) toggle.checked = false;
            updateExamEditToggleUI(false);
            showToast(`You can only edit schedule for your assigned duty class (${teacherAssignedClasses.join(', ')}).`, 'warning');
            return;
        }
        isExamTimetableEditMode = isEditing;
        updateExamEditToggleUI(isEditing);
        const saveBtn = document.getElementById('btn-save-exam-timetable');
        if (saveBtn) {
            saveBtn.classList.toggle('hidden', !isEditing);
        }
        renderExamTimetableGridUI();
    }
};

const loadExamTimetable = async () => {
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const selectedClass = document.getElementById('exam-tt-class-select')?.value || '1';
    currentExamTitle = document.getElementById('exam-tt-title-select')?.value || 'Half-Yearly';
    const heading = document.getElementById('exam-tt-view-heading');
    const classBadge = document.getElementById('exam-tt-class-badge');
    const datesBadge = document.getElementById('exam-tt-dates-badge');

    if (heading) heading.textContent = currentExamTitle ? `Class ${selectedClass} - ${currentExamTitle} Routine` : 'Examination Routine';
    if (classBadge) classBadge.textContent = `Class ${selectedClass}`;

    await ensureClassSubjectsLoaded(year, selectedClass);

    if (!currentExamTitle) {
        const grid = document.getElementById('exam-schedule-grid');
        if (grid) grid.innerHTML = `<div class="p-8 text-center text-slate-400 font-bold">Please select or create an examination.</div>`;
        return;
    }

    try {
        const docId = getExamTimetableDocId(year, selectedClass, currentExamTitle);
        const snap = await getDoc(doc(db, `${BASE_PATH}/examTimetables`, docId));
        if (snap.exists()) {
            const data = snap.data();
            examDates = Array.isArray(data.dates) ? data.dates : [];
            examSessions = (Array.isArray(data.sessions) && data.sessions.length) ? data.sessions : (
                (Array.isArray(data.sessionSlots) && data.sessionSlots.length) ? data.sessionSlots : [
                    { id: 'session_1', label: 'Paper 1', startTime: '07:00', endTime: '08:30' },
                    { id: 'session_2', label: 'Paper 2', startTime: '08:30', endTime: '10:00' }
                ]
            );
            examMatrix = data.matrix || {};

            if ((!examDates.length || Object.keys(examMatrix).length === 0) && Array.isArray(data.entries)) {
                data.entries.forEach(e => {
                    if (e.date) {
                        if (!examDates.includes(e.date)) examDates.push(e.date);
                        const sKey = `${e.date}_session_1`;
                        examMatrix[sKey] = {
                            subjectId: e.subjectId || '',
                            subjectName: e.subject || '',
                            subjectCode: '',
                            isNoExam: false,
                            portions: e.portions || '',
                            invigilator: e.invigilator || '',
                            hall: e.hall || ''
                        };
                    }
                });
            }
        } else {
            examDates = [];
            examMatrix = {};
            examSessions = [
                { id: 'session_1', label: 'Paper 1', startTime: '07:00', endTime: '08:30' },
                { id: 'session_2', label: 'Paper 2', startTime: '08:30', endTime: '10:00' }
            ];
        }
    } catch (err) {
        console.error('Failed to load exam timetable:', err);
    }

    examDates.sort();
    if (datesBadge) datesBadge.textContent = `${examDates.length} Scheduled Day${examDates.length === 1 ? '' : 's'}`;

    renderExamTimetableGridUI();
};

const renderExamTimetableGridUI = () => {
    const grid = document.getElementById('exam-schedule-grid');
    if (!grid) return;

    const selectedClass = document.getElementById('exam-tt-class-select')?.value || '1';

    if (!currentExamTitle) {
        grid.innerHTML = `<div class="p-8 text-center text-slate-400 font-bold">Please select an examination to view schedule.</div>`;
        return;
    }

    let html = `
        <table class="w-full text-left border-collapse border border-slate-200 text-xs">
            <thead>
                <tr class="bg-slate-100 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                    <th class="py-3 px-3.5 border-r border-slate-200 w-48 bg-slate-200/80">Exam Date &amp; Day</th>
                    ${examSessions.map(session => `
                        <th class="py-2.5 px-3 border-r border-slate-200 min-w-[200px] relative group">
                            <div class="flex items-center justify-between gap-1 mb-1">
                                <div class="text-[11px] font-black text-slate-900 tracking-wider">${escapeHtml(session.label)}</div>
                                <div class="flex items-center gap-0.5">
                                    <button type="button" class="btn-edit-exam-session p-1 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer" data-session-id="${session.id}" title="Edit Paper">
                                        <i class="fas fa-pen-to-square text-[11px]"></i>
                                    </button>
                                    <button type="button" class="btn-delete-exam-session p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer" data-session-id="${session.id}" title="Delete Paper">
                                        <i class="fas fa-trash-can text-[11px]"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="text-[10px] font-semibold text-slate-500">${session.startTime || ''} - ${session.endTime || ''}</div>
                        </th>
                    `).join('')}
                    <th class="py-2.5 px-3 border-r border-slate-200 min-w-[85px] text-center bg-indigo-50/40">
                        <button type="button" id="btn-add-exam-paper-header" class="btn-add-exam-session inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black cursor-pointer shadow-2xs transition" title="Add Exam Paper">
                            <i class="fas fa-plus"></i> Add Paper
                        </button>
                    </th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 font-medium">`;

    if (!examDates.length) {
        html += `
            <tr class="hover:bg-slate-50/60 transition">
                <td colspan="${examSessions.length + 2}" class="p-8 text-center text-slate-400 font-medium bg-slate-50/40">
                    <i class="fas fa-calendar-plus text-3xl mb-2 text-slate-300 block"></i>
                    No exam dates scheduled for Class ${escapeHtml(selectedClass)} in ${escapeHtml(currentExamTitle)} yet.<br>
                    <button type="button" class="btn-trigger-add-exam-date mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition shadow-2xs inline-flex items-center gap-1.5 cursor-pointer" data-action="add-exam-date">
                        <i class="fas fa-plus"></i> Add First Exam Date
                    </button>
                </td>
            </tr>`;
    } else {

    examDates.forEach(dateStr => {
        const enDay = getEnglishDayName(dateStr);

        html += `
            <tr class="hover:bg-slate-50/60 transition">
                <td class="py-3 px-3.5 border-r border-slate-200 font-black text-slate-900 bg-slate-50/90 whitespace-nowrap align-top">
                    <div class="flex items-center justify-between gap-2">
                        <div>
                            <div class="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                <i class="fas fa-calendar-day text-indigo-600"></i> ${dateStr}
                            </div>
                            <div class="text-[11px] font-bold text-slate-600 mt-0.5">
                                ${enDay}
                            </div>
                        </div>
                        ${isExamTimetableEditMode ? `
                            <button type="button" class="btn-remove-exam-date p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer" data-date="${dateStr}" title="Remove this exam date">
                                <i class="fas fa-trash-can text-xs"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>`;

        examSessions.forEach(session => {
            const cellKey = `${dateStr}_${session.id}`;
            const cellData = examMatrix[cellKey] || {};

            if (isExamTimetableEditMode) {
                html += `
                    <td class="p-2 border-r border-slate-200 align-top bg-amber-50/20">
                        <select class="exam-cell-subject w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none mb-1 bg-white" data-date="${dateStr}" data-session="${session.id}">
                            <option value="">-- Unassigned --</option>
                            <option value="__NO_EXAM__" ${cellData.isNoExam ? 'selected' : ''} class="font-bold text-amber-700 bg-amber-50">☕ -- No Exam / Study Leave --</option>
                            ${classSubjectsList.map(s => `
                                <option value="${s.id}" ${(cellData.subjectId === s.id || cellData.subjectName === s.name) && !cellData.isNoExam ? 'selected' : ''}>
                                    ${escapeHtml(s.name)} (${escapeHtml(s.code)})
                                </option>
                            `).join('')}
                        </select>
                        <input type="text" class="exam-cell-portions w-full p-1 text-[11px] border border-slate-200 rounded text-slate-700 outline-none mb-1 bg-white" placeholder="Portions / Syllabus to study" value="${escapeHtml(cellData.portions || '')}" data-date="${dateStr}" data-session="${session.id}">
                        <div class="grid grid-cols-2 gap-1">
                            <select class="exam-cell-invigilator w-full p-1 text-[10px] border border-slate-200 rounded text-slate-600 outline-none bg-white font-bold" data-date="${dateStr}" data-session="${session.id}">
                                <option value="">-- Invigilator --</option>
                                ${getActiveTeachers().map(t => `
                                    <option value="${escapeHtml(t.name || t.id)}" ${cellData.invigilator === t.name ? 'selected' : ''}>
                                        ${escapeHtml(t.name || 'Staff')}
                                    </option>
                                `).join('')}
                            </select>
                            <input type="text" class="exam-cell-hall w-full p-1 text-[10px] border border-slate-200 rounded text-slate-600 outline-none bg-white" placeholder="Hall / Room" value="${escapeHtml(cellData.hall || '')}" data-date="${dateStr}" data-session="${session.id}">
                        </div>
                    </td>`;
            } else {
                if (cellData.isNoExam) {
                    html += `
                        <td class="p-2.5 border-r border-slate-200 align-top">
                            <div class="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-center select-none">
                                <div class="text-[11px] font-black text-amber-900 flex items-center justify-center gap-1.5">
                                    <i class="fas fa-mug-hot text-amber-600"></i> No Exam / Study Leave
                                </div>
                                <div class="text-[10px] font-bold text-amber-700/80 mt-0.5">Free Preparation Day</div>
                            </div>
                        </td>`;
                } else if (cellData.subjectName) {
                    html += `
                        <td class="p-2.5 border-r border-slate-200 align-top">
                            <div class="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 shadow-2xs space-y-1">
                                <div class="font-black text-xs text-indigo-950">${escapeHtml(cellData.subjectName)} ${cellData.subjectCode ? `<span class="text-[10px] font-bold text-indigo-700">(${escapeHtml(cellData.subjectCode)})</span>` : ''}</div>
                                ${cellData.portions ? `<div class="text-[11px] font-semibold text-slate-600 leading-tight"><i class="fas fa-book-bookmark text-[9px] mr-1 text-indigo-500"></i>${escapeHtml(cellData.portions)}</div>` : ''}
                                <div class="flex items-center gap-2 pt-0.5 text-[10px] font-bold text-slate-500">
                                    ${cellData.invigilator ? `<span><i class="fas fa-user-tie text-[9px] mr-1 opacity-70"></i>${escapeHtml(cellData.invigilator)}</span>` : ''}
                                    ${cellData.hall ? `<span><i class="fas fa-location-dot text-[9px] mr-1 text-slate-400"></i>${escapeHtml(cellData.hall)}</span>` : ''}
                                </div>
                            </div>
                        </td>`;
                } else {
                    html += `
                        <td class="p-2.5 border-r border-slate-200 align-top">
                            <div class="p-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 text-center text-slate-400 font-bold text-[11px] py-3">
                                No Paper Scheduled
                            </div>
                        </td>`;
                }
            }
        });

        html += `
            <td class="p-2 border-r border-slate-200 bg-slate-50/20 text-center text-slate-300 font-bold text-xs select-none">
                --
            </td>
        </tr>`;
    });
    }

    html += `</tbody></table>`;
    grid.innerHTML = html;
};

// =========================================================================
// MASTER CONSOLIDATED EXAM TIMETABLE
// =========================================================================
const loadMasterExamTimetable = async () => {
    const year = document.getElementById('master-tt-academic-year')?.value
        || document.getElementById('exam-tt-academic-year')?.value
        || currentAcademicYear;
    currentExamTitle = document.getElementById('master-tt-exam-select')?.value
        || document.getElementById('exam-tt-title-select')?.value
        || 'Half-Yearly';

    const instName = institutionConfig.name || 'Noorul Islam Madrasa';
    const instTagline = institutionConfig.tagline || 'Academic Affairs & Examination Division';
    const instAddress = `${institutionConfig.address || 'Central Campus'} • Ph: ${institutionConfig.phone || '+91 0000000000'}`;
    const instPlace = institutionConfig.place || institutionConfig.city || 'Campus';

    const nameEl = document.getElementById('master-inst-name');
    const subEl = document.getElementById('master-inst-subtitle');
    const addrEl = document.getElementById('master-inst-address');
    const mainTitle = document.getElementById('master-exam-main-title');
    const placeEl = document.getElementById('master-exam-place');
    const issueDate = document.getElementById('master-exam-issue-date');

    if (nameEl) nameEl.textContent = instName;
    if (subEl) subEl.textContent = instTagline;
    if (addrEl) addrEl.textContent = instAddress;
    if (mainTitle) mainTitle.textContent = `${currentExamTitle} Master Examination Timetable (${year})`;
    if (placeEl) placeEl.textContent = `Place: ${instPlace}`;
    if (issueDate) issueDate.textContent = `Date of Publication: ${new Date().toLocaleDateString('en-GB')}`;

    if (institutionConfig.logoUrl) {
        const logoImg = document.getElementById('master-inst-logo');
        const logoContainer = document.getElementById('master-inst-logo-container');
        if (logoImg && logoContainer) {
            logoImg.src = institutionConfig.logoUrl;
            logoContainer.classList.remove('hidden');
        }
    }

    const grid = document.getElementById('exam-master-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="p-12 text-center text-slate-400 font-bold"><i class="fas fa-spinner fa-spin mr-2"></i> Loading consolidated examination matrix...</div>`;

    const targetClasses = (allClasses && allClasses.length) ? allClasses : getAllowedClassesForTeacher();
    const datesSet = new Set();
    const timetablesMap = {};
    const classSubjsMap = {};

    const tasks = targetClasses.map(async (cls) => {
        try {
            const docId = getExamTimetableDocId(year, cls, currentExamTitle);
            const subjDocId = getClassSubjectsDocId(year, cls);
            const [snap, sSnap] = await Promise.all([
                getDoc(doc(db, `${BASE_PATH}/examTimetables`, docId)),
                getDoc(doc(db, `${BASE_PATH}/classSubjects`, subjDocId))
            ]);

            if (snap.exists()) {
                const d = snap.data();
                timetablesMap[cls] = d;
                if (Array.isArray(d.dates)) {
                    d.dates.forEach(dt => datesSet.add(dt));
                }
                if (d.matrix) {
                    Object.keys(d.matrix).forEach(k => {
                        const [dt] = k.split('_');
                        if (dt) datesSet.add(dt);
                    });
                }
            } else {
                timetablesMap[cls] = { dates: [], matrix: {} };
            }

            if (sSnap && sSnap.exists() && Array.isArray(sSnap.data().subjects)) {
                classSubjsMap[cls] = sSnap.data().subjects;
            } else {
                classSubjsMap[cls] = [];
            }
        } catch (_) {
            timetablesMap[cls] = { dates: [], matrix: {} };
            classSubjsMap[cls] = [];
        }
    });

    await Promise.all(tasks);

    masterExamDates = Array.from(datesSet).sort((a, b) => new Date(a) - new Date(b));
    masterExamTimetables = timetablesMap;

    renderMasterExamGridUI(targetClasses, classSubjsMap);
};

const renderMasterExamGridUI = (targetClasses = null, classSubjsMap = null) => {
    const grid = document.getElementById('exam-master-grid');
    if (!grid) return;

    const classesToRender = targetClasses || (allClasses && allClasses.length ? allClasses : getAllowedClassesForTeacher());

    if (!masterExamDates.length) {
        grid.innerHTML = `
            <div class="p-12 text-center text-slate-400 font-bold border-2 border-dashed border-slate-300 rounded-3xl">
                <i class="fas fa-calendar-xmark text-4xl mb-3 text-slate-300 block"></i>
                No examination dates have been scheduled for ${escapeHtml(currentExamTitle)} across any classes yet.<br>
                <span class="text-xs text-slate-500 font-medium">Switch to Exam Timetable to add dates and schedule papers.</span>
            </div>`;
        return;
    }

    // Default timings band
    const timingBands = {
        0: '07.00am To 09.00am',
        1: '06.30am To 08.30am',
        2: '06.30am To 08.30am',
        3: '06.30am To 08.30am',
        4: '06.30am To 08.30am',
        5: '06.30am To 08.30am',
        6: '06.30am To 08.30am',
        7: '08.00am To 09.30am'
    };

    let html = `
        <table class="w-full text-center border-collapse border-2 border-slate-900 text-xs">
            <thead>
                <!-- Top Row: Exam Dates & Weekdays -->
                <tr class="bg-slate-900 text-white border-b-2 border-slate-900">
                    <th class="py-3 px-3 border-r-2 border-white w-20 bg-slate-950 font-black text-xs uppercase tracking-wider text-white">
                        Class
                    </th>
                    ${masterExamDates.map(dateStr => {
                        const enDay = getEnglishDayName(dateStr);
                        return `
                            <th class="py-2.5 px-3 border-r border-slate-700 min-w-[130px] text-center">
                                <div class="font-extrabold text-[11px] text-indigo-200 tracking-wider">${dateStr}</div>
                                <div class="font-bold text-xs text-white mt-0.5">${enDay}</div>
                            </th>
                        `;
                    }).join('')}
                </tr>

                <!-- Second Row: Session Timings Band -->
                <tr class="bg-slate-100 text-slate-800 border-b-2 border-slate-900 text-[10px] font-sans font-black">
                    <th class="py-1.5 px-2 border-r-2 border-slate-900 bg-slate-200 text-slate-900 uppercase">
                        Timing
                    </th>
                    ${masterExamDates.map((_, idx) => `
                        <th class="py-1.5 px-2 border-r border-slate-300 text-center text-slate-700">
                            ${timingBands[idx % 8] || '07.00am To 09.00am'}
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody class="divide-y-2 divide-slate-900 font-medium text-slate-900">
                ${classesToRender.map(cls => {
                    const cData = masterExamTimetables[cls] || { matrix: {} };
                    const matrix = cData.matrix || {};

                    return `
                        <tr class="hover:bg-slate-50 transition border-b-2 border-slate-900">
                            <!-- Class Identifier Cell -->
                            <td class="py-3 px-2 border-r-2 border-slate-900 font-black text-sm text-slate-950 bg-slate-100/90 text-center">
                                Class ${cls}
                            </td>

                            ${masterExamDates.map(dateStr => {
                                const dateKeys = Object.keys(matrix).filter(k => k.startsWith(`${dateStr}_`));
                                if (!dateKeys.length) {
                                    return `
                                        <td class="p-2 border-r border-slate-300 text-center text-slate-300 text-xs">
                                            --
                                        </td>`;
                                }

                                const dateCells = dateKeys.map(k => matrix[k]);
                                if (dateCells.some(c => c.isNoExam)) {
                                    return `
                                        <td class="p-2 border-r border-slate-300 text-center bg-amber-50/40 text-amber-800 font-black text-[10px] uppercase select-none">
                                            Study Leave
                                        </td>`;
                                }

                                const assignedSubjects = dateCells.map(c => c.subjectName).filter(Boolean);
                                if (!assignedSubjects.length) {
                                    return `
                                        <td class="p-2 border-r border-slate-300 text-center text-slate-300 text-xs">
                                            --
                                        </td>`;
                                }

                                return `
                                    <td class="p-2 border-r border-slate-300 text-center align-middle">
                                        ${assignedSubjects.map((s, sIdx) => `
                                            <div class="font-black text-xs text-slate-950 leading-tight ${sIdx > 0 ? 'mt-1 pt-1 border-t border-slate-200 text-indigo-900' : ''}">
                                                ${escapeHtml(s)}
                                            </div>
                                        `).join('')}
                                    </td>`;
                            }).join('')}
                        </tr>`;
                }).join('')}
            </tbody>
        </table>

        <!-- Guidelines Note -->
        <div class="mt-4 p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl text-[11px] font-bold text-indigo-950 flex items-center justify-between flex-wrap gap-2">
            <div>
                <i class="fas fa-info-circle text-indigo-600 mr-1.5"></i>
                <span class="font-black">Examination Protocol:</span> All students must be seated 15 minutes before the scheduled commencement time.
            </div>
            <div class="text-[10px] text-indigo-800 font-semibold">
                Official Examination Board Routine
            </div>
        </div>
    `;

    grid.innerHTML = html;
};

const saveExamTimetableMatrix = async () => {
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const selectedClass = document.getElementById('exam-tt-class-select')?.value || '1';
    if (!currentExamTitle) return alert('Please select an examination first.');

    const updatedMatrix = {};
    const selects = document.querySelectorAll('.exam-cell-subject');

    selects.forEach(sel => {
        const date = sel.dataset.date;
        const session = sel.dataset.session;
        const val = sel.value;
        const cellKey = `${date}_${session}`;

        const portionsInput = document.querySelector(`.exam-cell-portions[data-date="${date}"][data-session="${session}"]`);
        const invigilatorInput = document.querySelector(`.exam-cell-invigilator[data-date="${date}"][data-session="${session}"]`);
        const hallInput = document.querySelector(`.exam-cell-hall[data-date="${date}"][data-session="${session}"]`);

        if (val === '__NO_EXAM__') {
            updatedMatrix[cellKey] = {
                subjectId: '',
                subjectName: 'No Exam / Study Leave',
                subjectCode: '',
                isNoExam: true,
                portions: portionsInput?.value.trim() || '',
                invigilator: '',
                hall: ''
            };
        } else if (val) {
            const subjObj = classSubjectsList.find(s => s.id === val);
            updatedMatrix[cellKey] = {
                subjectId: val,
                subjectName: subjObj ? subjObj.name : 'Subject',
                subjectCode: subjObj ? subjObj.code : '',
                isNoExam: false,
                portions: portionsInput?.value.trim() || '',
                invigilator: invigilatorInput?.value.trim() || '',
                hall: hallInput?.value.trim() || ''
            };
        }
    });

    examMatrix = updatedMatrix;
    const docId = getExamTimetableDocId(year, selectedClass, currentExamTitle);

    try {
        await setDoc(doc(db, `${BASE_PATH}/examTimetables`, docId), {
            academicYear: year,
            classLabel: selectedClass,
            examTitle: currentExamTitle,
            dates: examDates,
            sessions: examSessions,
            sessionSlots: examSessions,
            matrix: examMatrix,
            updatedAt: Date.now()
        }, { merge: true });

        showToast(`Exam routine for Class ${selectedClass} saved successfully!`, 'success');
        const toggle = document.getElementById('toggle-exam-timetable-edit');
        if (toggle) toggle.checked = false;
        toggleExamTimetableEdit(false);
    } catch (err) {
        alert('Failed to save exam schedule: ' + err.message);
    }
};

const openAddEditExamSessionModal = (sessionId = null) => {
    editingExamSessionId = sessionId;
    const titleEl = document.getElementById('modal-exam-session-title');
    const idInput = document.getElementById('modal-exam-session-id');
    const labelInput = document.getElementById('modal-exam-session-label');
    const startInput = document.getElementById('modal-exam-session-start');
    const endInput = document.getElementById('modal-exam-session-end');

    if (sessionId) {
        const session = examSessions.find(s => s.id === sessionId);
        if (!session) return;
        if (titleEl) titleEl.textContent = 'Edit Exam Paper';
        if (idInput) idInput.value = session.id;
        if (labelInput) labelInput.value = session.label;
        if (startInput) startInput.value = normalizeTimeTo24h(session.startTime || '08:30');
        if (endInput) endInput.value = normalizeTimeTo24h(session.endTime || '10:00');
    } else {
        const nextNum = examSessions.length + 1;
        const lastSession = examSessions.length > 0 ? examSessions[examSessions.length - 1] : null;
        let defaultStart = '10:00';
        let defaultEnd = '11:30';
        if (lastSession && lastSession.endTime) {
            defaultStart = normalizeTimeTo24h(lastSession.endTime);
            const [h, m] = defaultStart.split(':').map(Number);
            const totalMins = (h * 60) + (m || 0) + 90;
            const nextH = Math.floor(totalMins / 60) % 24;
            const nextM = totalMins % 60;
            defaultEnd = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
        }
        if (titleEl) titleEl.textContent = 'Add Exam Paper';
        if (idInput) idInput.value = '';
        if (labelInput) labelInput.value = `Paper ${nextNum}`;
        if (startInput) startInput.value = defaultStart;
        if (endInput) endInput.value = defaultEnd;
    }
    openModal('modal-add-edit-exam-session');
    setTimeout(() => { labelInput?.focus(); labelInput?.select(); }, 50);
};

const saveExamSession = async () => {
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const selectedClass = document.getElementById('exam-tt-class-select')?.value || '1';
    const label = document.getElementById('modal-exam-session-label')?.value.trim();
    const startTime = document.getElementById('modal-exam-session-start')?.value.trim() || '08:30';
    const endTime = document.getElementById('modal-exam-session-end')?.value.trim() || '10:00';

    if (!label) {
        alert('Please enter a paper / session name.');
        return;
    }

    if (editingExamSessionId) {
        const idx = examSessions.findIndex(s => s.id === editingExamSessionId);
        if (idx !== -1) {
            examSessions[idx] = {
                ...examSessions[idx],
                label,
                startTime,
                endTime
            };
        }
    } else {
        const newSession = {
            id: `session_${Date.now()}`,
            label,
            startTime,
            endTime
        };
        examSessions.push(newSession);
    }

    try {
        const docId = getExamTimetableDocId(year, selectedClass, currentExamTitle);
        await setDoc(doc(db, `${BASE_PATH}/examTimetables`, docId), {
            sessions: examSessions,
            sessionSlots: examSessions,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-add-edit-exam-session');
        renderExamTimetableGridUI();
        showToast('Exam paper session saved successfully.', 'success');
    } catch (err) {
        alert('Failed to save paper session: ' + err.message);
    }
};

const deleteExamSession = async (sessionId) => {
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const selectedClass = document.getElementById('exam-tt-class-select')?.value || '1';
    const session = examSessions.find(s => s.id === sessionId);
    if (!session) return;

    if (!confirm(`Are you sure you want to delete ${session.label}? Any assigned papers in this session will also be removed.`)) {
        return;
    }

    examSessions = examSessions.filter(s => s.id !== sessionId);

    // Clean up matrix entries matching this session
    const cleanedMatrix = {};
    Object.entries(examMatrix).forEach(([k, v]) => {
        if (!k.endsWith(`_${sessionId}`)) {
            cleanedMatrix[k] = v;
        }
    });
    examMatrix = cleanedMatrix;

    try {
        const docId = getExamTimetableDocId(year, selectedClass, currentExamTitle);
        await setDoc(doc(db, `${BASE_PATH}/examTimetables`, docId), {
            sessions: examSessions,
            sessionSlots: examSessions,
            matrix: examMatrix,
            updatedAt: Date.now()
        }, { merge: true });

        renderExamTimetableGridUI();
        showToast('Paper session removed.', 'success');
    } catch (err) {
        alert('Failed to remove paper: ' + err.message);
    }
};

const openAddExamDateModal = () => {
    if (!currentExamTitle) return alert('Please select or create an examination first.');
    const dateInput = document.getElementById('modal-exam-picker-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    openModal('modal-add-exam-date');
};

const confirmAddExamDate = () => {
    const dateInput = document.getElementById('modal-exam-picker-date');
    const pickedDate = dateInput?.value;
    if (!pickedDate) return alert('Please select a valid date.');

    if (examDates.includes(pickedDate)) {
        return alert('This date is already included in the exam schedule.');
    }

    examDates.push(pickedDate);
    examDates.sort();

    closeModal('modal-add-exam-date');
    const datesBadge = document.getElementById('exam-tt-dates-badge');
    if (datesBadge) datesBadge.textContent = `${examDates.length} Scheduled Day${examDates.length === 1 ? '' : 's'}`;

    renderExamTimetableGridUI();
    showToast(`Added ${formatDisplayDate(pickedDate)} to exam schedule.`, 'info');
};

const removeExamDate = (dateStr) => {
    if (!confirm(`Are you sure you want to remove ${formatDisplayDate(dateStr)} from the exam schedule?`)) return;
    examDates = examDates.filter(d => d !== dateStr);
    Object.keys(examMatrix).forEach(k => {
        if (k.startsWith(`${dateStr}_`)) {
            delete examMatrix[k];
        }
    });

    const datesBadge = document.getElementById('exam-tt-dates-badge');
    if (datesBadge) datesBadge.textContent = `${examDates.length} Scheduled Day${examDates.length === 1 ? '' : 's'}`;

    renderExamTimetableGridUI();
};

// =========================================================================
// SETUP EVENT LISTENERS
// =========================================================================
const setupEventListeners = () => {
    // 1. Sidebar Collapse & Mobile Menu
    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', toggleSidebarState);
    document.getElementById('academic-mobile-menu-btn')?.addEventListener('click', () => setSidebarCollapsed(false));
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

    // 2. Class Subjects & Cards Listeners
    document.getElementById('subj-academic-year')?.addEventListener('change', loadClassSubjects);
    document.getElementById('subj-class-select')?.addEventListener('change', loadClassSubjects);
    document.getElementById('subj-search-input')?.addEventListener('input', renderClassSubjectsUI);
    document.getElementById('btn-add-subject')?.addEventListener('click', () => openSubjectModal(null));
    document.getElementById('btn-save-subject')?.addEventListener('click', saveClassSubject);
    document.getElementById('btn-sync-subjects-schema')?.addEventListener('click', syncSubjectsFromResultSchema);

    // Cards Grid Delegation
    document.getElementById('subjects-cards-grid')?.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.btn-card-add-subject');
        if (addBtn) {
            openSubjectModal(null, addBtn.dataset.class);
            return;
        }

        const editBtn = e.target.closest('.btn-edit-subject');
        if (editBtn) {
            const cls = editBtn.dataset.class;
            const id = editBtn.dataset.id;
            const cData = classCardsData[cls];
            const subj = cData?.subjects?.find(s => s.id === id);
            if (subj) openSubjectModal(subj, cls);
            return;
        }

        const delBtn = e.target.closest('.btn-del-subject');
        if (delBtn) {
            deleteClassSubject(delBtn.dataset.id, delBtn.dataset.class);
            return;
        }

        const manageExamsBtn = e.target.closest('.btn-card-manage-exams');
        if (manageExamsBtn) {
            openAddExamNameModal();
            const scopeSel = document.getElementById('modal-new-exam-class-scope');
            if (scopeSel) scopeSel.value = 'specific';
            const specWrap = document.getElementById('modal-new-exam-specific-class-wrapper');
            if (specWrap) specWrap.classList.remove('hidden');
            const specSel = document.getElementById('modal-new-exam-specific-class');
            if (specSel) specSel.value = manageExamsBtn.dataset.class;
            return;
        }

        const delExamBtn = e.target.closest('.btn-card-delete-exam');
        if (delExamBtn) {
            deleteCustomExamFromCard(delExamBtn.dataset.key, delExamBtn.dataset.class);
            return;
        }

        const gotoTtBtn = e.target.closest('.btn-card-goto-tt');
        if (gotoTtBtn) {
            jumpToClassTab('tab-timetable', gotoTtBtn.dataset.class);
            return;
        }

        const gotoYpBtn = e.target.closest('.btn-card-goto-yp');
        if (gotoYpBtn) {
            jumpToClassTab('tab-yearplan', gotoYpBtn.dataset.class);
            return;
        }

        const gotoExamBtn = e.target.closest('.btn-card-goto-exam');
        if (gotoExamBtn) {
            jumpToClassTab('tab-exam-schedule', gotoExamBtn.dataset.class);
            return;
        }
    });

    // 3. Timetable Listeners
    document.getElementById('tt-academic-year')?.addEventListener('change', loadTimetable);
    document.getElementById('tt-class-select')?.addEventListener('change', loadTimetable);
    document.getElementById('toggle-timetable-edit')?.addEventListener('change', (e) => {
        toggleTimetableEdit(e.target.checked);
    });
    document.getElementById('btn-save-timetable')?.addEventListener('click', saveTimetableMatrix);
    document.getElementById('btn-tt-settings')?.addEventListener('click', openTimetableSettingsModal);
    document.getElementById('btn-save-tt-settings')?.addEventListener('click', saveTimetableSettings);
    document.getElementById('btn-print-timetable')?.addEventListener('click', printTimetableRoutine);

    // Dynamic Class Timetable Slots
    document.getElementById('btn-save-tt-slot')?.addEventListener('click', saveTimetableSlot);
    document.getElementById('tt-schedule-grid')?.addEventListener('click', (e) => {
        const addSlotBtn = e.target.closest('#btn-add-tt-slot-header') || e.target.closest('.btn-add-tt-slot');
        if (addSlotBtn) {
            e.preventDefault();
            e.stopPropagation();
            openAddEditTimetableSlotModal(null);
            return;
        }
        const editBtn = e.target.closest('.btn-edit-tt-slot');
        if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            openAddEditTimetableSlotModal(editBtn.dataset.slotId);
            return;
        }
        const delBtn = e.target.closest('.btn-delete-tt-slot');
        if (delBtn) {
            e.preventDefault();
            e.stopPropagation();
            deleteTimetableSlot(delBtn.dataset.slotId);
            return;
        }
        const gotoClassBtn = e.target.closest('.btn-goto-class-tt');
        if (gotoClassBtn) {
            e.preventDefault();
            e.stopPropagation();
            const cls = gotoClassBtn.dataset.class;
            const sel = document.getElementById('tt-class-select');
            if (sel) sel.value = cls;
            selectedTtClass = cls;
            loadTimetable();
            return;
        }
    });

    ['modal-tt-slot-label', 'modal-tt-slot-start', 'modal-tt-slot-end'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveTimetableSlot();
            }
        });
    });

    // Structure Settings Controls
    document.getElementById('tt-working-days-picker')?.addEventListener('change', updateDaysSummaryAndCardStyles);

    document.getElementById('btn-period-count-dec')?.addEventListener('click', () => {
        setTimetableSlotsCount(currentEditingSlots.length - 1);
    });
    document.getElementById('btn-period-count-inc')?.addEventListener('click', () => {
        setTimetableSlotsCount(currentEditingSlots.length + 1);
    });
    document.getElementById('tt-settings-total-periods')?.addEventListener('change', (e) => {
        setTimetableSlotsCount(e.target.value);
    });

    document.getElementById('btn-autotime-apply')?.addEventListener('click', applyAutoTimings);
    document.getElementById('btn-insert-break-slot')?.addEventListener('click', insertBreakSlot);

    // Timetable Weekend Confirmation Listeners
    document.getElementById('tt-weekend-confirm-options-group')?.addEventListener('change', () => {
        const isToday = document.querySelector('input[name="tt-weekend-apply-scope"]:checked')?.value === 'today';
        const cards = document.querySelectorAll('.tt-weekend-confirm-card');
        if (cards[0]) {
            cards[0].className = isToday
                ? 'tt-weekend-confirm-card flex items-start gap-3 p-3.5 rounded-2xl border-2 border-indigo-500 bg-indigo-50/60 cursor-pointer select-none transition'
                : 'tt-weekend-confirm-card flex items-start gap-3 p-3.5 rounded-2xl border-2 border-slate-200 bg-white hover:bg-slate-50 cursor-pointer select-none transition';
        }
        if (cards[1]) {
            cards[1].className = !isToday
                ? 'tt-weekend-confirm-card flex items-start gap-3 p-3.5 rounded-2xl border-2 border-indigo-500 bg-indigo-50/60 cursor-pointer select-none transition'
                : 'tt-weekend-confirm-card flex items-start gap-3 p-3.5 rounded-2xl border-2 border-slate-200 bg-white hover:bg-slate-50 cursor-pointer select-none transition';
        }
    });

    document.getElementById('btn-tt-confirm-weekend-ok')?.addEventListener('click', () => {
        const mode = document.querySelector('input[name="tt-weekend-apply-scope"]:checked')?.value || 'today';
        applyTimetableWeekendSync(mode);
    });

    document.getElementById('tt-timings-container')?.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.btn-remove-slot');
        if (!delBtn) return;
        syncSlotInputsToMemory();
        const idx = Number(delBtn.dataset.index);
        if (!isNaN(idx) && currentEditingSlots[idx]) {
            currentEditingSlots.splice(idx, 1);
            renderTimetableSlotsEditor();
        }
    });

    document.getElementById('tt-timings-container')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('tt-slot-start') || e.target.classList.contains('tt-slot-end')) {
            const card = e.target.closest('.tt-slot-card');
            if (card) {
                const s = card.querySelector('.tt-slot-start')?.value;
                const en = card.querySelector('.tt-slot-end')?.value;
                const durBadge = card.querySelector('.slot-duration-badge');
                if (durBadge) durBadge.textContent = `${calcSlotDuration(s, en)} mins`;
            }
        }
    });

    document.getElementById('tt-timings-container')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('tt-slot-is-break')) {
            syncSlotInputsToMemory();
            renderTimetableSlotsEditor();
        }
    });

    // 4. Academic Year Plan Listeners
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

    // 5. Exam Schedule & Master Timetable Listeners
    document.getElementById('btn-exam-view-single')?.addEventListener('click', () => switchExamViewMode('single'));
    document.getElementById('btn-exam-view-master')?.addEventListener('click', () => switchExamViewMode('master'));
    document.getElementById('btn-print-master-exam-tt')?.addEventListener('click', () => window.print());

    document.getElementById('modal-new-exam-class-scope')?.addEventListener('change', (e) => {
        const wrap = document.getElementById('modal-new-exam-specific-class-wrapper');
        if (wrap) {
            wrap.classList.toggle('hidden', e.target.value !== 'specific');
        }
    });

    document.getElementById('exam-tt-academic-year')?.addEventListener('change', async () => {
        const y = document.getElementById('exam-tt-academic-year')?.value;
        const c = document.getElementById('exam-tt-class-select')?.value;
        await loadAvailableExams(y, c);
        if (examViewMode === 'master') {
            await loadMasterExamTimetable();
        } else {
            await loadExamTimetable();
        }
    });
    document.getElementById('exam-tt-class-select')?.addEventListener('change', async () => {
        const y = document.getElementById('exam-tt-academic-year')?.value;
        const c = document.getElementById('exam-tt-class-select')?.value;
        await loadAvailableExams(y, c);
        if (examViewMode === 'master') {
            await loadMasterExamTimetable();
        } else {
            await loadExamTimetable();
        }
    });
    document.getElementById('exam-tt-title-select')?.addEventListener('change', async () => {
        if (examViewMode === 'master') {
            await loadMasterExamTimetable();
        } else {
            await loadExamTimetable();
        }
    });
    document.getElementById('toggle-exam-timetable-edit')?.addEventListener('change', (e) => {
        toggleExamTimetableEdit(e.target.checked);
    });
    document.getElementById('btn-add-exam-date')?.addEventListener('click', openAddExamDateModal);
    document.getElementById('btn-confirm-add-exam-date')?.addEventListener('click', confirmAddExamDate);
    document.getElementById('btn-save-exam-timetable')?.addEventListener('click', saveExamTimetableMatrix);
    document.getElementById('btn-print-exam-tt')?.addEventListener('click', () => window.print());
    document.getElementById('btn-add-exam-name')?.addEventListener('click', openAddExamNameModal);
    document.getElementById('btn-save-new-exam-title')?.addEventListener('click', saveNewExamName);

    // Dynamic Exam Paper Sessions
    document.getElementById('btn-save-exam-session')?.addEventListener('click', saveExamSession);

    // Standalone Master Timetable Listeners
    document.getElementById('master-tt-academic-year')?.addEventListener('change', async () => {
        const y = document.getElementById('master-tt-academic-year')?.value;
        await loadAvailableExams(y, 'all');
        await loadMasterExamTimetable();
    });
    document.getElementById('master-tt-exam-select')?.addEventListener('change', async () => {
        await loadMasterExamTimetable();
    });
    document.getElementById('btn-print-master-timetable')?.addEventListener('click', () => window.print());

    document.getElementById('exam-schedule-grid')?.addEventListener('click', (e) => {
        const addSessionBtn = e.target.closest('#btn-add-exam-paper-header') || e.target.closest('.btn-add-exam-session');
        if (addSessionBtn) {
            e.preventDefault();
            e.stopPropagation();
            openAddEditExamSessionModal(null);
            return;
        }
        const delBtn = e.target.closest('.btn-remove-exam-date');
        if (delBtn) {
            e.preventDefault();
            e.stopPropagation();
            removeExamDate(delBtn.dataset.date);
            return;
        }
        const editSessionBtn = e.target.closest('.btn-edit-exam-session');
        if (editSessionBtn) {
            e.preventDefault();
            e.stopPropagation();
            openAddEditExamSessionModal(editSessionBtn.dataset.sessionId);
            return;
        }
        const delSessionBtn = e.target.closest('.btn-delete-exam-session');
        if (delSessionBtn) {
            e.preventDefault();
            e.stopPropagation();
            deleteExamSession(delSessionBtn.dataset.sessionId);
            return;
        }
        const addDateBtn = e.target.closest('[data-action="add-exam-date"]') || e.target.closest('.btn-trigger-add-exam-date');
        if (addDateBtn) {
            e.preventDefault();
            e.stopPropagation();
            openAddExamDateModal();
            return;
        }
    });

    ['modal-exam-session-label', 'modal-exam-session-start', 'modal-exam-session-end'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveExamSession();
            }
        });
    });

    // Delegated click listener for Add buttons anywhere in document
    document.addEventListener('click', (e) => {
        const addSlotBtn = e.target.closest('#btn-add-tt-slot-header') || e.target.closest('.btn-add-tt-slot');
        if (addSlotBtn) {
            e.preventDefault();
            openAddEditTimetableSlotModal(null);
            return;
        }
        const addSessionBtn = e.target.closest('#btn-add-exam-paper-header') || e.target.closest('.btn-add-exam-session');
        if (addSessionBtn) {
            e.preventDefault();
            openAddEditExamSessionModal(null);
            return;
        }
        const addDateBtn = e.target.closest('[data-action="add-exam-date"]')
            || e.target.closest('.btn-trigger-add-exam-date')
            || (e.target.id === 'btn-add-first-exam-date');
        if (addDateBtn) {
            e.preventDefault();
            openAddExamDateModal();
            return;
        }
    });

    // Expose helpers globally
    window.openAddExamDateModal = openAddExamDateModal;
    window.openAddEditTimetableSlotModal = openAddEditTimetableSlotModal;
    window.openAddEditExamSessionModal = openAddEditExamSessionModal;

    // 6. Sign Out
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
