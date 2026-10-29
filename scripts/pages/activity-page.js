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
let allStudents = [];
let allClasses = [];

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
let currentRewardsRubric = {
    attendance: 5,
    jamaah: 15,
    adaa: 10,
    quran: 20,
    task: 10,
    bonus: 10
};

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

// --- Sidebar Management ---
const isDesktop = () => window.innerWidth >= 1024;

const setSidebarCollapsed = (collapsed) => {
    const appEl = document.getElementById('activity-app');
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
        localStorage.setItem('activity_sidebar_collapsed', collapsed ? 'true' : 'false');
    } catch (_) {}
};

const toggleSidebarState = () => {
    const appEl = document.getElementById('activity-app');
    if (!appEl) return;
    setSidebarCollapsed(!appEl.classList.contains('sidebar-collapsed'));
};

const initSidebarState = () => {
    try {
        const saved = localStorage.getItem('activity_sidebar_collapsed');
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
    if (targetTabId === 'tab-tasks') {
        loadTasksRoster();
    } else if (targetTabId === 'tab-ibadah') {
        loadIbadahRoster();
    } else if (targetTabId === 'tab-quran') {
        loadQuranRoster();
    } else if (targetTabId === 'tab-rewards') {
        loadRewardsLeaderboard();
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
    if (hash === '#ibadah') activateTab('tab-ibadah');
    else if (hash === '#quran') activateTab('tab-quran');
    else if (hash === '#rewards') activateTab('tab-rewards');
    else activateTab('tab-tasks');
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

    const dateInputs = ['tasks-date-input', 'ibadah-date-input'];
    dateInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = getTodayDateString();
    });

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
    const role = window.AppSession?.getRole?.() || '';
    const adminState = window.AppSession?.getAdminState?.() || {};
    const staffState = window.AppSession?.getStaffState?.() || {};
    const staffAccess = window.AppSession?.getStaffAccess?.() || staffState?.access || {};

    const isMasterAdmin = (role === 'admin' || adminState?.role === 'admin' || adminState?.isMasterAdmin);
    const actAsSuperAdmin = staffAccess?.actLikeSuperAdmin === true || staffAccess?.canAccessAdmin === true;

    if (isMasterAdmin || actAsSuperAdmin) {
        isSuperAdmin = true;
        currentStaffName = staffState?.name || 'Administrator';
        currentStaffRole = actAsSuperAdmin ? 'Super Administrator' : 'Administrator';
        teacherAssignedClasses = [];
    } else {
        isSuperAdmin = false;
        currentStaffName = staffState?.name || window.AppSession?.getStaffName?.() || 'Staff Member';
        currentStaffRole = staffAccess?.role || 'Class Teacher';
        teacherAssignedClasses = getStaffAssignedClasses(staffState?.profile || null, staffAccess);
        if (teacherAssignedClasses.length > 0) {
            currentStaffRole = `Class ${teacherAssignedClasses.join(', ')} Teacher`;
        }
    }

    currentUserKey = String(staffAccess?.loginId || staffAccess?.userKey || staffAccess?.email || window.AppSession?.getStaffEmail?.() || '').trim().toLowerCase();

    const userNameEl = document.getElementById('header-user-name');
    const userRoleEl = document.getElementById('header-user-role');
    if (userNameEl) userNameEl.textContent = currentStaffName;
    if (userRoleEl) userRoleEl.textContent = currentStaffRole;
};

const setupRealtimeListeners = () => {
    // 1. Institution Branding
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

    // 4. Students
    onSnapshot(collection(db, `${BASE_PATH}/students`), (snap) => {
        allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        populateStudentSelect();
    });

    // 5. Staff Roster & Duty Classes Sync
    onSnapshot(collection(db, `${BASE_PATH}/staff`), (snap) => {
        const staffDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!isSuperAdmin) {
            const staffAccess = window.AppSession?.getStaffAccess?.() || {};
            const staffEmailKey = String(staffAccess.email || window.AppSession?.getStaffEmail?.() || currentUserKey || '').trim().toLowerCase();
            const staffPhoneKey = String(staffAccess.phone || currentUserKey || '').replace(/\D/g, '');
            const staffIdKey = staffAccess.staffId || '';

            const matchedStaff = staffDocs.find(s => 
                (staffIdKey && s.id === staffIdKey) ||
                (currentUserKey && (s.username === currentUserKey || s.email === currentUserKey || s.id === currentUserKey)) ||
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
            populateStudentSelect();
        }
    });
};

const getAllowedClassesForTeacher = () => {
    if (isSuperAdmin || teacherAssignedClasses.length === 0) {
        return allClasses;
    }
    const filtered = allClasses.filter(c => isClassInDutyScope(c, teacherAssignedClasses));
    return filtered.length ? filtered : teacherAssignedClasses;
};

