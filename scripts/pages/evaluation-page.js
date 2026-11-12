import { signOut, onAuthStateChanged} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, onSnapshot, collection, getDocs, setDoc, deleteDoc, query, where, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, auth } from '../../config/firebase-config.js';
import { BASE_PATH, applyInstitutionBranding, escapeHtml, formatDateDisplay, populateAcademicYearSelect, resolveAcademicYearClasses } from '../shared/app-common.js';
import { showToast } from '../shared/toaster.js';

// --- State Variables ---
let isSuperAdmin = false;
let currentStaffName = 'Staff Member';
let currentStaffRole = 'Class Teacher';
let currentUserKey = '';
let currentStaffDoc = null;
let teacherAssignedClasses = [];

let institutionConfig = {};
let currentAcademicYear = '2025-2026';
let availableAcademicYears = ['2025-2026', '2026-2027'];
let academicYearRecords = [];
let configuredClasses = [];
let allStudents = [];
let allClasses = [];

// Selected Scope
let selectedClass = '';
let selectedYear = '2025-2026';
let selectedDate = new Date().toISOString().split('T')[0];
let selectedSubject = '';

// Timetable & Subjects State
const ALL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let classCurriculumSubjects = []; // [ { id, name, code, teacher } ]
let classCustomSubjects = []; // [ 'Subject 1', 'Subject 2' ]
let todaysScheduledPeriods = []; // [ { periodNum, label, subjectName, startTime, endTime } ]
let currentClassTimetableDoc = null;

// Daily Evaluation Data
let currentDailyEvalDocId = '';
let currentDailyRecords = {}; // studentId -> { evaluations: [...] }
let unsubscribeDailyEval = null;

// Impositions Data
let currentImpositionsDocId = '';
let currentImpositionsList = []; // [ { id, studentId, studentName, admNo, subject, taskTitle, assignedDate, dueDate, cleared, clearedDate, clearedBy, teacherRemark } ]
let unsubscribeImpositions = null;

// Monthly Evaluation Matrix Data (For Participation Fairness & Analytics)
let monthlyEvalsCache = {}; // studentId -> { totalAsked, answeredWell, partial, missed, readingChecks, writingCompleted, impositionsCount }
let selectedAnalyticsMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
let selectedAnalyticsSubject = 'all';

// Filter & Search State
let currentLiveFilter = 'least-turns'; // 'least-turns' | 'not-today' | 'evaluated-today' | 'all'
let currentLiveSearch = '';
let currentImpositionFilter = 'pending'; // 'pending' | 'due-today' | 'cleared' | 'all'

// Class Evaluation Settings (Default OFF for Activity Points Integration)
let classEvaluationSettings = {
    autoAwardActivityPoints: false,
    activityPointsBonus: 5
};

// Confirmation Dialog State
let pendingConfirmCallback = null;

// Helper: Normalize Date String
const getTodayDateString = () => new Date().toISOString().split('T')[0];

const normalizeClassLabel = (str = '') => String(str || '').replace(/^class\s*/i, '').trim().toLowerCase();
const isClassInDutyScope = (clsName = '', dutyList = []) => {
    if (isSuperAdmin) return true;
    if (!Array.isArray(dutyList) || dutyList.length === 0) return false;
    const targetNorm = normalizeClassLabel(clsName);
    return dutyList.some((d) => normalizeClassLabel(d) === targetNorm || String(d).trim().toLowerCase() === String(clsName).trim().toLowerCase());
};

const getStudentAdm = (s) => String(s?.adm || s?.profile?.admNo || s?.admNo || s?.admissionNo || s?.profile?.adm || s?.profile?.admissionNo || '-').trim();

const getStudentClass = (s, year = selectedYear) => {
    if (s?.academicYears && typeof s.academicYears === 'object' && s.academicYears[year]?.class) {
        return String(s.academicYears[year].class).trim();
    }
    return String(s?.class || '').trim();
};

const getClassStudents = (targetClass = selectedClass, targetYear = selectedYear) => {
    if (!targetClass) return [];
    return allStudents.filter((s) => {
        if (s.status === 'alumni' || s.isAlumni) return false;
        const stuClass = getStudentClass(s, targetYear);
        return isClassInDutyScope(stuClass, [targetClass]);
    });
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
        if (staffDoc.role) {
            const match = String(staffDoc.role).match(/class\s*([0-9a-zA-Z\s-]+)/i);
            if (match && match[1]) addIfClass(match[1].trim());
        }
    }
    if (staffAccess) {
        addIfClass(staffAccess.dutyClasses);
        addIfClass(staffAccess.assignedClass);
        addIfClass(staffAccess.assignedClasses);
        addIfClass(staffAccess.class);
        addIfClass(staffAccess.classes);
    }
    return Array.from(classesSet).map((c) => c.trim()).filter(Boolean);
};

// --- Doc ID Helpers Matching Academic Plan & Timetable Standard ---
const getClassSubjectsDocId = (year, classLabel) => {
    const cleanY = String(year || currentAcademicYear).trim().replace(/[^\w-]/g, '_');
    const cleanC = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    return `${cleanY}__${cleanC}`;
};

const getTimetableDocId = (year, classLabel) => {
    const cleanY = String(year || currentAcademicYear).trim().replace(/[^\w-]/g, '_');
    const cleanC = String(classLabel || '').trim().replace(/[^\w-]/g, '_');
    return `${cleanY}__${cleanC}`;
};

// --- Sidebar Collapse & Expansion (Identical to Activity & Rewards) ---
const isDesktop = () => window.innerWidth >= 1024;

const setSidebarCollapsed = (collapsed) => {
    const appEl = document.getElementById('evaluation-app');
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
        localStorage.setItem('evaluation_sidebar_collapsed', collapsed ? 'true' : 'false');
    } catch (_) {}
};

const toggleSidebarState = () => {
    const appEl = document.getElementById('evaluation-app');
    if (!appEl) return;
    setSidebarCollapsed(!appEl.classList.contains('sidebar-collapsed'));
};

const initSidebarState = () => {
    try {
        const saved = localStorage.getItem('evaluation_sidebar_collapsed');
        if (saved !== null) {
            setSidebarCollapsed(saved === 'true');
        } else {
            setSidebarCollapsed(false);
        }
    } catch (_) {
        setSidebarCollapsed(false);
    }
};

// Live Clock Ticker
const updateLiveClock = () => {
    const clockEl = document.getElementById('live-clock-display');
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// Confirmation Dialog helper
const showConfirmDialog = ({ title = 'Confirm Action', message = 'Are you sure you want to proceed?', confirmText = 'Yes, Confirm', confirmBtnClass = 'bg-rose-600 hover:bg-rose-700', onConfirm = null }) => {
    const titleEl = document.getElementById('modal-confirm-title');
    const msgEl = document.getElementById('modal-confirm-msg');
    const okBtn = document.getElementById('btn-confirm-action-ok');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (okBtn) {
        okBtn.textContent = confirmText;
        okBtn.className = `px-5 py-2 text-white rounded-xl font-black text-xs transition shadow-sm cursor-pointer ${confirmBtnClass}`;
    }

    pendingConfirmCallback = onConfirm;
    openModal('modal-confirm-action');
};

const openModal = (id) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

const closeModal = (id) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

// --- Tab Switching ---
const switchTab = (tabId) => {
    document.querySelectorAll('.tab-pane').forEach((el) => el.classList.add('hidden'));
    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.drawer-link[data-tab]').forEach((btn) => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    document.querySelectorAll('.bottom-nav-link[data-tab]').forEach((btn) => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const moreSheet = document.getElementById('evaluation-more-sheet');
    if (moreSheet) {
        moreSheet.classList.add('hidden');
        moreSheet.classList.remove('flex');
    }

    if (!isDesktop()) {
        setSidebarCollapsed(true);
    }

    if (tabId === 'tab-analytics') {
        renderMonthlyRegister();
    } else if (tabId === 'tab-impositions') {
        renderImpositionsList();
    } else if (tabId === 'tab-settings') {
        renderSettingsView();
    }
};

// --- Load Metadata & Scopes ---
const loadAcademicYears = async () => {
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'academicYears'), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            const rawYears = Array.isArray(data.years) ? data.years : [];
            const nonArchived = rawYears.filter(y => {
                if (typeof y === 'object' && y !== null) return String(y.status || '').toLowerCase() !== 'archived';
                return Boolean(y);
            });
            if (nonArchived.length > 0) {
                academicYearRecords = nonArchived;
                availableAcademicYears = nonArchived.map((y) => typeof y === 'string' ? y : y.label || y.year || y.name || y.id).filter(Boolean);
            }
            const rawActive = data.currentYear || data.activeYear || availableAcademicYears[0] || '2025-2026';
            currentAcademicYear = typeof rawActive === 'object' ? (rawActive.label || rawActive.year || '') : String(rawActive || '');
            if (!selectedYear || !availableAcademicYears.includes(selectedYear) || selectedYear === currentAcademicYear) {
                selectedYear = currentAcademicYear;
            }
        }

        const yearSelect = document.getElementById('eval-year-select');
        if (yearSelect && availableAcademicYears.length) {
            populateAcademicYearSelect(yearSelect, availableAcademicYears, currentAcademicYear, { selectedValue: selectedYear });
        }

        const yearBadge = document.getElementById('header-active-year');
        if (yearBadge) {
            yearBadge.textContent = selectedYear || currentAcademicYear || 'Session Active';
        }

        fetchStudentsAndClasses();
    }, (err) => {
        console.warn('Could not listen to academic years config:', err);
    });
};

// --- Class Subjects & Timetable Engine ---
const getAllClassSubjectNames = () => {
    const set = new Set();
    const list = [];
    const addSubj = (name) => {
        const clean = String(name || '').trim();
        if (clean && !set.has(clean.toLowerCase())) {
            set.add(clean.toLowerCase());
            list.push(clean);
        }
    };
    todaysScheduledPeriods.forEach((p) => addSubj(p.subjectName));
    classCurriculumSubjects.forEach((s) => addSubj(s.name));
    classCustomSubjects.forEach((cs) => addSubj(cs));
    return list;
};

