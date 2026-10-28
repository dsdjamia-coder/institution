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

let institutionConfig = {};
let currentAcademicYear = '';
let availableAcademicYears = [];
let allClasses = [];

// --- Class Subjects State ---
let selectedSubjectsClass = '';
let classSubjectsList = []; // [ { id, name, code, teacher, weeklyPeriods } ]
let editingSubjectId = null;

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
let currentExamTitle = 'First Term Examination';
let examTimetableEntries = [];

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
        classesSet.add(str);
    };

    if (staffDoc) {
        addIfClass(staffDoc.assignedClass);
        addIfClass(staffDoc.assignedClasses);
        addIfClass(staffDoc.class);
        addIfClass(staffDoc.classes);
        addIfClass(staffDoc.teachingClasses);
    }
    if (staffAccess) {
        addIfClass(staffAccess.assignedClass);
        addIfClass(staffAccess.assignedClasses);
        addIfClass(staffAccess.class);
        addIfClass(staffAccess.classes);
    }
    return Array.from(classesSet);
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
        loadAvailableExams(y, c).then(() => loadExamTimetable());
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
        setupEventListeners();
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

    const standardIds = [
        'subj-class-select',
        'tt-class-select',
        'yp-class-select',
        'exam-tt-class-select',
        'modal-exam-class-select'
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

const loadClassSubjects = async () => {
    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
    selectedSubjectsClass = document.getElementById('subj-class-select')?.value || teacherAssignedClasses[0] || '1';
    const tbody = document.getElementById('subjects-table-body');

    if (!selectedSubjectsClass) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-bold">Please select a class.</td></tr>`;
        return;
    }

    try {
        const docId = getClassSubjectsDocId(year, selectedSubjectsClass);
        const resultDocId = getResultSchemaDocId(year, selectedSubjectsClass);

        const [subjSnap, resultSnap] = await Promise.all([
            getDoc(doc(db, `${BASE_PATH}/classSubjects`, docId)).catch(() => null),
            getDoc(doc(db, `${BASE_PATH}/resultSchemas`, resultDocId)).catch(() => null)
        ]);

        let loadedFromPlan = [];
        if (subjSnap && subjSnap.exists() && Array.isArray(subjSnap.data().subjects)) {
            loadedFromPlan = subjSnap.data().subjects;
        }

        let loadedFromResult = [];
        if (resultSnap && resultSnap.exists()) {
            const rData = resultSnap.data();
            if (Array.isArray(rData.subjectRows) && rData.subjectRows.length) {
                loadedFromResult = rData.subjectRows.map(r => r.name).filter(Boolean);
            } else if (Array.isArray(rData.subjects) && rData.subjects.length) {
                loadedFromResult = rData.subjects.filter(Boolean);
            }
        }

        if (loadedFromPlan.length > 0) {
            classSubjectsList = [...loadedFromPlan];
            let hasNewFromResult = false;
            loadedFromResult.forEach(rName => {
                const trimmed = String(rName).trim();
                if (!trimmed) return;
                const exists = classSubjectsList.some(s => String(s.name || '').trim().toLowerCase() === trimmed.toLowerCase());
                if (!exists) {
                    const code = trimmed.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'SUB';
                    classSubjectsList.push({
                        id: `subj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                        name: trimmed,
                        code: code,
                        teacher: '',
                        weeklyPeriods: 5
                    });
                    hasNewFromResult = true;
                }
            });
            if (hasNewFromResult) {
                await setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
                    subjects: classSubjectsList,
                    updatedAt: Date.now()
                }, { merge: true });
            }
        } else if (loadedFromResult.length > 0) {
            classSubjectsList = loadedFromResult.map((rName, idx) => {
                const trimmed = String(rName).trim();
                const code = trimmed.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || `S${idx + 1}`;
                return {
                    id: `subj_${Date.now()}_${idx}`,
                    name: trimmed,
                    code: code,
                    teacher: '',
                    weeklyPeriods: 5
                };
            });
            await setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
                subjects: classSubjectsList,
                updatedAt: Date.now()
            }, { merge: true });
        } else {
            // Clean empty state - zero dummy subjects injected
            classSubjectsList = [];
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
                    <i class="fas fa-book-bookmark text-3xl mb-2 text-slate-300 block"></i>
                    No subjects configured for Class ${escapeHtml(selectedSubjectsClass)} yet.<br>
                    <span class="text-xs text-slate-500">Subjects added here or in Result Management are automatically synchronized.</span><br>
                    <button type="button" class="mt-3 px-3.5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition shadow-2xs inline-flex items-center gap-1.5" onclick="document.getElementById('btn-add-subject').click()">
                        <i class="fas fa-plus"></i> Add First Subject
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
                    <button type="button" class="btn-edit-subject p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition cursor-pointer" data-id="${s.id}" title="Edit Subject">
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
    let code = document.getElementById('modal-subject-code')?.value.trim().toUpperCase();
    const name = document.getElementById('modal-subject-name')?.value.trim();
    const teacher = document.getElementById('modal-subject-teacher')?.value.trim() || '';
    const weeklyPeriods = Number(document.getElementById('modal-subject-weekly-periods')?.value || 5);

    if (!name) return alert('Please enter a subject name.');

    if (!code) {
        code = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'SUB';
    }

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

        // Bi-directional sync: update resultSchemas as well
        await syncClassSubjectsToResultSchema(year, selectedSubjectsClass, classSubjectsList);

        closeModal('modal-subject-edit');
        showToast(`Subject "${name}" saved and synchronized successfully!`, 'success');
        renderClassSubjectsUI();
    } catch (err) {
        alert('Failed to save subject: ' + err.message);
    }
};

const deleteClassSubject = async (subjectId) => {
    if (!confirm('Are you sure you want to delete this subject? It will also be updated in Result Management.')) return;
    classSubjectsList = classSubjectsList.filter(s => s.id !== subjectId);

    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
    const docId = getClassSubjectsDocId(year, selectedSubjectsClass);

    try {
        await setDoc(doc(db, `${BASE_PATH}/classSubjects`, docId), {
            subjects: classSubjectsList,
            updatedAt: Date.now()
        }, { merge: true });

        // Bi-directional sync: update resultSchemas as well
        await syncClassSubjectsToResultSchema(year, selectedSubjectsClass, classSubjectsList);

        showToast('Subject removed and synchronized.', 'info');
        renderClassSubjectsUI();
    } catch (err) {
        alert('Failed to delete subject: ' + err.message);
    }
};

const syncSubjectsFromResultSchema = async () => {
    const year = document.getElementById('subj-academic-year')?.value || currentAcademicYear;
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

const loadTimetable = async () => {
    const year = document.getElementById('tt-academic-year')?.value || currentAcademicYear;
    selectedTtClass = document.getElementById('tt-class-select')?.value || selectedSubjectsClass || '1';
    const heading = document.getElementById('tt-view-heading');

    if (heading) heading.textContent = `Class ${selectedTtClass} Weekly Routine Timetable (${year})`;

    await ensureClassSubjectsLoaded(year, selectedTtClass);

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

    const slots = normalizeTimetableSlots(timetableConfig);
    const teachingSlotsCount = slots.filter(s => !s.isBreak).length;

    if (workingDaysBadge) workingDaysBadge.textContent = `${workingDays.length} Working Days / Wk`;
    if (totalPeriodsBadge) totalPeriodsBadge.textContent = `${teachingSlotsCount} Teaching Periods / Day`;

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

    slots.forEach((slot) => {
        if (slot.isBreak) {
            html += `
                <th class="py-2.5 px-3 border-r border-slate-200 min-w-[100px] text-center bg-amber-50/70 border-b-2 border-b-amber-300">
                    <div class="text-[11px] font-black text-amber-900 tracking-wider flex items-center justify-center gap-1.5">
                        <i class="fas fa-mug-hot text-amber-600 text-xs"></i> ${escapeHtml(slot.label)}
                    </div>
                    <div class="text-[10px] font-bold text-amber-700/80 mt-0.5">${slot.startTime} - ${slot.endTime}</div>
                </th>`;
        } else {
            html += `
                <th class="py-2.5 px-3 border-r border-slate-200 min-w-[140px]">
                    <div class="text-[11px] font-black text-slate-900 tracking-wider">${escapeHtml(slot.label)}</div>
                    <div class="text-[10px] font-semibold text-slate-500 mt-0.5">${slot.startTime} - ${slot.endTime}</div>
                </th>`;
        }
    });
    html += `</tr></thead><tbody class="divide-y divide-slate-200 font-medium">`;

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
                        <input type="text" class="tt-cell-teacher w-full p-1 text-[11px] border border-slate-200 rounded text-slate-700 outline-none mb-1 bg-white" placeholder="Teacher / Ustad" value="${escapeHtml(slotData.teacher || '')}" data-day="${day}" data-slot="${slot.slotId}" data-period="${p}">
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
        await setDoc(doc(db, `${BASE_PATH}/timetables`, docId), {
            config: timetableConfig,
            matrix: timetableMatrix,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-tt-settings');
        showToast('Timetable structure settings applied successfully!', 'success');
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

const loadYearPlan = async () => {
    const year = document.getElementById('yp-academic-year')?.value || currentAcademicYear;
    selectedYpClass = document.getElementById('yp-class-select')?.value || selectedSubjectsClass || '1';
    const heading = document.getElementById('yp-view-heading');

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
                    <i class="fas fa-calendar-check text-indigo-600 mr-1.5"></i>${month}
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
                    <td class="p-2.5 border-r border-slate-200 align-top cursor-pointer hover:bg-indigo-50/40 transition yp-cell-clickable" data-month="${month}" data-subject-id="${s.id}" data-subject-name="${escapeHtml(s.name)}">
                        ${hasTarget ? `
                            <div class="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-indigo-300 transition">
                                <div class="flex items-center justify-between gap-1 mb-1">
                                    <span class="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusClass}">${status}</span>
                                    <span class="text-[10px] font-bold text-slate-500">${cell.allocatedPeriods || 16} P</span>
                                </div>
                                <div class="font-extrabold text-xs text-slate-900 leading-tight">${cell.lessonNo ? `${escapeHtml(cell.lessonNo)}: ` : ''}${escapeHtml(cell.topic || 'Untitled Topic')}</div>
                                ${cell.pages ? `<div class="text-[10px] text-indigo-700 font-bold mt-1"><i class="fas fa-file-lines text-[9px] mr-1"></i>${escapeHtml(cell.pages)}</div>` : ''}
                                <div class="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                                    <div class="bg-indigo-600 h-1.5 rounded-full" style="width: ${cell.progressPercent || 0}%"></div>
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

    // 1. Fetch from resultSchemas for this specific class
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

    // 2. Check across all resultSchemas for this academic year to gather all active exam types
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

    // 3. Fallback: If no exams configured anywhere in resultSchemas, include standard institutional exams
    if (examsSet.size === 0) {
        ['First Term Examination', 'Half Yearly Examination', 'Annual Examination'].forEach(e => examsSet.set(e, e));
    }

    const select = document.getElementById('exam-tt-title-select');
    if (!select) return;

    const prevVal = select.value;
    select.innerHTML = Array.from(examsSet.values()).map(name => `
        <option value="${escapeHtml(name)}">${escapeHtml(name)}</option>
    `).join('');

    if (prevVal && examsSet.has(prevVal)) {
        select.value = prevVal;
    } else {
        select.selectedIndex = 0;
    }

    currentExamTitle = select.value;
};

const openAddExamNameModal = () => {
    const input = document.getElementById('modal-new-exam-title');
    if (input) input.value = '';
    openModal('modal-add-exam-name');
};

const saveNewExamName = async () => {
    const titleInput = document.getElementById('modal-new-exam-title');
    const title = titleInput?.value.trim();
    if (!title) return alert('Please enter an examination title.');

    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const selectedClass = document.getElementById('exam-tt-class-select')?.value || '1';

    try {
        const resultDocId = getResultSchemaDocId(year, selectedClass);
        const resultRef = doc(db, `${BASE_PATH}/resultSchemas`, resultDocId);
        const snap = await getDoc(resultRef);

        const existingData = snap.exists() ? snap.data() : {};
        const examConfigs = existingData.examConfigs || {};
        const examKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `exam_${Date.now()}`;

        examConfigs[examKey] = {
            label: title,
            subjects: [],
            isDefault: false
        };

        await setDoc(resultRef, {
            classLabel: String(selectedClass),
            academicYear: String(year),
            examConfigs: examConfigs,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-add-exam-name');
        showToast(`Examination "${title}" created and synchronized with Result Management!`, 'success');

        await loadAvailableExams(year, selectedClass);
        const select = document.getElementById('exam-tt-title-select');
        if (select) select.value = title;
        currentExamTitle = title;
        loadExamTimetable();
    } catch (err) {
        alert('Failed to save examination: ' + err.message);
    }
};

const loadExamTimetable = async () => {
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const selectedClass = document.getElementById('exam-tt-class-select')?.value || '1';
    currentExamTitle = document.getElementById('exam-tt-title-select')?.value || '';
    const tbody = document.getElementById('exam-papers-tbody');
    const heading = document.getElementById('exam-tt-view-heading');
    const badge = document.getElementById('exam-tt-class-badge');

    if (heading) heading.textContent = currentExamTitle ? `${currentExamTitle} Routine` : 'Scheduled Examination Papers';
    if (badge) badge.textContent = `Class ${selectedClass}`;

    if (!currentExamTitle) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400 font-bold">Please select or create an examination.</td></tr>`;
        return;
    }

    try {
        const docId = getExamTimetableDocId(year, selectedClass, currentExamTitle);
        const snap = await getDoc(doc(db, `${BASE_PATH}/examTimetables`, docId));
        if (snap.exists() && Array.isArray(snap.data().entries)) {
            examTimetableEntries = snap.data().entries;
        } else {
            // Check legacy global doc
            const legacyDocId = `${String(year).replace(/[^\w-]/g, '_')}__${String(currentExamTitle).replace(/[^\w-]/g, '_')}`;
            const legacySnap = await getDoc(doc(db, `${BASE_PATH}/examTimetables`, legacyDocId));
            if (legacySnap.exists() && Array.isArray(legacySnap.data().entries)) {
                examTimetableEntries = legacySnap.data().entries.filter(e => String(e.classLabel) === String(selectedClass));
            } else {
                examTimetableEntries = [];
            }
        }
    } catch (err) {
        console.error('Failed to load exam timetable:', err);
    }

    if (!tbody) return;

    if (!examTimetableEntries.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="p-8 text-center text-slate-400 font-medium">
                    <i class="fas fa-file-pen text-3xl mb-2 text-slate-300 block"></i>
                    No exam papers scheduled for Class ${escapeHtml(selectedClass)} in ${escapeHtml(currentExamTitle)} yet.<br>
                    <button type="button" class="mt-3 px-3.5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition shadow-2xs inline-flex items-center gap-1.5" onclick="document.getElementById('btn-add-exam-entry').click()">
                        <i class="fas fa-plus"></i> Schedule First Paper
                    </button>
                </td>
            </tr>`;
        return;
    }

    // Sort entries chronologically by date and time
    examTimetableEntries.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));

    tbody.innerHTML = examTimetableEntries.map((e, idx) => `
        <tr class="hover:bg-slate-50/80 transition">
            <td class="py-3 px-3 font-bold text-slate-400 text-center">${idx + 1}</td>
            <td class="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                <i class="fas fa-calendar-day text-indigo-600 mr-1.5 text-xs"></i>${formatDisplayDate(e.date)}
            </td>
            <td class="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                ${e.startTime || '--'} - ${e.endTime || '--'}
            </td>
            <td class="py-3 px-3 font-black text-slate-900">
                <span class="px-2 py-0.5 rounded-md text-xs font-black bg-indigo-50 text-indigo-900 border border-indigo-200">
                    ${escapeHtml(e.subject || '')}
                </span>
            </td>
            <td class="py-3 px-3 max-w-[240px] truncate font-medium text-slate-600" title="${escapeHtml(e.portions || '')}">
                ${escapeHtml(e.portions || 'Full Syllabus')}
            </td>
            <td class="py-3 px-3 font-medium text-slate-600 text-xs">
                ${e.invigilator ? `<span class="font-bold text-slate-700"><i class="fas fa-user-tie text-[10px] text-slate-400 mr-1"></i>${escapeHtml(e.invigilator)}</span>` : ''}
                ${e.hall ? `<span class="text-slate-400 text-[11px] block mt-0.5"><i class="fas fa-door-open text-[9px] mr-1"></i>${escapeHtml(e.hall)}</span>` : ''}
            </td>
            <td class="py-3 px-3 text-right">
                <button type="button" class="btn-del-exam-entry p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer" data-id="${e.id}" title="Remove Paper">
                    <i class="fas fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join('');
};

const openExamEntryModal = async () => {
    const selectedClass = document.getElementById('exam-tt-class-select')?.value || '1';
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;

    await ensureClassSubjectsLoaded(year, selectedClass);

    const classDisplay = document.getElementById('modal-exam-class-display');
    const classInput = document.getElementById('modal-exam-class-select');
    if (classDisplay) classDisplay.textContent = `Class ${selectedClass}`;
    if (classInput) classInput.value = selectedClass;

    const subjSelect = document.getElementById('modal-exam-subject-select');
    const customInput = document.getElementById('modal-exam-subject-custom');
    if (customInput) {
        customInput.value = '';
        customInput.classList.add('hidden');
    }

    if (subjSelect) {
        let optsHtml = classSubjectsList.map(s => `
            <option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${escapeHtml(s.code)})</option>
        `).join('');

        optsHtml += `<option value="__CUSTOM__">+ Other / Custom Subject...</option>`;
        subjSelect.innerHTML = optsHtml;

        subjSelect.onchange = () => {
            if (subjSelect.value === '__CUSTOM__') {
                customInput?.classList.remove('hidden');
                customInput?.focus();
            } else {
                customInput?.classList.add('hidden');
            }
        };
    }

    const dateInput = document.getElementById('modal-exam-date');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    const portionsInput = document.getElementById('modal-exam-portions');
    if (portionsInput) portionsInput.value = '';
    const hallInput = document.getElementById('modal-exam-hall');
    if (hallInput) hallInput.value = '';
    const invigInput = document.getElementById('modal-exam-invigilator');
    if (invigInput) invigInput.value = '';

    openModal('modal-exam-entry');
};

const saveExamEntry = async () => {
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const classLabel = document.getElementById('exam-tt-class-select')?.value || '1';
    const title = document.getElementById('exam-tt-title-select')?.value || 'Examination';
    const date = document.getElementById('modal-exam-date')?.value;
    const subjSelect = document.getElementById('modal-exam-subject-select');
    const customInput = document.getElementById('modal-exam-subject-custom');

    let subject = subjSelect?.value || '';
    if (subject === '__CUSTOM__') {
        subject = customInput?.value.trim() || '';
    }

    const startTime = document.getElementById('modal-exam-start-time')?.value || '08:00';
    const endTime = document.getElementById('modal-exam-end-time')?.value || '10:00';
    const portions = document.getElementById('modal-exam-portions')?.value.trim();
    const hall = document.getElementById('modal-exam-hall')?.value.trim();
    const invigilator = document.getElementById('modal-exam-invigilator')?.value.trim();

    if (!date) return alert('Please choose an exam date.');
    if (!subject) return alert('Please select or enter a subject name.');

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
        const docId = getExamTimetableDocId(year, classLabel, title);
        await setDoc(doc(db, `${BASE_PATH}/examTimetables`, docId), {
            classLabel,
            academicYear: year,
            examTitle: title,
            entries: examTimetableEntries,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-exam-entry');
        showToast('Exam paper scheduled successfully!', 'success');
        loadExamTimetable();
    } catch (err) {
        alert('Failed to save exam paper: ' + err.message);
    }
};

const deleteExamEntry = async (id) => {
    if (!confirm('Remove this scheduled examination paper?')) return;
    const year = document.getElementById('exam-tt-academic-year')?.value || currentAcademicYear;
    const classLabel = document.getElementById('exam-tt-class-select')?.value || '1';
    const title = document.getElementById('exam-tt-title-select')?.value || 'Examination';

    examTimetableEntries = examTimetableEntries.filter(e => e.id !== id);

    try {
        const docId = getExamTimetableDocId(year, classLabel, title);
        await setDoc(doc(db, `${BASE_PATH}/examTimetables`, docId), {
            classLabel,
            academicYear: year,
            examTitle: title,
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

    // 2. Class Subjects Listeners
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
    document.getElementById('btn-tt-confirm-apply-today')?.addEventListener('click', () => applyTimetableWeekendSync('today'));
    document.getElementById('btn-tt-confirm-apply-all')?.addEventListener('click', () => applyTimetableWeekendSync('all'));

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

    // 5. Exam Schedule Listeners
    document.getElementById('exam-tt-academic-year')?.addEventListener('change', async () => {
        const y = document.getElementById('exam-tt-academic-year')?.value;
        const c = document.getElementById('exam-tt-class-select')?.value;
        await loadAvailableExams(y, c);
        await loadExamTimetable();
    });
    document.getElementById('exam-tt-class-select')?.addEventListener('change', async () => {
        const y = document.getElementById('exam-tt-academic-year')?.value;
        const c = document.getElementById('exam-tt-class-select')?.value;
        await loadAvailableExams(y, c);
        await loadExamTimetable();
    });
    document.getElementById('exam-tt-title-select')?.addEventListener('change', loadExamTimetable);
    document.getElementById('btn-add-exam-entry')?.addEventListener('click', openExamEntryModal);
    document.getElementById('btn-save-exam-entry')?.addEventListener('click', saveExamEntry);
    document.getElementById('btn-print-exam-tt')?.addEventListener('click', () => window.print());
    document.getElementById('btn-add-exam-name')?.addEventListener('click', openAddExamNameModal);
    document.getElementById('btn-save-new-exam-title')?.addEventListener('click', saveNewExamName);

    document.getElementById('exam-papers-tbody')?.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.btn-del-exam-entry');
        if (delBtn) {
            deleteExamEntry(delBtn.dataset.id);
        }
    });

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