const populateClassDropdowns = () => {
    const allowed = getAllowedClassesForTeacher();

    const standardIds = [
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

        if (prev && allowed.some(c => isClassInDutyScope(prev, [c]))) {
            select.value = prev;
        } else if (allowed.length > 0) {
            select.value = allowed[0];
        }
    });

    selectedTasksClass = document.getElementById('tasks-class-select')?.value || allowed[0] || '';
    selectedIbadahClass = document.getElementById('ibadah-class-select')?.value || allowed[0] || '';
    selectedQuranClass = document.getElementById('quran-class-select')?.value || allowed[0] || '';
    selectedRewardsClass = document.getElementById('rewards-class-select')?.value || allowed[0] || '';
};

const populateStudentSelect = () => {
    const sel = document.getElementById('modal-award-student-select');
    if (!sel) return;
    const allowed = getAllowedClassesForTeacher();
    const students = allStudents.filter(s => isClassInDutyScope(s.class, allowed) && s.status !== 'alumni');
    sel.innerHTML = students.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (Class ${s.class}, Adm: ${s.adm || s.admNo || '--'})</option>`).join('');
};

// =========================================================================
// MODULE 1: ROUTINE TASKS TRACKER LOGIC
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
    const allowed = getAllowedClassesForTeacher();
    const classVal = document.getElementById('tasks-class-select')?.value;
    selectedTasksClass = (classVal && allowed.some(c => isClassInDutyScope(classVal, [c]))) ? classVal : (allowed[0] || '');
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

    const classStudents = allStudents.filter(s => isClassInDutyScope(s.class, [selectedTasksClass]) && s.status !== 'alumni');
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
                            <input type="checkbox" class="task-check-box w-4 h-4 text-amber-600 rounded cursor-pointer" data-student-id="${student.id}" data-task-id="${t.id}" ${done ? 'checked' : ''}>
                        </td>`;
                }).join('')}
                <td class="py-2 px-3 text-center font-black text-amber-700 student-task-score">${score} pts</td>
            </tr>`;
    }).join('');
};

const saveTasksCompletionsToFirestore = async () => {
    if (!selectedTasksClass) return;
    if (!isSuperAdmin && teacherAssignedClasses.length > 0 && !isClassInDutyScope(selectedTasksClass, teacherAssignedClasses)) {
        console.warn('Blocked auto-save for unassigned class', selectedTasksClass);
        return;
    }
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
// MODULE 2: SPIRITUAL & IBADAH TRACKER LOGIC
// =========================================================================
const loadIbadahRoster = async () => {
    const allowed = getAllowedClassesForTeacher();
    const classVal = document.getElementById('ibadah-class-select')?.value;
    selectedIbadahClass = (classVal && allowed.some(c => isClassInDutyScope(classVal, [c]))) ? classVal : (allowed[0] || '');
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

    const classStudents = allStudents.filter(s => isClassInDutyScope(s.class, [selectedIbadahClass]) && s.status !== 'alumni');
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
                    <input type="checkbox" class="ibadah-tahajjud-cb w-4 h-4 text-amber-600 rounded" ${rec.tahajjud ? 'checked' : ''}>
                </td>
                <td class="py-2 px-3 text-center">
                    <input type="checkbox" class="ibadah-duha-cb w-4 h-4 text-amber-600 rounded" ${rec.duha ? 'checked' : ''}>
                </td>
                <td class="py-2 px-3 text-center">
                    <input type="number" class="ibadah-tilawat-mins w-16 p-1 text-center font-bold border border-slate-300 rounded text-slate-800" value="${rec.tilawat || 15}" min="0" max="180">
                </td>
            </tr>`;
    }).join('');
};