const populateAnalyticsSubjectFilter = () => {
    const filterSelect = document.getElementById('analytics-subject-filter');
    if (!filterSelect) return;

    const subjects = getAllClassSubjectNames();
    let html = `<option value="all" ${selectedAnalyticsSubject === 'all' ? 'selected' : ''}>All Subjects (Combined)</option>`;

    if (subjects.length > 0) {
        subjects.forEach((s) => {
            const isSelected = selectedAnalyticsSubject.toLowerCase() === s.toLowerCase();
            html += `<option value="${escapeHtml(s)}" ${isSelected ? 'selected' : ''}>${escapeHtml(s)}</option>`;
        });
    }

    filterSelect.innerHTML = html;
};

const populateImpositionSubjectSelect = (preselectedSubject = '') => {
    const impSubSelect = document.getElementById('imp-subject');
    if (!impSubSelect) return;

    const subjects = getAllClassSubjectNames();
    const target = preselectedSubject || selectedSubject || subjects[0] || 'General';

    if (subjects.length === 0) {
        impSubSelect.innerHTML = `<option value="General" selected>General</option>`;
        return;
    }

    impSubSelect.innerHTML = subjects.map((s) => `
        <option value="${escapeHtml(s)}" ${s.toLowerCase() === target.toLowerCase() ? 'selected' : ''}>
            ${escapeHtml(s)}
        </option>
    `).join('');
};

const loadClassSubjectsAndTimetable = async () => {
    if (!selectedClass || !selectedYear) return;

    const cleanY = String(selectedYear || currentAcademicYear).trim().replace(/[^\w-]/g, '_');
    const rawC = String(selectedClass || '').trim();
    const cleanC = rawC.replace(/[^\w-]/g, '_');
    const normC = normalizeClassLabel(rawC).replace(/[^\w-]/g, '_');
    const prefixedC = normC.startsWith('class_') ? normC : `Class_${normC}`;

    const candidateClassKeys = Array.from(new Set([cleanC, normC, prefixedC])).filter(Boolean);

    try {
        const subjsSet = new Set();
        const subjsList = [];

        const addSubjectName = (name, code = '', id = '') => {
            const sName = String(name || '').trim();
            if (sName && !subjsSet.has(sName.toLowerCase())) {
                subjsSet.add(sName.toLowerCase());
                subjsList.push({ id: id || sName, name: sName, code: code || '' });
            }
        };

        // Query classSubjects, timetables, resultSchemas across all candidate keys
        const fetchPromises = [];

        candidateClassKeys.forEach((k) => {
            fetchPromises.push(getDoc(doc(db, `${BASE_PATH}/classSubjects`, `${cleanY}__${k}`)).catch(() => null));
            fetchPromises.push(getDoc(doc(db, `${BASE_PATH}/timetables`, `${cleanY}__${k}`)).catch(() => null));
            fetchPromises.push(getDoc(doc(db, `${BASE_PATH}/resultSchemas`, `${cleanY}_${k}`)).catch(() => null));
            fetchPromises.push(getDoc(doc(db, `${BASE_PATH}/resultSchemas`, `${cleanY}__${k}`)).catch(() => null));
        });

        const settingsPromise = getDoc(doc(db, `${BASE_PATH}/settings`, `evaluationConfig_${cleanC}`)).catch(() => null);

        const [results, classSettingsSnap] = await Promise.all([
            Promise.all(fetchPromises),
            settingsPromise
        ]);

        let resolvedTimetableDoc = null;

        results.forEach((snap) => {
            if (!snap || !snap.exists()) return;
            const data = snap.data();

            // 1. From classSubjects / resultSchemas subjects array
            if (Array.isArray(data.subjects)) {
                data.subjects.forEach((s) => {
                    if (typeof s === 'string') {
                        addSubjectName(s);
                    } else if (s && (s.name || s.title)) {
                        addSubjectName(s.name || s.title, s.code, s.id);
                    }
                });
            }

            // 2. From resultSchemas subjectRows
            if (Array.isArray(data.subjectRows)) {
                data.subjectRows.forEach((row) => {
                    if (row && row.name) {
                        addSubjectName(row.name, row.code, row.id);
                    }
                });
            }

            // 3. From timetables matrix
            if (data.matrix && typeof data.matrix === 'object') {
                if (!resolvedTimetableDoc) {
                    resolvedTimetableDoc = data;
                }
                Object.values(data.matrix).forEach((cell) => {
                    if (cell && cell.subjectName && !cell.isBreak && !cell.isNoExam) {
                        addSubjectName(cell.subjectName, cell.subjectCode, cell.subjectId);
                    }
                });
            }
        });

        currentClassTimetableDoc = resolvedTimetableDoc;
        classCurriculumSubjects = subjsList;

        // Class-Scoped Settings
        if (classSettingsSnap && classSettingsSnap.exists()) {
            const csData = classSettingsSnap.data();
            classCustomSubjects = Array.isArray(csData.customSubjects) ? csData.customSubjects : [];
            classEvaluationSettings.autoAwardActivityPoints = csData.autoAwardActivityPoints === true;
            classEvaluationSettings.activityPointsBonus = typeof csData.activityPointsBonus === 'number' ? csData.activityPointsBonus : 5;
        } else {
            classCustomSubjects = [];
            classEvaluationSettings.autoAwardActivityPoints = false;
            classEvaluationSettings.activityPointsBonus = 5;
        }

        // Resolve Today's Scheduled Periods according to selectedDate
        resolveTodaysTimetablePeriods();

        // Populate Subject Dropdowns & Quick Period Pills
        renderSubjectDropdownAndPills();
        renderSettingsView();
        populateImpositionSubjectSelect();
        populateAnalyticsSubjectFilter();
    } catch (err) {
        console.warn('Error loading class subjects and timetable:', err);
    }
};

const resolveTodaysTimetablePeriods = () => {
    todaysScheduledPeriods = [];
    if (!selectedDate || !currentClassTimetableDoc) return;

    const parts = selectedDate.split('-');
    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const weekdayName = ALL_WEEKDAYS[dateObj.getDay()];

    const matrix = currentClassTimetableDoc.matrix || {};
    const slots = Array.isArray(currentClassTimetableDoc.slots) ? currentClassTimetableDoc.slots : [];

    // Find all period slots for this day
    const periods = [];
    slots.forEach((slot, index) => {
        if (slot.isBreak) return;
        const slotKey = slot.slotId || `period_${index + 1}`;
        const slotNum = slot.slotNum || (index + 1);

        // Timetable matrix key formats: "Day_slotKey" or "Day_periodNum"
        const cellData = matrix[`${weekdayName}_${slotKey}`] || matrix[`${weekdayName}_${slotNum}`];
        if (cellData && cellData.subjectName && !cellData.isBreak && !cellData.isNoExam) {
            periods.push({
                slotNum,
                slotLabel: slot.label || `Period ${slotNum}`,
                subjectName: cellData.subjectName,
                startTime: slot.startTime || '',
                endTime: slot.endTime || '',
                teacher: cellData.teacher || ''
            });
        }
    });

    todaysScheduledPeriods = periods;
};

const renderSubjectDropdownAndPills = () => {
    const subSelect = document.getElementById('eval-subject-select');
    const pillsContainer = document.getElementById('timetable-period-pills');
    const dayLabelEl = document.getElementById('tt-day-label');

    const parts = selectedDate.split('-');
    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const weekdayName = ALL_WEEKDAYS[dateObj.getDay()];

    if (dayLabelEl) {
        dayLabelEl.textContent = `${weekdayName}'s Timetable:`;
    }

    // Render Timetable Period Pills
    if (pillsContainer) {
        if (todaysScheduledPeriods.length > 0) {
            pillsContainer.innerHTML = todaysScheduledPeriods.map((p) => {
                const isSelected = selectedSubject && selectedSubject.toLowerCase() === p.subjectName.toLowerCase();
                return `
                    <button type="button" class="btn-period-pill inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-extrabold text-xs transition shadow-2xs cursor-pointer ${isSelected ? 'bg-rose-600 text-white ring-2 ring-rose-600/30' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'}" data-subject="${escapeHtml(p.subjectName)}" title="${escapeHtml(p.slotLabel)}: ${escapeHtml(p.subjectName)} (${escapeHtml(p.startTime)} - ${escapeHtml(p.endTime)})">
                        <span class="text-[10px] font-mono opacity-80">${escapeHtml(p.slotLabel)}:</span>
                        <span>${escapeHtml(p.subjectName)}</span>
                    </button>
                `;
            }).join('');
        } else {
            pillsContainer.innerHTML = `
                <span class="text-[11px] font-semibold text-slate-400 italic">No scheduled timetable periods for ${escapeHtml(weekdayName)}. Select subject from dropdown below.</span>
            `;
        }
    }

    // Default subject selection if current subject is empty or not in class subjects
    const scheduledNames = todaysScheduledPeriods.map((p) => p.subjectName);
    const curriculumNames = classCurriculumSubjects.map((s) => s.name);
    const allAvailable = getAllClassSubjectNames();

    if (!selectedSubject || !allAvailable.some((s) => s.toLowerCase() === selectedSubject.toLowerCase())) {
        selectedSubject = scheduledNames[0] || curriculumNames[0] || classCustomSubjects[0] || (allAvailable[0] || 'General');
    }

    // Populate Subject Dropdown
    if (subSelect) {
        let optHtml = '';

        if (todaysScheduledPeriods.length > 0) {
            optHtml += `<optgroup label="Today's Timetable (${weekdayName})">`;
            todaysScheduledPeriods.forEach((p) => {
                optHtml += `<option value="${escapeHtml(p.subjectName)}" ${p.subjectName.toLowerCase() === selectedSubject.toLowerCase() ? 'selected' : ''}>${escapeHtml(p.slotLabel)}: ${escapeHtml(p.subjectName)}</option>`;
            });
            optHtml += `</optgroup>`;
        }

        if (classCurriculumSubjects.length > 0) {
            optHtml += `<optgroup label="Class Curriculum Subjects">`;
            classCurriculumSubjects.forEach((s) => {
                optHtml += `<option value="${escapeHtml(s.name)}" ${s.name.toLowerCase() === selectedSubject.toLowerCase() ? 'selected' : ''}>${escapeHtml(s.name)}</option>`;
            });
            optHtml += `</optgroup>`;
        }

        if (classCustomSubjects.length > 0) {
            optHtml += `<optgroup label="Custom Subjects (This Class)">`;
            classCustomSubjects.forEach((cs) => {
                optHtml += `<option value="${escapeHtml(cs)}" ${cs.toLowerCase() === selectedSubject.toLowerCase() ? 'selected' : ''}>${escapeHtml(cs)}</option>`;
            });
            optHtml += `</optgroup>`;
        }

        if (!optHtml) {
            optHtml = `<option value="General">General / All</option>`;
        }

        subSelect.innerHTML = optHtml;
    }

    populateAnalyticsSubjectFilter();
    populateImpositionSubjectSelect();
};

