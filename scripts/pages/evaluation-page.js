import { signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, onSnapshot, collection, getDocs, setDoc, deleteDoc, query, where, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, auth } from '../../config/firebase-config.js';
import { BASE_PATH, applyInstitutionBranding, escapeHtml, formatDateDisplay } from '../shared/app-common.js';
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
let allStudents = [];
let allClasses = [];

// Selected Scope
let selectedClass = '';
let selectedYear = '2025-2026';
let selectedDate = new Date().toISOString().split('T')[0];
let selectedSubject = 'General';

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

// Filter & Search State
let currentLiveFilter = 'least-turns'; // 'least-turns' | 'not-today' | 'evaluated-today' | 'all'
let currentLiveSearch = '';
let currentImpositionFilter = 'pending'; // 'pending' | 'due-today' | 'cleared' | 'all'

// Settings
let configuredSubjects = ['General', 'Arabic', 'Fiqh', 'Quran', 'Thafseer', 'Hadees', 'English', 'Mathematics'];
let evaluationConfig = {
    autoAwardActivityPoints: true,
    activityPointsBonus: 5
};

// Confirmation Dialog State
let pendingConfirmCallback = null;

// Helper: Normalize Date String
const getTodayDateString = () => new Date().toISOString().split('T')[0];

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

// Sidebar collapse logic
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

    if (!isDesktop()) {
        setSidebarCollapsed(true);
    }

    if (tabId === 'tab-analytics') {
        renderMonthlyRegister();
    } else if (tabId === 'tab-impositions') {
        renderImpositionsList();
    }
};

// --- Load Metadata & Scopes ---
const loadAcademicYears = async () => {
    try {
        const snap = await getDoc(doc(db, BASE_PATH, 'settings', 'academicYears', 'config'));
        if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data.years) && data.years.length > 0) {
                availableAcademicYears = data.years.map((y) => typeof y === 'string' ? y : y.name || y.id).filter(Boolean);
            }
            if (data.activeYear) {
                currentAcademicYear = data.activeYear;
                selectedYear = currentAcademicYear;
            }
        }
    } catch (e) {
        console.warn('Could not load academic years config, using fallback:', e);
    }

    const yearSelect = document.getElementById('eval-year-select');
    if (yearSelect) {
        yearSelect.innerHTML = availableAcademicYears.map((yr) => `<option value="${escapeHtml(yr)}" ${yr === selectedYear ? 'selected' : ''}>${escapeHtml(yr)}</option>`).join('');
    }
};

const loadConfiguredSubjects = async () => {
    try {
        const snap = await getDoc(doc(db, BASE_PATH, 'settings', 'evaluationConfig'));
        if (snap.exists()) {
            const d = snap.data();
            if (Array.isArray(d.subjects) && d.subjects.length > 0) {
                configuredSubjects = d.subjects;
            }
            if (typeof d.autoAwardActivityPoints === 'boolean') {
                evaluationConfig.autoAwardActivityPoints = d.autoAwardActivityPoints;
            }
            if (typeof d.activityPointsBonus === 'number') {
                evaluationConfig.activityPointsBonus = d.activityPointsBonus;
            }
        }
    } catch (e) {
        console.warn('Evaluation config load warning:', e);
    }

    renderSubjectDropdown();
    renderSubjectSettings();
};