const saveIbadahRecords = async () => {
    if (!selectedIbadahClass) return alert('Please select a class first.');
    if (!isSuperAdmin && teacherAssignedClasses.length > 0 && !isClassInDutyScope(selectedIbadahClass, teacherAssignedClasses)) {
        return alert('You can only save Ibadah records for your assigned classes.');
    }

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
// MODULE 3: QURAN READING PROGRESS TRACKER LOGIC
// =========================================================================
const loadQuranRoster = async () => {
    const allowed = getAllowedClassesForTeacher();
    const classVal = document.getElementById('quran-class-select')?.value;
    selectedQuranClass = (classVal && allowed.some(c => isClassInDutyScope(classVal, [c]))) ? classVal : (allowed[0] || '');
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

    let classStudents = allStudents.filter(s => isClassInDutyScope(s.class, [selectedQuranClass]) && s.status !== 'alumni');
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
                <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded font-black text-xs bg-amber-50 text-amber-900 border border-amber-200">${stageLabel}</span></td>
                <td class="py-2.5 px-3 font-bold text-slate-800">${escapeHtml(q.currentSabaq || 'Lesson 1')}</td>
                <td class="py-2.5 px-3 font-semibold text-slate-600">${escapeHtml(q.completed || 'Not Started')}</td>
                <td class="py-2.5 px-3 font-semibold text-slate-500">${escapeHtml(q.remaining || '--')}</td>
                <td class="py-2.5 px-3 text-center">
                    ${q.isKhatm ? '<span class="px-2.5 py-0.5 rounded-full font-black text-xs bg-amber-400 text-white shadow-2xs">Khatm Completed!</span>' : `<span class="px-2 py-0.5 rounded text-xs font-bold ${q.grade === 'Mumtaz (Excellent)' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'}">${escapeHtml(q.grade || 'Jayyid')}</span>`}
                </td>
                <td class="py-2.5 px-3 text-right">
                    <button type="button" class="btn-eval-quran px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black text-xs transition cursor-pointer" data-student-id="${student.id}">
                        Record Lesson
                    </button>
                </td>
            </tr>`;
    }).join('');
};

const openQuranEvaluateModal = (studentId) => {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;
    if (!isSuperAdmin && teacherAssignedClasses.length > 0 && !isClassInDutyScope(student.class, teacherAssignedClasses)) {
        return alert('You can only record lessons for students in your assigned classes.');
    }

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
    const student = allStudents.find(s => s.id === studentId);
    if (!isSuperAdmin && teacherAssignedClasses.length > 0 && student && !isClassInDutyScope(student.class, teacherAssignedClasses)) {
        return alert('You can only save Quran progress for students in your assigned classes.');
    }

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
// MODULE 4: REWARDS, POINTS & LEADERBOARD LOGIC
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

    const allowed = getAllowedClassesForTeacher();
    const classVal = document.getElementById('rewards-class-select')?.value;
    selectedRewardsClass = (classVal && allowed.some(c => isClassInDutyScope(classVal, [c]))) ? classVal : (allowed[0] || '');
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

    const classStudents = allStudents.filter(s => isClassInDutyScope(s.class, [selectedRewardsClass]) && s.status !== 'alumni');

    const scores = classStudents.map(student => {
        const attPts = (currentRewardsRubric.attendance || 5) * 12;
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
    const student = allStudents.find(s => s.id === studentId);
    if (!studentId || !student) return alert('Please select a student.');
    if (!isSuperAdmin && teacherAssignedClasses.length > 0 && !isClassInDutyScope(student.class, teacherAssignedClasses)) {
        return alert('You can only award points to students in your assigned classes.');
    }
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
    document.getElementById('activity-mobile-menu-btn')?.addEventListener('click', () => setSidebarCollapsed(false));
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

    // 2. Routine Tasks Listeners
    document.getElementById('tasks-class-select')?.addEventListener('change', loadTasksRoster);
    document.getElementById('tasks-date-input')?.addEventListener('change', loadTasksRoster);
    document.querySelectorAll('.tasks-freq-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tasks-freq-btn').forEach(b => {
                b.classList.remove('bg-amber-500', 'text-white');
                b.classList.add('text-slate-600', 'hover:bg-slate-100');
            });
            btn.classList.add('bg-amber-500', 'text-white');
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

    // 3. Ibadah Listeners
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

    // 4. Quran Progress Listeners
    document.getElementById('quran-class-select')?.addEventListener('change', loadQuranRoster);
    document.getElementById('quran-stage-filter')?.addEventListener('change', loadQuranRoster);
    document.getElementById('quran-roster-tbody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-eval-quran');
        if (btn) {
            openQuranEvaluateModal(btn.dataset.studentId);
        }
    });
    document.getElementById('btn-save-quran-eval')?.addEventListener('click', saveQuranProgress);

    // 5. Rewards & Leaderboard Listeners
    document.getElementById('rewards-class-select')?.addEventListener('change', loadRewardsLeaderboard);
    document.getElementById('btn-rewards-settings')?.addEventListener('click', openRewardsSettingsModal);
    document.getElementById('btn-save-rewards-settings')?.addEventListener('click', saveRewardsRubric);
    document.getElementById('btn-open-award-points')?.addEventListener('click', () => openModal('modal-award-points'));
    document.getElementById('btn-submit-award-points')?.addEventListener('click', awardBonusPoints);
    document.getElementById('btn-print-leaderboard')?.addEventListener('click', () => window.print());

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