const renderSettingsView = () => {
    const classLabelEl = document.getElementById('settings-class-label');
    if (classLabelEl) {
        classLabelEl.textContent = selectedClass ? `Class: ${selectedClass}` : 'Selected Class';
    }

    const currTags = document.getElementById('settings-curriculum-tags');
    if (currTags) {
        if (classCurriculumSubjects.length > 0) {
            currTags.innerHTML = classCurriculumSubjects.map((s) => `
                <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800">
                    <i class="fas fa-book text-slate-400 text-[10px]"></i>
                    <span>${escapeHtml(s.name)}</span>
                </span>
            `).join('');
        } else {
            currTags.innerHTML = `<span class="text-xs text-slate-400 italic">No curriculum subjects found in Academic Plan for this class.</span>`;
        }
    }

    const customTags = document.getElementById('settings-custom-subject-tags');
    if (customTags) {
        if (classCustomSubjects.length > 0) {
            customTags.innerHTML = classCustomSubjects.map((cs) => `
                <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-900">
                    <span>${escapeHtml(cs)}</span>
                    <button type="button" class="btn-remove-custom-subject text-rose-400 hover:text-rose-700 cursor-pointer ml-1" data-subject="${escapeHtml(cs)}">
                        <i class="fas fa-times text-[10px]"></i>
                    </button>
                </span>
            `).join('');
        } else {
            customTags.innerHTML = `<span class="text-xs text-slate-400 italic">No custom evaluation subjects added for this class.</span>`;
        }
    }

    const togglePts = document.getElementById('toggle-award-activity-points');
    if (togglePts) {
        togglePts.checked = classEvaluationSettings.autoAwardActivityPoints === true;
    }
};

// --- Students & Classes Real-time Fetching ---
let unsubscribeStudents = null;
const fetchStudentsAndClasses = async () => {
    if (unsubscribeStudents) unsubscribeStudents();
    unsubscribeStudents = onSnapshot(collection(db, `${BASE_PATH}/students`), async (snap) => {
        const list = [];
        const classesSet = new Set();

        snap.forEach((d) => {
            const s = { id: d.id, ...d.data() };
            list.push(s);
            if (s.class && s.class.toLowerCase() !== 'alumni') classesSet.add(String(s.class).trim());
            if (s.academicYears && typeof s.academicYears === 'object') {
                Object.values(s.academicYears).forEach((yObj) => {
                    if (yObj && yObj.class && String(yObj.class).toLowerCase() !== 'alumni') {
                        classesSet.add(String(yObj.class).trim());
                    }
                });
            }
        });

        // Also check settings/classes for registered class levels
        try {
            const classesSnap = await getDoc(doc(db, `${BASE_PATH}/settings`, 'classes'));
            if (classesSnap.exists()) {
                const data = classesSnap.data();
                configuredClasses = (data.list || data.classes || []).map((c) => String(c.id || c.name || c).trim()).filter(Boolean);
            }
        } catch (e) {
            console.warn('Could not load settings/classes', e);
        }

        allStudents = list;
        allClasses = resolveAcademicYearClasses({
            academicYears: academicYearRecords,
            targetYear: selectedYear || currentAcademicYear,
            configuredClasses,
            students: list
        });

        if (allClasses.length === 0) {
            allClasses = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
        }

        populateClassDropdown();
        if (selectedClass) {
            renderLiveClassroomBoard();
            populateImpositionStudentSelect();
        }
    }, (err) => {
        console.error('Error listening to students:', err);
        showToast('Error loading students roster', 'error');
    });
};

const getAllowedClassesForTeacher = () => {
    if (isSuperAdmin) {
        return allClasses;
    }
    if (teacherAssignedClasses && teacherAssignedClasses.length > 0) {
        const filtered = allClasses.filter((c) => isClassInDutyScope(c, teacherAssignedClasses));
        return filtered.length ? filtered : teacherAssignedClasses;
    }
    return [];
};

const populateClassDropdown = () => {
    const classSelect = document.getElementById('eval-class-select');
    if (!classSelect) return;

    const allowed = getAllowedClassesForTeacher();

    if (allowed.length > 0) {
        classSelect.innerHTML = allowed.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        if (!selectedClass || !allowed.includes(selectedClass)) {
            selectedClass = allowed[0];
        }
        classSelect.value = selectedClass;
        onClassOrDateChanged();
    } else {
        selectedClass = '';
        classSelect.innerHTML = '<option value="">No classes assigned</option>';
        renderLiveClassroomBoard();
    }
};

const populateImpositionStudentSelect = (preselectedStudentId = '') => {
    const impSelect = document.getElementById('imp-student-select');
    if (!impSelect) return;

    const classStudents = getClassStudents(selectedClass, selectedYear)
        .sort((a, b) => getStudentAdm(a).localeCompare(getStudentAdm(b), undefined, { numeric: true }));

    if (classStudents.length === 0) {
        impSelect.innerHTML = '<option value="">No students in class</option>';
        return;
    }

    impSelect.innerHTML = classStudents.map((s) => {
        const adm = getStudentAdm(s);
        return `
            <option value="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}" data-adm="${escapeHtml(adm)}" ${s.id === preselectedStudentId ? 'selected' : ''}>
                ${escapeHtml(s.name)} (Adm: ${escapeHtml(adm)})
            </option>
        `;
    }).join('');
};

const onClassOrDateChanged = async () => {
    await loadClassSubjectsAndTimetable();
    setupDailyEvaluationListener();
    setupImpositionsListener();
    fetchMonthlyEvaluations();
    populateImpositionStudentSelect();
};

// --- Firestore Listeners ---

// 1. Daily Evaluation Listener
const setupDailyEvaluationListener = () => {
    if (unsubscribeDailyEval) {
        unsubscribeDailyEval();
        unsubscribeDailyEval = null;
    }

    if (!selectedClass || !selectedDate || !selectedYear) return;

    currentDailyEvalDocId = `${selectedYear}__${selectedClass}__${selectedDate}`;
    const docRef = doc(db, BASE_PATH, 'evaluations', currentDailyEvalDocId);

    unsubscribeDailyEval = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            currentDailyRecords = data.records || {};
        } else {
            currentDailyRecords = {};
        }
        renderLiveClassroomBoard();
        updateQuickStatsBanner();
    }, (err) => {
        console.warn('Evaluation snapshot warning:', err);
    });
};

// 2. Impositions Listener
const setupImpositionsListener = () => {
    if (unsubscribeImpositions) {
        unsubscribeImpositions();
        unsubscribeImpositions = null;
    }

    if (!selectedClass || !selectedYear) return;

    currentImpositionsDocId = `${selectedYear}__${selectedClass}`;
    const docRef = doc(db, BASE_PATH, 'impositions', currentImpositionsDocId);

    unsubscribeImpositions = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            currentImpositionsList = Array.isArray(data.items) ? data.items : [];
        } else {
            currentImpositionsList = [];
        }
        renderImpositionsList();
        updateQuickStatsBanner();
    }, (err) => {
        console.warn('Impositions snapshot warning:', err);
    });
};

// 3. Monthly Evaluations Fetching (Aggregates for Fairness Queue & Register)
const fetchMonthlyEvaluations = async () => {
    if (!selectedClass || !selectedYear) return;

    const monthPrefix = selectedDate ? selectedDate.slice(0, 7) : selectedAnalyticsMonth;
    selectedAnalyticsMonth = monthPrefix;

    try {
        const colRef = collection(db, BASE_PATH, 'evaluations');
        const q = query(
            colRef,
            where('academicYear', '==', selectedYear)
        );

        const snap = await getDocs(q);
        const map = {};

        snap.forEach((d) => {
            const data = d.data();
            const docClass = data.class || '';
            if (!isClassInDutyScope(docClass, [selectedClass])) return;

            const dateStr = data.date || '';
            if (dateStr.startsWith(monthPrefix)) {
                const records = data.records || {};
                Object.keys(records).forEach((sId) => {
                    if (!map[sId]) {
                        map[sId] = {
                            totalAsked: 0,
                            answeredWell: 0,
                            partial: 0,
                            missed: 0,
                            readingChecks: 0,
                            writingCompleted: 0,
                            all: { totalAsked: 0, answeredWell: 0, partial: 0, missed: 0, readingChecks: 0, writingCompleted: 0 },
                            bySubject: {}
                        };
                    }
                    const evals = records[sId].evaluations || [];
                    evals.forEach((ev) => {
                        const subj = String(ev.subject || 'General').trim();
                        const subjLower = subj.toLowerCase();
                        if (!map[sId].bySubject[subjLower]) {
                            map[sId].bySubject[subjLower] = {
                                totalAsked: 0,
                                answeredWell: 0,
                                partial: 0,
                                missed: 0,
                                readingChecks: 0,
                                writingCompleted: 0
                            };
                        }

                        if (ev.activityType === 'reading' || ev.readingRating) {
                            map[sId].readingChecks++;
                            map[sId].all.readingChecks++;
                            map[sId].bySubject[subjLower].readingChecks++;
                        } else if (ev.activityType === 'writing' || ev.writingStatus) {
                            if (ev.writingStatus === 'completed') {
                                map[sId].writingCompleted++;
                                map[sId].all.writingCompleted++;
                                map[sId].bySubject[subjLower].writingCompleted++;
                            }
                        } else {
                            map[sId].totalAsked++;
                            map[sId].all.totalAsked++;
                            map[sId].bySubject[subjLower].totalAsked++;
                            if (ev.status === 'answered') {
                                map[sId].answeredWell++;
                                map[sId].all.answeredWell++;
                                map[sId].bySubject[subjLower].answeredWell++;
                            } else if (ev.status === 'partial') {
                                map[sId].partial++;
                                map[sId].all.partial++;
                                map[sId].bySubject[subjLower].partial++;
                            } else if (ev.status === 'missed') {
                                map[sId].missed++;
                                map[sId].all.missed++;
                                map[sId].bySubject[subjLower].missed++;
                            }
                        }
                    });
                });
            }
        });

        monthlyEvalsCache = map;
        renderLiveClassroomBoard();
        renderMonthlyRegister();
    } catch (err) {
        console.warn('Error fetching monthly evaluations:', err);
    }
};