const renderSubjectDropdown = () => {
    const subSelect = document.getElementById('eval-subject-select');
    if (!subSelect) return;
    subSelect.innerHTML = configuredSubjects.map((s) => `<option value="${escapeHtml(s)}" ${s === selectedSubject ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
};

const renderSubjectSettings = () => {
    const tagsCont = document.getElementById('settings-subject-tags');
    if (tagsCont) {
        tagsCont.innerHTML = configuredSubjects.map((s) => `
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800">
                <span>${escapeHtml(s)}</span>
                ${s !== 'General' ? `<button type="button" class="btn-remove-subject text-slate-400 hover:text-rose-600 cursor-pointer ml-1" data-subject="${escapeHtml(s)}"><i class="fas fa-times"></i></button>` : ''}
            </span>
        `).join('');
    }

    const togglePts = document.getElementById('toggle-award-activity-points');
    if (togglePts) togglePts.checked = evaluationConfig.autoAwardActivityPoints !== false;
};

// --- Students & Classes Fetching ---
const fetchStudentsAndClasses = async () => {
    try {
        const snap = await getDocs(collection(db, BASE_PATH, 'students'));
        const list = [];
        const classesSet = new Set();

        snap.forEach((d) => {
            const s = { id: d.id, ...d.data() };
            list.push(s);
            if (s.class) classesSet.add(String(s.class).trim());
        });

        allStudents = list;
        allClasses = Array.from(classesSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        populateClassDropdown();
    } catch (err) {
        console.error('Error fetching students:', err);
        showToast('Error loading students roster', 'error');
    }
};

const populateClassDropdown = () => {
    const classSelect = document.getElementById('eval-class-select');
    if (!classSelect) return;

    let allowed = allClasses;
    if (!isSuperAdmin && teacherAssignedClasses.length > 0) {
        allowed = allClasses.filter((c) => isClassInDutyScope(c, teacherAssignedClasses));
    }

    if (allowed.length === 0) {
        allowed = allClasses; // Fallback if no specific duty class set
    }

    classSelect.innerHTML = allowed.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

    if (allowed.length > 0) {
        selectedClass = allowed[0];
        classSelect.value = selectedClass;
        updateHeaderClassPill();
        setupDailyEvaluationListener();
        setupImpositionsListener();
        fetchMonthlyEvaluations();
    } else {
        classSelect.innerHTML = '<option value="">No classes found</option>';
    }
};

const updateHeaderClassPill = () => {
    const pill = document.getElementById('header-class-pill');
    if (pill) {
        pill.textContent = selectedClass ? `Class: ${selectedClass}` : 'All Classes';
    }
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
        // Query daily evaluation docs for this year and class
        const colRef = collection(db, BASE_PATH, 'evaluations');
        const q = query(
            colRef,
            where('academicYear', '==', selectedYear),
            where('class', '==', selectedClass)
        );

        const snap = await getDocs(q);
        const map = {};

        snap.forEach((d) => {
            const data = d.data();
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
                            writingCompleted: 0
                        };
                    }
                    const evals = records[sId].evaluations || [];
                    evals.forEach((ev) => {
                        if (ev.activityType === 'reading' || ev.readingRating) {
                            map[sId].readingChecks++;
                        } else if (ev.activityType === 'writing' || ev.writingStatus) {
                            if (ev.writingStatus === 'completed') map[sId].writingCompleted++;
                        } else {
                            map[sId].totalAsked++;
                            if (ev.status === 'answered') map[sId].answeredWell++;
                            else if (ev.status === 'partial') map[sId].partial++;
                            else if (ev.status === 'missed') map[sId].missed++;
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

// --- Live Classroom Board Rendering ---
const renderLiveClassroomBoard = () => {
    const container = document.getElementById('live-students-container');
    if (!container) return;

    const classStudents = allStudents.filter((s) => String(s.class).trim().toLowerCase() === String(selectedClass).trim().toLowerCase());

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
        const query = currentLiveSearch.toLowerCase();
        list = list.filter((s) => (s.name && s.name.toLowerCase().includes(query)) || (s.admNo && String(s.admNo).toLowerCase().includes(query)));
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
        list.sort((a, b) => String(a.admNo || '').localeCompare(String(b.admNo || ''), undefined, { numeric: true }));
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
                                <h4 class="font-black text-xs sm:text-sm text-slate-800 truncate" title="${escapeHtml(student.name || 'Student')}">${escapeHtml(student.name || 'Student')}</h4>
                                <div class="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold mt-0.5">
                                    <span>Adm: ${escapeHtml(student.admNo || '-')}</span>
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
                        <button type="button" class="btn-eval-action flex items-center justify-center gap-1 py-2 px-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition shadow-2xs active:scale-95 cursor-pointer" data-action="answered" data-student-id="${student.id}" title="Answered Correctly (+5 Pts)">
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
                        <button type="button" class="btn-assign-imp py-1.5 px-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 transition cursor-pointer" data-student-id="${student.id}" data-name="${escapeHtml(student.name)}" data-adm="${escapeHtml(student.admNo || '')}" title="Assign Imposition / Follow-up">
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

    const student = allStudents.find((s) => s.id === studentId);
    if (!student) return;

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
        const studentRec = currentDailyRecords[studentId] || { studentId, name: student.name, admNo: student.admNo || '', evaluations: [] };
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

    const newImp = {
        id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        studentId,
        studentName,
        admNo: admNo || '',
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
        showToast(`Imposition assigned to ${studentName}`, 'success');
    } catch (err) {
        console.error('Error saving imposition:', err);
        showToast('Failed to assign imposition', 'error');
    }
};

const markImpositionCleared = async (impositionId) => {
    if (!selectedClass || !selectedYear) return;

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
    if (drawerBadge) {
        if (activePending.length > 0) {
            drawerBadge.textContent = activePending.length;
            drawerBadge.classList.remove('hidden');
        } else {
            drawerBadge.classList.add('hidden');
        }
    }

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

        return `
            <tr class="hover:bg-slate-50/80 transition">
                <td class="py-3 px-4">
                    <div class="font-extrabold text-slate-800">${escapeHtml(imp.studentName)}</div>
                    <div class="text-[10px] text-slate-400 font-semibold">Adm: ${escapeHtml(imp.admNo || '-')}</div>
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

    const classStudents = allStudents.filter((s) => String(s.class).trim().toLowerCase() === String(selectedClass).trim().toLowerCase());
    if (classStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-slate-400">No students found.</td></tr>`;
        return;
    }

    let totalQ = 0;
    let totalAnsweredWell = 0;
    let totalMissed = 0;
    const attentionStudents = [];

    const rows = classStudents.map((s) => {
        const st = monthlyEvalsCache[s.id] || { totalAsked: 0, answeredWell: 0, partial: 0, missed: 0, readingChecks: 0, writingCompleted: 0 };
        totalQ += st.totalAsked;
        totalAnsweredWell += st.answeredWell;
        totalMissed += st.missed;

        const rate = st.totalAsked > 0 ? Math.round((st.answeredWell / st.totalAsked) * 100) : 0;
        const imps = currentImpositionsList.filter((imp) => imp.studentId === s.id);
        const impsCleared = imps.filter((imp) => imp.cleared === true).length;

        // Flag attention if turns < 2 or rate < 50% (after at least 2 questions)
        if (st.totalAsked < 2 || (st.totalAsked >= 2 && rate < 50)) {
            attentionStudents.push({ name: s.name, reason: st.totalAsked < 2 ? 'Only ' + st.totalAsked + ' turns' : rate + '% success' });
        }

        return `
            <tr class="hover:bg-slate-50/80 transition text-xs">
                <td class="py-2.5 px-3 font-semibold text-slate-500">${escapeHtml(s.admNo || '-')}</td>
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
        const clearedTotal = currentImpositionsList.filter((imp) => imp.cleared === true).length;
        impRatioEl.textContent = `${clearedTotal} / ${currentImpositionsList.length}`;
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
        titleEl.textContent = `Monthly Evaluation Register: ${selectedClass} (${selectedAnalyticsMonth})`;
    }
};

// --- Quick Stats Banner Update ---
const updateQuickStatsBanner = () => {
    const classStudents = allStudents.filter((s) => String(s.class).trim().toLowerCase() === String(selectedClass).trim().toLowerCase());

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

    // Try finding staff document in Firestore to resolve exact duty classes
    if (session?.email) {
        try {
            const emailNorm = String(session.email).trim().toLowerCase();
            const snap = await getDocs(query(collection(db, BASE_PATH, 'staff'), where('email', '==', emailNorm)));
            if (!snap.empty) {
                currentStaffDoc = snap.docs[0].data();
            }
        } catch (e) {
            console.warn('Could not load staff document:', e);
        }
    }

    teacherAssignedClasses = getStaffAssignedClasses(currentStaffDoc, staffAccess);

    // Update UI Elements with staff details
    const staffNameEl = document.getElementById('sidebar-staff-name');
    const staffRoleEl = document.getElementById('sidebar-staff-role');
    const topUserEl = document.getElementById('top-user-name');
    const dropNameEl = document.getElementById('dropdown-user-name');
    const dropRoleEl = document.getElementById('dropdown-user-role');

    if (staffNameEl) staffNameEl.textContent = currentStaffName;
    if (staffRoleEl) staffRoleEl.textContent = isSuperAdmin ? 'Super Admin' : currentStaffRole;
    if (topUserEl) topUserEl.textContent = currentStaffName;
    if (dropNameEl) dropNameEl.textContent = currentStaffName;
    if (dropRoleEl) dropRoleEl.textContent = isSuperAdmin ? 'Super Admin' : currentStaffRole;
};

// --- DOM Event Bindings ---
const initEventBindings = () => {
    // Sidebar Toggles
    document.getElementById('btn-toggle-sidebar')?.addEventListener('click', toggleSidebarState);
    document.getElementById('btn-close-drawer')?.addEventListener('click', () => setSidebarCollapsed(true));
    document.getElementById('drawer-overlay')?.addEventListener('click', () => setSidebarCollapsed(true));

    // Tab Links
    document.querySelectorAll('.drawer-link[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
        });
    });

    // Profile Dropdown
    const userMenuBtn = document.getElementById('btn-user-profile-menu');
    const profileDropdown = document.getElementById('profile-dropdown-menu');
    userMenuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown?.classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
        profileDropdown?.classList.add('hidden');
    });

    // Logout
    document.getElementById('btn-logout-evaluation')?.addEventListener('click', async () => {
        await window.AppSession?.clearAll({ purgeClientData: true });
        await signOut(auth);
        window.location.href = 'official.html';
    });

    // Class & Year Change
    document.getElementById('eval-class-select')?.addEventListener('change', (e) => {
        selectedClass = e.target.value;
        updateHeaderClassPill();
        setupDailyEvaluationListener();
        setupImpositionsListener();
        fetchMonthlyEvaluations();
    });

    document.getElementById('eval-year-select')?.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        setupDailyEvaluationListener();
        setupImpositionsListener();
        fetchMonthlyEvaluations();
    });

    // Date Change
    const dateInput = document.getElementById('eval-date-input');
    if (dateInput) {
        dateInput.value = selectedDate;
        dateInput.addEventListener('change', (e) => {
            selectedDate = e.target.value || getTodayDateString();
            setupDailyEvaluationListener();
            fetchMonthlyEvaluations();
        });
    }

    // Subject Change
    document.getElementById('eval-subject-select')?.addEventListener('change', (e) => {
        selectedSubject = e.target.value;
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
                const name = impBtn.getAttribute('data-name');
                const adm = impBtn.getAttribute('data-adm');

                document.getElementById('imp-student-id').value = studentId;
                document.getElementById('imp-student-name').value = name;
                document.getElementById('imp-student-adm').value = adm;
                document.getElementById('modal-imposition-student-info').textContent = `${name} (Adm: ${adm || '-'})`;
                document.getElementById('imp-subject').value = selectedSubject || 'General';
                document.getElementById('imp-assigned-date').value = selectedDate || getTodayDateString();

                // Due date tomorrow by default
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

                // If not written, prompt imposition modal
                if (status === 'not_written_imposition' || status === 'incomplete_due_tomorrow') {
                    const student = allStudents.find((s) => s.id === studentId);
                    if (student) {
                        document.getElementById('imp-student-id').value = student.id;
                        document.getElementById('imp-student-name').value = student.name;
                        document.getElementById('imp-student-adm').value = student.admNo || '';
                        document.getElementById('modal-imposition-student-info').textContent = `${student.name} (Adm: ${student.admNo || '-'})`;
                        document.getElementById('imp-subject').value = selectedSubject || 'General';
                        document.getElementById('imp-assigned-date').value = selectedDate || getTodayDateString();
                        const tom = new Date();
                        tom.setDate(tom.getDate() + 1);
                        document.getElementById('imp-due-date').value = tom.toISOString().split('T')[0];
                        document.getElementById('imp-title').value = status === 'not_written_imposition' ? 'Write lesson exercises 3 times' : 'Complete unfinished notebook exercises';
                        document.getElementById('imp-remark').value = status === 'not_written_imposition' ? 'Did not bring completed notebook' : 'Incomplete written work';
                        openModal('modal-assign-imposition');
                    }
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

    // Save Imposition Button
    document.getElementById('btn-save-imposition')?.addEventListener('click', () => {
        const studentId = document.getElementById('imp-student-id').value;
        const studentName = document.getElementById('imp-student-name').value;
        const admNo = document.getElementById('imp-student-adm').value;
        const subject = document.getElementById('imp-subject').value;
        const taskTitle = document.getElementById('imp-title').value.trim();
        const dueDate = document.getElementById('imp-due-date').value;
        const teacherRemark = document.getElementById('imp-remark').value.trim();

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

    // Open Add Imposition Button
    document.getElementById('btn-open-add-imposition')?.addEventListener('click', () => {
        const classStudents = allStudents.filter((s) => String(s.class).trim().toLowerCase() === String(selectedClass).trim().toLowerCase());
        if (classStudents.length === 0) {
            alert('No students found in current class.');
            return;
        }
        const student = classStudents[0];
        document.getElementById('imp-student-id').value = student.id;
        document.getElementById('imp-student-name').value = student.name;
        document.getElementById('imp-student-adm').value = student.admNo || '';
        document.getElementById('modal-imposition-student-info').textContent = `${student.name} (Adm: ${student.admNo || '-'})`;
        document.getElementById('imp-subject').value = selectedSubject || 'General';
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

    // Print Register
    document.getElementById('btn-print-register')?.addEventListener('click', () => {
        window.print();
    });

    // Settings Add Subject
    document.getElementById('btn-add-subject')?.addEventListener('click', () => {
        const inp = document.getElementById('input-new-subject');
        const val = inp?.value.trim();
        if (val && !configuredSubjects.includes(val)) {
            configuredSubjects.push(val);
            inp.value = '';
            renderSubjectDropdown();
            renderSubjectSettings();
        }
    });

    // Settings Remove Subject Delegation
    document.getElementById('settings-subject-tags')?.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.btn-remove-subject');
        if (removeBtn) {
            const sub = removeBtn.getAttribute('data-subject');
            if (sub && sub !== 'General') {
                configuredSubjects = configuredSubjects.filter((s) => s !== sub);
                renderSubjectDropdown();
                renderSubjectSettings();
            }
        }
    });

    // Save Settings
    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
        const togglePts = document.getElementById('toggle-award-activity-points');
        evaluationConfig.autoAwardActivityPoints = togglePts ? togglePts.checked : true;

        try {
            await setDoc(doc(db, BASE_PATH, 'settings', 'evaluationConfig'), {
                subjects: configuredSubjects,
                autoAwardActivityPoints: evaluationConfig.autoAwardActivityPoints,
                activityPointsBonus: evaluationConfig.activityPointsBonus,
                updatedAt: Date.now()
            }, { merge: true });

            showToast('Subject and rubric configuration saved!', 'success');
        } catch (err) {
            console.error('Error saving evaluation settings:', err);
            showToast('Failed to save settings', 'error');
        }
    });
};

// --- Initialization Lifecycle ---
const initEvaluationModule = async () => {
    initSidebarState();
    await applyInstitutionBranding();
    await setupSessionAndStaff();
    await loadAcademicYears();
    await loadConfiguredSubjects();
    populateAnalyticsMonths();
    initEventBindings();
    await fetchStudentsAndClasses();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEvaluationModule);
} else {
    initEvaluationModule();
}
