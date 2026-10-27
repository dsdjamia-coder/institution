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
        loadExamTimetable();
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

    const filterSel = document.getElementById('exam-tt-class-filter');
    if (filterSel) {
        const prev = filterSel.value;
        filterSel.innerHTML = `<option value="ALL">All Classes</option>` + allowed.map(c => `<option value="${escapeHtml(c)}">Class ${escapeHtml(c)}</option>`).join('');
        if (prev) filterSel.value = prev;
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
const getClassSubjectsDocId = (year, classLabel) => {
    const cleanY = String(year || currentAcademicYear).trim().replace(/[^\w-]/g, '_');
    const cleanC = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    return `${cleanY}__${cleanC}`;
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
        const docSnap = await getDoc(doc(db, `${BASE_PATH}/classSubjects`, docId));
        if (docSnap.exists() && Array.isArray(docSnap.data().subjects)) {
            classSubjectsList = docSnap.data().subjects;
        } else {
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
                    <button type="button" class="mt-3 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs" onclick="document.getElementById('btn-add-subject').click()">
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
    const code = document.getElementById('modal-subject-code')?.value.trim().toUpperCase();
    const name = document.getElementById('modal-subject-name')?.value.trim();
    const teacher = document.getElementById('modal-subject-teacher')?.value.trim() || 'Assigned Teacher';
    const weeklyPeriods = Number(document.getElementById('modal-subject-weekly-periods')?.value || 5);

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
    selectedTtClass = document.getElementById('tt-class-select')?.value || selectedSubjectsClass || '1';
    const heading = document.getElementById('tt-view-heading');

    if (heading) heading.textContent = `Class ${selectedTtClass} Weekly Routine Timetable (${year})`;

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
                    <i class="fas fa-calendar-day text-indigo-600 mr-1.5"></i>${day}
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
                            <div class="p-2 rounded-xl bg-indigo-50/70 border border-indigo-200/80 shadow-2xs">
                                <div class="font-extrabold text-xs text-slate-900 leading-tight">${escapeHtml(slot.subjectName)}</div>
                                <div class="text-[11px] text-indigo-800 font-semibold mt-1 truncate">
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
    selectedYpClass = document.getElementById('yp-class-select')?.value || selectedSubjectsClass || '1';
    const heading = document.getElementById('yp-view-heading');

    if (heading) heading.textContent = `Class ${selectedYpClass} Academic Year Syllabus Plan (${year})`;

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
            <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded font-black text-xs bg-indigo-50 text-indigo-800">Class ${e.classLabel}</span></td>
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
    document.getElementById('tt-settings-periods-count')?.addEventListener('change', (e) => {
        renderTimetableTimingsRows(Number(e.target.value || 5));
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
    document.getElementById('exam-tt-academic-year')?.addEventListener('change', loadExamTimetable);
    document.getElementById('exam-tt-title-select')?.addEventListener('change', loadExamTimetable);
    document.getElementById('exam-tt-class-filter')?.addEventListener('change', loadExamTimetable);
    document.getElementById('btn-add-exam-entry')?.addEventListener('click', () => {
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