const getStudentMonthlyStats = (studentId, subjectFilter = 'all') => {
    const studentData = monthlyEvalsCache[studentId];
    const defaultStats = { totalAsked: 0, answeredWell: 0, partial: 0, missed: 0, readingChecks: 0, writingCompleted: 0 };
    if (!studentData) return defaultStats;

    if (!subjectFilter || subjectFilter === 'all') {
        return studentData.all || studentData;
    }

    const key = String(subjectFilter).trim().toLowerCase();
    return studentData.bySubject?.[key] || defaultStats;
};

// --- Live Classroom Board Rendering ---
const renderLiveClassroomBoard = () => {
    const container = document.getElementById('live-students-container');
    if (!container) return;

    if (!selectedClass) {
        container.innerHTML = `
            <div class="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                <i class="fas fa-layer-group text-3xl mb-2 text-slate-300 block"></i>
                <p class="text-sm font-bold text-slate-600">No classes assigned to your account.</p>
                <p class="text-xs text-slate-400 mt-1">Please contact administrator to configure assigned classes.</p>
            </div>
        `;
        return;
    }

    const classStudents = getClassStudents(selectedClass, selectedYear);

    if (classStudents.length === 0) {
        container.innerHTML = `
            <div class="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                <i class="fas fa-users-slash text-3xl mb-2 text-slate-300 block"></i>
                <p class="text-sm font-bold text-slate-600">No students registered in ${escapeHtml(selectedClass)}.</p>
                <p class="text-xs text-slate-400 mt-1">Add students from the Admin Portal or select another class.</p>
            </div>
        `;
        return;
    }

    // Filter by search
    let list = classStudents;
    if (currentLiveSearch) {
        const q = currentLiveSearch.toLowerCase();
        list = list.filter((s) => (s.name && s.name.toLowerCase().includes(q)) || (getStudentAdm(s).toLowerCase().includes(q)));
    }

    // Sort / Filter according to Participation Fairness
    if (currentLiveFilter === 'least-turns') {
        list.sort((a, b) => {
            const turnsA = monthlyEvalsCache[a.id]?.totalAsked || 0;
            const turnsB = monthlyEvalsCache[b.id]?.totalAsked || 0;
            if (turnsA !== turnsB) return turnsA - turnsB;
            return (a.name || '').localeCompare(b.name || '');
        });
    } else if (currentLiveFilter === 'not-today') {
        list = list.filter((s) => !currentDailyRecords[s.id] || !currentDailyRecords[s.id].evaluations || currentDailyRecords[s.id].evaluations.length === 0);
    } else if (currentLiveFilter === 'evaluated-today') {
        list = list.filter((s) => currentDailyRecords[s.id] && currentDailyRecords[s.id].evaluations && currentDailyRecords[s.id].evaluations.length > 0);
    } else {
        // Roll / Adm No Order
        list.sort((a, b) => getStudentAdm(a).localeCompare(getStudentAdm(b), undefined, { numeric: true }));
    }

    if (list.length === 0) {
        container.innerHTML = `
            <div class="col-span-full p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                <p class="text-xs font-bold">No students match current filter.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map((student) => {
        const rec = currentDailyRecords[student.id];
        const todayEvals = rec?.evaluations || [];
        const isEvaluatedToday = todayEvals.length > 0;
        const monthlyStats = monthlyEvalsCache[student.id] || { totalAsked: 0, answeredWell: 0, partial: 0, missed: 0 };
        const lastEval = todayEvals[todayEvals.length - 1];
        const adm = getStudentAdm(student);

        // Status badge color
        let statusBadge = `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                <i class="fas fa-clock text-[9px]"></i> Not Evaluated Today
            </span>
        `;

        if (isEvaluatedToday) {
            if (lastEval?.status === 'answered') {
                statusBadge = `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <i class="fas fa-check-circle text-emerald-600"></i> Answered Well (${todayEvals.length})
                    </span>
                `;
            } else if (lastEval?.status === 'missed') {
                statusBadge = `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                        <i class="fas fa-times-circle text-rose-600"></i> Missed (${todayEvals.length})
                    </span>
                `;
            } else if (lastEval?.status === 'partial') {
                statusBadge = `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                        <i class="fas fa-circle-half-stroke text-amber-600"></i> Partial (${todayEvals.length})
                    </span>
                `;
            } else {
                statusBadge = `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                        <i class="fas fa-check text-blue-600"></i> Evaluated (${todayEvals.length})
                    </span>
                `;
            }
        }

        // Active pending impositions for this student
        const pendingImps = currentImpositionsList.filter((imp) => imp.studentId === student.id && imp.cleared !== true);
        const hasPendingImp = pendingImps.length > 0;

        return `
            <div class="bg-white rounded-2xl border ${isEvaluatedToday ? (lastEval?.status === 'answered' ? 'border-emerald-300 shadow-emerald-50' : (lastEval?.status === 'missed' ? 'border-rose-300 shadow-rose-50' : 'border-slate-300')) : 'border-slate-200/90'} shadow-2xs p-3.5 flex flex-col justify-between transition hover:shadow-md">
                
                <!-- Student Header Info -->
                <div>
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-2.5 overflow-hidden">
                            <div class="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center font-black text-slate-400 text-sm">
                                ${student.photo ? `<img src="${escapeHtml(student.photo)}" alt="Photo" class="w-full h-full object-cover">` : `<i class="fas fa-user"></i>`}
                            </div>
                            <div class="overflow-hidden">
                                <h4 class="font-black text-xs sm:text-sm text-slate-800 truncate" title="${escapeHtml(student.name || 'Student')}">
                                    ${escapeHtml(student.name || 'Student')} <span class="text-[11px] font-mono font-bold text-slate-500">(Adm: ${escapeHtml(adm)})</span>
                                </h4>
                                <div class="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold mt-0.5">
                                    <span>Adm: ${escapeHtml(adm)}</span>
                                    <span>•</span>
                                    <span class="text-rose-600 font-extrabold" title="Turn fairness count">Turns: ${monthlyStats.totalAsked} this mo</span>
                                </div>
                            </div>
                        </div>

                        <!-- Status Badge -->
                        <div class="shrink-0 text-right">
                            ${statusBadge}
                        </div>
                    </div>

                    <!-- Alerts row if student has pending imposition -->
                    ${hasPendingImp ? `
                        <div class="mt-2.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-[10px] font-bold text-amber-800">
                            <span class="truncate"><i class="fas fa-triangle-exclamation text-amber-500 mr-1"></i> Imposition: ${escapeHtml(pendingImps[0].taskTitle || 'Pending task')}</span>
                            <span class="text-[9px] font-extrabold uppercase bg-amber-200/80 px-1.5 py-0.5 rounded text-amber-900 shrink-0">Due: ${escapeHtml(pendingImps[0].dueDate || 'Tomorrow')}</span>
                        </div>
                    ` : ''}

                    <!-- Today's Evaluation Logs Summary (if any) -->
                    ${todayEvals.length > 0 ? `
                        <div class="mt-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100 text-[10px] space-y-1">
                            ${todayEvals.slice(-2).map((ev) => `
                                <div class="flex items-center justify-between text-slate-600">
                                    <span class="font-bold text-slate-800 truncate">${escapeHtml(ev.subject || selectedSubject)}: ${ev.status === 'answered' ? '🟢 Answered Well' : (ev.status === 'missed' ? '🔴 Not Studied' : (ev.readingRating ? '📖 Reading' : '✍️ Written'))}</span>
                                    <span class="text-[9px] text-slate-400 font-semibold">${new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>

                <!-- One-Tap Action Buttons Bar -->
                <div class="mt-3.5 pt-3 border-t border-slate-100 space-y-2">
                    
                    <!-- Q&A Action Row -->
                    <div class="grid grid-cols-3 gap-1.5">
                        <button type="button" class="btn-eval-action flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition shadow-2xs active:scale-95 cursor-pointer" data-action="answered" data-student-id="${student.id}" title="Answered Correctly">
                            <i class="fas fa-circle-check text-xs"></i>
                            <span>Answered</span>
                        </button>
                        <button type="button" class="btn-eval-action flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-black transition shadow-2xs active:scale-95 cursor-pointer" data-action="partial" data-student-id="${student.id}" title="Partial / Fair Answer">
                            <i class="fas fa-circle-half-stroke text-xs"></i>
                            <span>Partial</span>
                        </button>
                        <button type="button" class="btn-eval-action flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black transition shadow-2xs active:scale-95 cursor-pointer" data-action="missed" data-student-id="${student.id}" title="Failed to Answer / Not Studied">
                            <i class="fas fa-circle-xmark text-xs"></i>
                            <span>Missed</span>
                        </button>
                    </div>

                    <!-- Secondary Activities Row: Reading, Writing, Imposition -->
                    <div class="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold">
                        <button type="button" class="btn-open-reading py-1.5 px-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition cursor-pointer" data-student-id="${student.id}" data-name="${escapeHtml(student.name)}" title="Check Reading Fluency">
                            <i class="fas fa-book-reader mr-0.5"></i> Reading
                        </button>
                        <button type="button" class="btn-open-writing py-1.5 px-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition cursor-pointer" data-student-id="${student.id}" data-name="${escapeHtml(student.name)}" title="Check Notebook / Homework">
                            <i class="fas fa-pencil mr-0.5"></i> Writing
                        </button>
                        <button type="button" class="btn-assign-imp py-1.5 px-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 transition cursor-pointer" data-student-id="${student.id}" data-name="${escapeHtml(student.name)}" data-adm="${escapeHtml(adm)}" title="Assign Imposition / Follow-up">
                            <i class="fas fa-pen-fancy mr-0.5"></i> Imposition
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

// --- Record Daily Evaluation Action ---
const recordEvaluationAction = async (studentId, actionType, extraDetails = {}) => {
    if (!selectedClass || !selectedDate || !selectedYear) return;
    if (!isSuperAdmin && (!teacherAssignedClasses.length || !isClassInDutyScope(selectedClass, teacherAssignedClasses))) {
        showToast('Permission denied: You can only evaluate students in your assigned classes.', 'warning');
        return;
    }

    const student = allStudents.find((s) => s.id === studentId);
    if (!student) return;

    const adm = getStudentAdm(student);

    const evalRecord = {
        id: `eval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        subject: selectedSubject || 'General',
        activityType: extraDetails.activityType || 'oral_qa',
        status: actionType, // 'answered' | 'partial' | 'missed'
        score: actionType === 'answered' ? 5 : (actionType === 'partial' ? 2 : 0),
        teacherName: currentStaffName,
        timestamp: Date.now(),
        ...extraDetails
    };

    const docId = `${selectedYear}__${selectedClass}__${selectedDate}`;
    const docRef = doc(db, BASE_PATH, 'evaluations', docId);

    try {
        const studentRec = currentDailyRecords[studentId] || { studentId, name: student.name, admNo: adm, evaluations: [] };
        studentRec.admNo = adm;
        const updatedEvals = [...(studentRec.evaluations || []), evalRecord];

        const newRecords = {
            ...currentDailyRecords,
            [studentId]: {
                ...studentRec,
                evaluations: updatedEvals
            }
        };

        const evaluatedCount = Object.keys(newRecords).filter((k) => newRecords[k].evaluations && newRecords[k].evaluations.length > 0).length;

        await setDoc(docRef, {
            academicYear: selectedYear,
            class: selectedClass,
            date: selectedDate,
            evaluatedCount,
            records: newRecords,
            updatedAt: Date.now()
        }, { merge: true });

        // Update local cache and count immediately
        currentDailyRecords = newRecords;
        if (!monthlyEvalsCache[studentId]) {
            monthlyEvalsCache[studentId] = { totalAsked: 0, answeredWell: 0, partial: 0, missed: 0, readingChecks: 0, writingCompleted: 0 };
        }
        if (evalRecord.activityType === 'reading') {
            monthlyEvalsCache[studentId].readingChecks++;
        } else if (evalRecord.activityType === 'writing') {
            if (evalRecord.writingStatus === 'completed') monthlyEvalsCache[studentId].writingCompleted++;
        } else {
            monthlyEvalsCache[studentId].totalAsked++;
            if (actionType === 'answered') monthlyEvalsCache[studentId].answeredWell++;
            else if (actionType === 'partial') monthlyEvalsCache[studentId].partial++;
            else if (actionType === 'missed') monthlyEvalsCache[studentId].missed++;
        }

        renderLiveClassroomBoard();
        updateQuickStatsBanner();

        if (actionType === 'answered') {
            showToast(`🟢 Answered Well: ${student.name}`, 'success');
        } else if (actionType === 'missed') {
            showToast(`🔴 Missed / Not Studied: ${student.name}`, 'warning');
        } else {
            showToast(`Recorded for ${student.name}`, 'info');
        }

    } catch (err) {
        console.error('Error saving evaluation:', err);
        showToast('Failed to save evaluation', 'error');
    }
};

// --- Impositions & Pending Tasks Management ---
const assignNewImposition = async ({ studentId, studentName, admNo, subject, taskTitle, dueDate, teacherRemark }) => {
    if (!selectedClass || !selectedYear) return;
    if (!isSuperAdmin && (!teacherAssignedClasses.length || !isClassInDutyScope(selectedClass, teacherAssignedClasses))) {
        showToast('Permission denied: You can only assign impositions for your assigned classes.', 'warning');
        return;
    }

    const student = allStudents.find((s) => s.id === studentId);
    const resolvedAdm = admNo || (student ? getStudentAdm(student) : '');
    const resolvedName = studentName || (student ? student.name : 'Student');

    const newImp = {
        id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        studentId,
        studentName: resolvedName,
        admNo: resolvedAdm,
        subject: subject || selectedSubject || 'General',
        type: 'imposition',
        taskTitle,
        assignedDate: selectedDate || getTodayDateString(),
        dueDate: dueDate || getTodayDateString(),
        cleared: false,
        clearedDate: null,
        clearedBy: null,
        teacherRemark: teacherRemark || '',
        assignedBy: currentStaffName,
        createdAt: Date.now()
    };

    const docId = `${selectedYear}__${selectedClass}`;
    const docRef = doc(db, BASE_PATH, 'impositions', docId);

    try {
        const updatedList = [newImp, ...currentImpositionsList];
        await setDoc(docRef, {
            academicYear: selectedYear,
            class: selectedClass,
            items: updatedList,
            updatedAt: Date.now()
        }, { merge: true });

        currentImpositionsList = updatedList;
        renderImpositionsList();
        renderLiveClassroomBoard();
        updateQuickStatsBanner();

        closeModal('modal-assign-imposition');
        showToast(`Imposition assigned to ${resolvedName}`, 'success');
    } catch (err) {
        console.error('Error saving imposition:', err);
        showToast('Failed to assign imposition', 'error');
    }
};

const markImpositionCleared = async (impositionId) => {
    if (!selectedClass || !selectedYear) return;
    if (!isSuperAdmin && (!teacherAssignedClasses.length || !isClassInDutyScope(selectedClass, teacherAssignedClasses))) {
        showToast('Permission denied: You can only manage impositions for your assigned classes.', 'warning');
        return;
    }

    const target = currentImpositionsList.find((imp) => imp.id === impositionId);
    if (!target) return;

    showConfirmDialog({
        title: 'Verify & Clear Imposition',
        message: `Mark "${target.taskTitle}" for ${target.studentName} as Completed & Cleared?`,
        confirmText: 'Yes, Mark Cleared',
        confirmBtnClass: 'bg-emerald-600 hover:bg-emerald-700',
        onConfirm: async () => {
            const updatedList = currentImpositionsList.map((imp) => {
                if (imp.id === impositionId) {
                    return {
                        ...imp,
                        cleared: true,
                        clearedDate: new Date().toISOString().split('T')[0],
                        clearedBy: currentStaffName
                    };
                }
                return imp;
            });

            const docId = `${selectedYear}__${selectedClass}`;
            const docRef = doc(db, BASE_PATH, 'impositions', docId);

            try {
                await setDoc(docRef, {
                    items: updatedList,
                    updatedAt: Date.now()
                }, { merge: true });

                currentImpositionsList = updatedList;
                renderImpositionsList();
                renderLiveClassroomBoard();
                updateQuickStatsBanner();
                showToast(`Cleared imposition for ${target.studentName}`, 'success');
            } catch (e) {
                console.error('Error clearing imposition:', e);
                showToast('Failed to update imposition', 'error');
            }
        }
    });
};

const deleteImposition = async (impositionId) => {
    if (!isSuperAdmin && (!teacherAssignedClasses.length || !isClassInDutyScope(selectedClass, teacherAssignedClasses))) {
        showToast('Permission denied: You can only delete impositions for your assigned classes.', 'warning');
        return;
    }
    showConfirmDialog({
        title: 'Delete Imposition Record',
        message: 'Are you sure you want to delete this imposition entry?',
        confirmText: 'Yes, Delete',
        confirmBtnClass: 'bg-rose-600 hover:bg-rose-700',
        onConfirm: async () => {
            const updatedList = currentImpositionsList.filter((imp) => imp.id !== impositionId);
            const docId = `${selectedYear}__${selectedClass}`;
            const docRef = doc(db, BASE_PATH, 'impositions', docId);

            try {
                await setDoc(docRef, {
                    items: updatedList,
                    updatedAt: Date.now()
                }, { merge: true });

                currentImpositionsList = updatedList;
                renderImpositionsList();
                renderLiveClassroomBoard();
                updateQuickStatsBanner();
                showToast('Imposition deleted', 'info');
            } catch (e) {
                console.error('Error deleting imposition:', e);
                showToast('Failed to delete imposition', 'error');
            }
        }
    });
};

const renderImpositionsList = () => {
    const tbody = document.getElementById('impositions-table-body');
    if (!tbody) return;

    let list = currentImpositionsList;
    const activePending = list.filter((imp) => imp.cleared !== true);

    const countPendingEl = document.getElementById('count-active-impositions');
    if (countPendingEl) countPendingEl.textContent = activePending.length;

    const drawerBadge = document.getElementById('drawer-pending-badge');
    const bottomBadge = document.getElementById('bottom-pending-badge');
    [drawerBadge, bottomBadge].forEach((badge) => {
        if (!badge) return;
        if (activePending.length > 0) {
            badge.textContent = activePending.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    });

    const todayStr = getTodayDateString();

    if (currentImpositionFilter === 'pending') {
        list = list.filter((imp) => imp.cleared !== true);
    } else if (currentImpositionFilter === 'due-today') {
        list = list.filter((imp) => imp.cleared !== true && (imp.dueDate === todayStr || imp.dueDate <= todayStr));
    } else if (currentImpositionFilter === 'cleared') {
        list = list.filter((imp) => imp.cleared === true);
    }

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-8 text-center text-slate-400">
                    <i class="fas fa-inbox text-2xl mb-1 text-slate-300 block"></i>
                    No impositions found matching the selected filter.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = list.map((imp) => {
        const isOverdue = !imp.cleared && imp.dueDate && imp.dueDate < todayStr;
        const isDueToday = !imp.cleared && imp.dueDate === todayStr;

        let statusBadge = `
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                <i class="fas fa-hourglass-half"></i> Pending
            </span>
        `;

        if (imp.cleared) {
            statusBadge = `
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <i class="fas fa-check-double"></i> Cleared on ${escapeHtml(imp.clearedDate || '')}
                </span>
            `;
        } else if (isOverdue) {
            statusBadge = `
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                    <i class="fas fa-triangle-exclamation"></i> Overdue
                </span>
            `;
        } else if (isDueToday) {
            statusBadge = `
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                    <i class="fas fa-clock"></i> Due Today
                </span>
            `;
        }

        const stu = allStudents.find((s) => s.id === imp.studentId);
        const resolvedAdm = imp.admNo || (stu ? getStudentAdm(stu) : '-');

        return `
            <tr class="hover:bg-slate-50/80 transition">
                <td class="py-3 px-4">
                    <div class="font-extrabold text-slate-800">${escapeHtml(imp.studentName)}</div>
                    <div class="text-[10px] text-slate-400 font-semibold">Adm: ${escapeHtml(resolvedAdm)}</div>
                </td>
                <td class="py-3 px-4">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(imp.subject)}</span>
                </td>
                <td class="py-3 px-4">
                    <div class="font-bold text-slate-800">${escapeHtml(imp.taskTitle)}</div>
                    ${imp.teacherRemark ? `<div class="text-[10px] text-slate-400 italic">Remark: ${escapeHtml(imp.teacherRemark)}</div>` : ''}
                </td>
                <td class="py-3 px-4 text-slate-500 font-semibold">${escapeHtml(imp.assignedDate || '-')}</td>
                <td class="py-3 px-4 font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-700'}">${escapeHtml(imp.dueDate || '-')}</td>
                <td class="py-3 px-4">${statusBadge}</td>
                <td class="py-3 px-4 text-right">
                    <div class="inline-flex items-center gap-1.5">
                        ${!imp.cleared ? `
                            <button type="button" class="btn-clear-imposition px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black transition shadow-2xs cursor-pointer" data-id="${imp.id}" title="Mark Cleared / Verified">
                                <i class="fas fa-check mr-1"></i> Mark Cleared
                            </button>
                        ` : ''}
                        <button type="button" class="btn-delete-imposition p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer" data-id="${imp.id}" title="Delete Record">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};

// --- Monthly Register & Analytics ---
const populateAnalyticsMonths = () => {
    const sel = document.getElementById('analytics-month-select');
    if (!sel) return;

    const options = [];
    const date = new Date();
    for (let i = 0; i < 6; i++) {
        const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
        const val = d.toISOString().slice(0, 7);
        const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
        options.push(`<option value="${val}" ${val === selectedAnalyticsMonth ? 'selected' : ''}>${label}</option>`);
    }

    sel.innerHTML = options.join('');
};

const renderMonthlyRegister = () => {
    const tbody = document.getElementById('analytics-register-tbody');
    if (!tbody) return;

    const classStudents = getClassStudents(selectedClass, selectedYear)
        .sort((a, b) => getStudentAdm(a).localeCompare(getStudentAdm(b), undefined, { numeric: true }));

    if (classStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-slate-400">No students found.</td></tr>`;
        return;
    }

    let totalQ = 0;
    let totalAnsweredWell = 0;
    let totalMissed = 0;
    const attentionStudents = [];

    const rows = classStudents.map((s) => {
        const st = getStudentMonthlyStats(s.id, selectedAnalyticsSubject);
        totalQ += st.totalAsked;
        totalAnsweredWell += st.answeredWell;
        totalMissed += st.missed;

        const rate = st.totalAsked > 0 ? Math.round((st.answeredWell / st.totalAsked) * 100) : 0;
        let imps = currentImpositionsList.filter((imp) => imp.studentId === s.id);
        if (selectedAnalyticsSubject !== 'all') {
            imps = imps.filter((imp) => String(imp.subject || '').trim().toLowerCase() === selectedAnalyticsSubject.toLowerCase());
        }
        const impsCleared = imps.filter((imp) => imp.cleared === true).length;

        // Flag attention if turns < 2 or rate < 50% (after at least 2 questions)
        if (st.totalAsked < 2 || (st.totalAsked >= 2 && rate < 50)) {
            attentionStudents.push({ name: s.name, reason: st.totalAsked < 2 ? 'Only ' + st.totalAsked + ' turns' : rate + '% success' });
        }

        const adm = getStudentAdm(s);

        return `
            <tr class="hover:bg-slate-50/80 transition text-xs">
                <td class="py-2.5 px-3 font-semibold text-slate-500">${escapeHtml(adm)}</td>
                <td class="py-2.5 px-3 font-extrabold text-slate-800">${escapeHtml(s.name)}</td>
                <td class="py-2.5 px-3 text-center font-bold text-slate-800">${st.totalAsked}</td>
                <td class="py-2.5 px-3 text-center font-black text-emerald-700">${st.answeredWell}</td>
                <td class="py-2.5 px-3 text-center font-bold text-amber-700">${st.partial}</td>
                <td class="py-2.5 px-3 text-center font-black text-rose-700">${st.missed}</td>
                <td class="py-2.5 px-3 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${rate >= 75 ? 'bg-emerald-100 text-emerald-800' : (rate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800')}">
                        ${rate}%
                    </span>
                </td>
                <td class="py-2.5 px-3 text-center font-semibold text-slate-700">${st.readingChecks}</td>
                <td class="py-2.5 px-3 text-center font-semibold text-slate-700">${st.writingCompleted}</td>
                <td class="py-2.5 px-3 text-center font-bold text-slate-700">${impsCleared} / ${imps.length}</td>
            </tr>
        `;
    });

    tbody.innerHTML = rows.join('');

    // Update Analytics Highlights
    const totalQEl = document.getElementById('analytics-total-questions');
    if (totalQEl) totalQEl.textContent = totalQ;

    const rateEl = document.getElementById('analytics-success-rate');
    if (rateEl) {
        const overallRate = totalQ > 0 ? Math.round((totalAnsweredWell / totalQ) * 100) : 0;
        rateEl.textContent = `${overallRate}%`;
    }

    const missedEl = document.getElementById('analytics-missed-count');
    if (missedEl) missedEl.textContent = totalMissed;

    const impRatioEl = document.getElementById('analytics-impositions-ratio');
    if (impRatioEl) {
        let filteredImps = currentImpositionsList;
        if (selectedAnalyticsSubject !== 'all') {
            filteredImps = filteredImps.filter((imp) => String(imp.subject || '').trim().toLowerCase() === selectedAnalyticsSubject.toLowerCase());
        }
        const clearedTotal = filteredImps.filter((imp) => imp.cleared === true).length;
        impRatioEl.textContent = `${clearedTotal} / ${filteredImps.length}`;
    }

    // Attention Needed Box
    const attnBox = document.getElementById('analytics-attention-box');
    const chipsCont = document.getElementById('analytics-attention-chips');
    if (attnBox && chipsCont) {
        if (attentionStudents.length > 0) {
            attnBox.classList.remove('hidden');
            chipsCont.innerHTML = attentionStudents.map((item) => `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-amber-300 text-[10px] font-bold text-amber-900 shadow-2xs">
                    <span>${escapeHtml(item.name)}</span>
                    <span class="text-rose-600 font-black">(${escapeHtml(item.reason)})</span>
                </span>
            `).join('');
        } else {
            attnBox.classList.add('hidden');
        }
    }

    const titleEl = document.getElementById('register-table-title');
    if (titleEl) {
        const subjPart = selectedAnalyticsSubject === 'all' ? 'All Subjects' : selectedAnalyticsSubject;
        titleEl.textContent = `Monthly Evaluation Register: ${selectedClass} - ${subjPart} (${selectedAnalyticsMonth})`;
    }
};

// --- Quick Stats Banner Update ---
const updateQuickStatsBanner = () => {
    const classStudents = getClassStudents(selectedClass, selectedYear);

    const totalStudentsEl = document.getElementById('stat-total-students');
    if (totalStudentsEl) totalStudentsEl.textContent = classStudents.length;

    let evaluatedTodayCount = 0;
    let answeredWellToday = 0;
    let missedToday = 0;

    Object.keys(currentDailyRecords).forEach((sId) => {
        const evals = currentDailyRecords[sId]?.evaluations || [];
        if (evals.length > 0) {
            evaluatedTodayCount++;
            evals.forEach((ev) => {
                if (ev.status === 'answered') answeredWellToday++;
                else if (ev.status === 'missed') missedToday++;
            });
        }
    });

    const evalTodayEl = document.getElementById('stat-evaluated-today');
    if (evalTodayEl) evalTodayEl.textContent = `${evaluatedTodayCount} / ${classStudents.length}`;

    const ansWellEl = document.getElementById('stat-answered-well');
    if (ansWellEl) ansWellEl.textContent = answeredWellToday;

    const missedEl = document.getElementById('stat-missed');
    if (missedEl) missedEl.textContent = missedToday;

    const pendingTasksEl = document.getElementById('stat-pending-tasks');
    if (pendingTasksEl) {
        const pendingCount = currentImpositionsList.filter((imp) => imp.cleared !== true).length;
        pendingTasksEl.textContent = pendingCount;
    }
};

// --- User Profile & Session Setup ---
const setupSessionAndStaff = async () => {
    const session = window.AppSession?.getSession?.();
    const staffAccess = window.AppSession?.getStaffAccess?.();

    if (session) {
        currentStaffName = session.name || session.email || 'Teacher';
        currentStaffRole = session.role || session.type || 'Class Teacher';
        isSuperAdmin = session.actLikeSuperAdmin === true || session.role === 'super_admin';
    }

    if (session?.email || session?.username || session?.id) {
        try {
            const emailNorm = String(session.email || session.username || '').trim().toLowerCase();
            const staffId = String(session.id || session.staffId || '').trim();
            const snap = await getDocs(collection(db, BASE_PATH, 'staff'));
            if (!snap.empty) {
                const found = snap.docs.find(d => {
                    const data = d.data();
                    return (staffId && d.id === staffId)
                        || (emailNorm && String(data.email || '').trim().toLowerCase() === emailNorm)
                        || (emailNorm && String(data.username || '').trim().toLowerCase() === emailNorm)
                        || (session.name && String(data.name || '').trim().toLowerCase() === String(session.name).trim().toLowerCase());
                });
                if (found) {
                    currentStaffDoc = { id: found.id, ...found.data() };
                }
            }
        } catch (e) {
            console.warn('Could not load staff document:', e);
        }
    }

    teacherAssignedClasses = getStaffAssignedClasses(currentStaffDoc, staffAccess);
    if (!teacherAssignedClasses.length && Array.isArray(session?.dutyClasses) && session.dutyClasses.length) {
        teacherAssignedClasses = session.dutyClasses;
    }
    if (!teacherAssignedClasses.length && Array.isArray(window.AppSession?.getDutyClasses?.())) {
        teacherAssignedClasses = window.AppSession.getDutyClasses();
    }

    const staffNameEl = document.getElementById('header-user-name');
    const staffRoleEl = document.getElementById('header-user-role');

    if (staffNameEl) staffNameEl.textContent = currentStaffName;
    if (staffRoleEl) staffRoleEl.textContent = isSuperAdmin ? 'Super Admin' : currentStaffRole;
};

// --- DOM Event Bindings ---
const initEventBindings = () => {
    // Sidebar Toggles
    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', toggleSidebarState);
    document.getElementById('evaluation-mobile-menu-btn')?.addEventListener('click', () => setSidebarCollapsed(false));
    document.getElementById('drawer-overlay')?.addEventListener('click', () => setSidebarCollapsed(true));

    // Desktop Drawer & Mobile Bottom Nav Tab Links
    document.querySelectorAll('.drawer-link[data-tab], .bottom-nav-link[data-tab]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = btn.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
        });
    });

    // Mobile More Actions Bottom Sheet Controls
    const moreSheet = document.getElementById('evaluation-more-sheet');
    const openMoreSheet = () => {
        if (!moreSheet) return;
        moreSheet.classList.remove('hidden');
        moreSheet.classList.add('flex');
    };
    const closeMoreSheet = () => {
        if (!moreSheet) return;
        moreSheet.classList.add('hidden');
        moreSheet.classList.remove('flex');
    };

    document.getElementById('btn-evaluation-more')?.addEventListener('click', (e) => {
        e.preventDefault();
        openMoreSheet();
    });
    document.getElementById('btn-close-more-sheet')?.addEventListener('click', closeMoreSheet);
    moreSheet?.addEventListener('click', (e) => {
        if (e.target === moreSheet) closeMoreSheet();
    });

    // Logout Handling (Sidebar Desktop & More Mobile Sheet)
    const handleLogout = async () => {
        await window.AppSession?.clearAll({ purgeClientData: true });
        await signOut(auth);
        window.location.href = 'official.html';
    };
    document.getElementById('sidebar-logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('mobile-more-logout-btn')?.addEventListener('click', handleLogout);

    // Class & Year Change
    document.getElementById('eval-class-select')?.addEventListener('change', (e) => {
        selectedClass = e.target.value;
        onClassOrDateChanged();
    });

    document.getElementById('eval-year-select')?.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        const yearBadge = document.getElementById('header-active-year');
        if (yearBadge) yearBadge.textContent = selectedYear;
        onClassOrDateChanged();
    });

    // Date Change
    const dateInput = document.getElementById('eval-date-input');
    if (dateInput) {
        dateInput.value = selectedDate;
        dateInput.addEventListener('change', (e) => {
            selectedDate = e.target.value || getTodayDateString();
            resolveTodaysTimetablePeriods();
            renderSubjectDropdownAndPills();
            setupDailyEvaluationListener();
            fetchMonthlyEvaluations();
        });
    }

    // Subject Change from Dropdown
    document.getElementById('eval-subject-select')?.addEventListener('change', (e) => {
        selectedSubject = e.target.value;
        // Highlight active pill if matched
        document.querySelectorAll('.btn-period-pill').forEach((pill) => {
            if (pill.getAttribute('data-subject')?.toLowerCase() === selectedSubject.toLowerCase()) {
                pill.classList.remove('bg-slate-100', 'text-slate-800');
                pill.classList.add('bg-rose-600', 'text-white');
            } else {
                pill.classList.remove('bg-rose-600', 'text-white');
                pill.classList.add('bg-slate-100', 'text-slate-800');
            }
        });
    });

    // Subject Change from Timetable Period Pills (Quick-Bar)
    document.getElementById('timetable-period-pills')?.addEventListener('click', (e) => {
        const pill = e.target.closest('.btn-period-pill');
        if (pill) {
            const subj = pill.getAttribute('data-subject');
            if (subj) {
                selectedSubject = subj;
                const subSelect = document.getElementById('eval-subject-select');
                if (subSelect) subSelect.value = subj;

                document.querySelectorAll('.btn-period-pill').forEach((p) => {
                    p.classList.remove('bg-rose-600', 'text-white');
                    p.classList.add('bg-slate-100', 'text-slate-800');
                });
                pill.classList.remove('bg-slate-100', 'text-slate-800');
                pill.classList.add('bg-rose-600', 'text-white');

                showToast(`Subject set to: ${subj}`, 'info');
            }
        }
    });

    // Live Board Filter Buttons
    document.querySelectorAll('.eval-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.eval-filter-btn').forEach((b) => {
                b.classList.remove('active', 'bg-rose-600', 'text-white');
                b.classList.add('bg-slate-100', 'text-slate-700');
            });
            btn.classList.add('active', 'bg-rose-600', 'text-white');
            btn.classList.remove('bg-slate-100', 'text-slate-700');
            currentLiveFilter = btn.getAttribute('data-filter') || 'all';
            renderLiveClassroomBoard();
        });
    });

    // Live Board Search
    document.getElementById('live-search-input')?.addEventListener('input', (e) => {
        currentLiveSearch = e.target.value.trim();
        renderLiveClassroomBoard();
    });

    // Event Delegation for Student Card Actions
    const studentsCont = document.getElementById('live-students-container');
    if (studentsCont) {
        studentsCont.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('.btn-eval-action');
            if (actionBtn) {
                const action = actionBtn.getAttribute('data-action');
                const studentId = actionBtn.getAttribute('data-student-id');
                if (action && studentId) {
                    recordEvaluationAction(studentId, action);
                }
                return;
            }

            const readingBtn = e.target.closest('.btn-open-reading');
            if (readingBtn) {
                const studentId = readingBtn.getAttribute('data-student-id');
                const name = readingBtn.getAttribute('data-name');
                document.getElementById('reading-student-id').value = studentId;
                document.getElementById('modal-reading-student-name').textContent = name;
                openModal('modal-reading-eval');
                return;
            }

            const writingBtn = e.target.closest('.btn-open-writing');
            if (writingBtn) {
                const studentId = writingBtn.getAttribute('data-student-id');
                const name = writingBtn.getAttribute('data-name');
                document.getElementById('writing-student-id').value = studentId;
                document.getElementById('modal-writing-student-name').textContent = name;
                openModal('modal-writing-eval');
                return;
            }

            const impBtn = e.target.closest('.btn-assign-imp');
            if (impBtn) {
                const studentId = impBtn.getAttribute('data-student-id');
                populateImpositionStudentSelect(studentId);
                populateImpositionSubjectSelect(selectedSubject);

                document.getElementById('imp-assigned-date').value = selectedDate || getTodayDateString();

                const tom = new Date();
                tom.setDate(tom.getDate() + 1);
                document.getElementById('imp-due-date').value = tom.toISOString().split('T')[0];
                document.getElementById('imp-title').value = '';
                document.getElementById('imp-remark').value = '';

                openModal('modal-assign-imposition');
                return;
            }
        });
    }

    // Reading Modal Selection
    document.querySelectorAll('.reading-option-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const studentId = document.getElementById('reading-student-id').value;
            const rating = btn.getAttribute('data-rating');
            if (studentId && rating) {
                closeModal('modal-reading-eval');
                recordEvaluationAction(studentId, rating === 'fluent' ? 'answered' : (rating === 'needs_practice' ? 'partial' : 'missed'), {
                    activityType: 'reading',
                    readingRating: rating
                });
            }
        });
    });

    // Writing Modal Selection
    document.querySelectorAll('.writing-option-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const studentId = document.getElementById('writing-student-id').value;
            const status = btn.getAttribute('data-status');
            if (studentId && status) {
                closeModal('modal-writing-eval');
                recordEvaluationAction(studentId, status === 'completed' ? 'answered' : 'missed', {
                    activityType: 'writing',
                    writingStatus: status
                });

                if (status === 'not_written_imposition' || status === 'incomplete_due_tomorrow') {
                    populateImpositionStudentSelect(studentId);
                    populateImpositionSubjectSelect(selectedSubject);
                    document.getElementById('imp-assigned-date').value = selectedDate || getTodayDateString();
                    const tom = new Date();
                    tom.setDate(tom.getDate() + 1);
                    document.getElementById('imp-due-date').value = tom.toISOString().split('T')[0];
                    document.getElementById('imp-title').value = status === 'not_written_imposition' ? 'Write lesson exercises 3 times' : 'Complete unfinished notebook exercises';
                    document.getElementById('imp-remark').value = status === 'not_written_imposition' ? 'Did not bring completed notebook' : 'Incomplete written work';
                    openModal('modal-assign-imposition');
                }
            }
        });
    });

    // Quick Imposition Presets
    document.querySelectorAll('.quick-imp-preset').forEach((btn) => {
        btn.addEventListener('click', () => {
            const preset = btn.getAttribute('data-preset');
            const titleInput = document.getElementById('imp-title');
            if (titleInput && preset) {
                titleInput.value = `${preset} (${selectedSubject || 'Lesson'})`;
            }
        });
    });

    // Save Imposition Button (Reads selected student from dropdown!)
    document.getElementById('btn-save-imposition')?.addEventListener('click', () => {
        const impSelect = document.getElementById('imp-student-select');
        const selectedOpt = impSelect?.options[impSelect.selectedIndex];
        const studentId = impSelect?.value;
        const studentName = selectedOpt?.getAttribute('data-name') || selectedOpt?.textContent || '';
        const admNo = selectedOpt?.getAttribute('data-adm') || '';

        const subject = document.getElementById('imp-subject')?.value || selectedSubject || 'General';
        const taskTitle = document.getElementById('imp-title').value.trim();
        const dueDate = document.getElementById('imp-due-date').value;
        const teacherRemark = document.getElementById('imp-remark').value.trim();

        if (!studentId) {
            alert('Please select a student from the dropdown.');
            return;
        }

        if (!taskTitle) {
            alert('Please enter a description for the imposition / task.');
            return;
        }

        assignNewImposition({
            studentId,
            studentName,
            admNo,
            subject,
            taskTitle,
            dueDate,
            teacherRemark
        });
    });

    // Open Add Imposition Button from Tab 2
    document.getElementById('btn-open-add-imposition')?.addEventListener('click', () => {
        populateImpositionStudentSelect();
        populateImpositionSubjectSelect(selectedSubject);
        document.getElementById('imp-assigned-date').value = selectedDate || getTodayDateString();
        const tom = new Date();
        tom.setDate(tom.getDate() + 1);
        document.getElementById('imp-due-date').value = tom.toISOString().split('T')[0];
        document.getElementById('imp-title').value = '';
        document.getElementById('imp-remark').value = '';
        openModal('modal-assign-imposition');
    });

    // Impositions Filter Buttons
    document.querySelectorAll('.imposition-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.imposition-filter-btn').forEach((b) => {
                b.classList.remove('active', 'bg-amber-500', 'text-white');
                b.classList.add('bg-slate-100', 'text-slate-700');
            });
            btn.classList.add('active', 'bg-amber-500', 'text-white');
            btn.classList.remove('bg-slate-100', 'text-slate-700');
            currentImpositionFilter = btn.getAttribute('data-filter') || 'pending';
            renderImpositionsList();
        });
    });

    // Impositions Table Actions Delegation
    const impTbody = document.getElementById('impositions-table-body');
    if (impTbody) {
        impTbody.addEventListener('click', (e) => {
            const clearBtn = e.target.closest('.btn-clear-imposition');
            if (clearBtn) {
                const id = clearBtn.getAttribute('data-id');
                if (id) markImpositionCleared(id);
                return;
            }

            const delBtn = e.target.closest('.btn-delete-imposition');
            if (delBtn) {
                const id = delBtn.getAttribute('data-id');
                if (id) deleteImposition(id);
                return;
            }
        });
    }

    // Modal Close Buttons
    document.querySelectorAll('.btn-close-modal').forEach((btn) => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-modal');
            if (modalId) closeModal(modalId);
        });
    });

    // Confirmation Action OK Button
    document.getElementById('btn-confirm-action-ok')?.addEventListener('click', () => {
        closeModal('modal-confirm-action');
        if (typeof pendingConfirmCallback === 'function') {
            pendingConfirmCallback();
            pendingConfirmCallback = null;
        }
    });

    // Quick Impositions Banner Button
    document.getElementById('btn-quick-view-impositions')?.addEventListener('click', () => {
        switchTab('tab-impositions');
    });

    // Analytics Month Select
    document.getElementById('analytics-month-select')?.addEventListener('change', (e) => {
        selectedAnalyticsMonth = e.target.value;
        fetchMonthlyEvaluations();
    });

    // Analytics Subject Filter Select
    document.getElementById('analytics-subject-filter')?.addEventListener('change', (e) => {
        selectedAnalyticsSubject = e.target.value;
        renderMonthlyRegister();
    });

    // Print Register
    document.getElementById('btn-print-register')?.addEventListener('click', () => {
        window.print();
    });

    // Settings Add Custom Subject (Scoped to Selected Class)
    document.getElementById('btn-add-subject')?.addEventListener('click', () => {
        const inp = document.getElementById('input-new-subject');
        const val = inp?.value.trim();
        if (val && !classCustomSubjects.includes(val)) {
            classCustomSubjects.push(val);
            inp.value = '';
            renderSubjectDropdownAndPills();
            renderSettingsView();
        }
    });

    // Settings Remove Custom Subject Delegation
    document.getElementById('settings-custom-subject-tags')?.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.btn-remove-custom-subject');
        if (removeBtn) {
            const sub = removeBtn.getAttribute('data-subject');
            if (sub) {
                classCustomSubjects = classCustomSubjects.filter((s) => s !== sub);
                renderSubjectDropdownAndPills();
                renderSettingsView();
            }
        }
    });

    // Save Class Settings (Scoped to Selected Class!)
    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
        if (!selectedClass) return;
        if (!isSuperAdmin && (!teacherAssignedClasses.length || !isClassInDutyScope(selectedClass, teacherAssignedClasses))) {
            showToast('Permission denied: You can only configure settings for your assigned classes.', 'warning');
            return;
        }
        const cleanC = String(selectedClass).trim().replace(/[^\w-]/g, '_');
        const togglePts = document.getElementById('toggle-award-activity-points');
        classEvaluationSettings.autoAwardActivityPoints = togglePts ? togglePts.checked : false;

        try {
            await setDoc(doc(db, `${BASE_PATH}/settings`, `evaluationConfig_${cleanC}`), {
                class: selectedClass,
                customSubjects: classCustomSubjects,
                autoAwardActivityPoints: classEvaluationSettings.autoAwardActivityPoints,
                activityPointsBonus: classEvaluationSettings.activityPointsBonus,
                updatedAt: Date.now()
            }, { merge: true });

            showToast(`Evaluation settings for Class ${selectedClass} saved!`, 'success');
        } catch (err) {
            console.error('Error saving evaluation settings:', err);
            showToast('Failed to save settings', 'error');
        }
    });
};

// --- Initialization Lifecycle ---
const initEvaluationModule = async () => {
    initSidebarState();
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    applyInstitutionBranding(institutionConfig, {
        defaultAppName: 'Classroom Evaluation',
        logoIds: ['header-logo'],
        updateDocumentTitle: true,
        documentTitleSuffix: 'Classroom Evaluation'
    });
    await setupSessionAndStaff();
    await loadAcademicYears();
    populateAnalyticsMonths();
    initEventBindings();
    await fetchStudentsAndClasses();

    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'config'), (snap) => {
        const conf = snap.exists() ? (snap.data() || {}) : {};
        institutionConfig = {
            ...institutionConfig,
            ...conf,
            appName: conf.appName || conf.name || institutionConfig.appName || institutionConfig.name || '',
            name: conf.appName || conf.name || institutionConfig.name || institutionConfig.appName || ''
        };
        if (conf.enabledModules && typeof conf.enabledModules === 'object') {
            try {
                localStorage.setItem('app_enabled_modules', JSON.stringify(conf.enabledModules));
            } catch (_) {}
            const isEvaluationEnabled = conf.enabledModules.classroomEvaluation !== false && conf.enabledModules.evaluation !== false;
            if (!isEvaluationEnabled) {
                sessionStorage.setItem('app_session_flash', 'Module Disabled: The Classroom Evaluation module is currently disabled by institution administration.');
                window.location.href = 'official.html';
                return;
            }
        }
        applyInstitutionBranding(institutionConfig, {
            defaultAppName: 'Classroom Evaluation',
            logoIds: ['header-logo'],
            updateDocumentTitle: true,
            documentTitleSuffix: 'Classroom Evaluation'
        });
    });

    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'institution'), (snap) => {
        if (snap.exists()) {
            const instData = snap.data() || {};
            institutionConfig = {
                ...institutionConfig,
                ...instData,
                appName: instData.appName || instData.name || institutionConfig.appName || institutionConfig.name || '',
                name: instData.name || instData.appName || institutionConfig.name || institutionConfig.appName || ''
            };
            applyInstitutionBranding(institutionConfig, {
                defaultAppName: 'Classroom Evaluation',
                logoIds: ['header-logo'],
                updateDocumentTitle: true,
                documentTitleSuffix: 'Classroom Evaluation'
            });
        }
    });

    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'sessionControl'), (snap) => {
        if (!snap.exists()) return;
        const ctrl = snap.data();
        const role = window.AppSession?.getRole?.() || '';
        if (ctrl.isLocked && role !== 'admin') {
            sessionStorage.setItem('app_session_flash', ctrl.lockMessage || 'Official session is currently locked by institution administrator.');
            window.AppSession?.clearAll?.();
            window.location.href = 'index.html';
        }
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEvaluationModule);
} else {
    initEvaluationModule();
}
