import { signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, onSnapshot, collection, getDocs, setDoc, deleteDoc, query, where, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, auth } from '../../config/firebase-config.js';
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

// --- Dashboard State ---
let selectedDashClass = '';

// --- Tasks Definition & Config State ---
let taskDefsList = []; // [ { id, title, cadence, dayOfWeek, dayOfMonth, points } ]
let taskDefFilter = 'all'; // 'all' | 'daily' | 'weekly' | 'monthly'

// --- Routine Tasks Checklist State ---
let selectedTasksClass = '';
let selectedTasksDate = new Date().toISOString().split('T')[0];
let currentTaskCadence = 'daily'; // 'daily' | 'weekly' | 'monthly'
let taskCompletionsMap = {}; // studentId -> { [taskId]: true }
let tasksHaveUnsavedChanges = false;

// --- Prayer Tracker State ---
let selectedPrayerClass = '';
let selectedPrayerDate = new Date().toISOString().split('T')[0];
let customPrayersList = []; // [ { id, name } ]
let prayerRecordsMap = {}; // studentId -> { subh: 'J'|'A'|'Q', zuhr, asr, maghrib, isha, [customId]: 'J'|'A'|'Q' }
let prayerHasUnsavedChanges = false;

// --- Rewards & Leaderboard State ---
let selectedRewardsClass = '';
let studentBonusPointsMap = {}; // studentId -> [ { id, points, reason, awardedBy, date } ]
let studentCustomBadgesMap = {}; // studentId -> [ 'Badge Name 1', 'Badge Name 2' ]
let currentRewardsRubric = {
    attendance: 5,
    jamaah: 15,
    adaa: 10,
    qaza: 0,
    sunnah: 5,
    task: 10,
    bonus: 10
};

// --- Confirmation Dialog Handler ---
let pendingConfirmCallback = null;

const showConfirmDialog = ({ title = 'Confirm Action', message = 'Are you sure you want to proceed?', confirmText = 'Yes, Confirm', confirmBtnClass = 'bg-rose-600 hover:bg-rose-700', onConfirm = null }) => {
    const titleEl = document.getElementById('modal-confirm-title');
    const msgEl = document.getElementById('modal-confirm-msg');
    const okBtn = document.getElementById('btn-confirm-action-ok');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (okBtn) {
        okBtn.textContent = confirmText;
        okBtn.className = `flex-1 py-2.5 text-white rounded-xl font-black text-xs transition shadow-sm cursor-pointer ${confirmBtnClass}`;
    }

    pendingConfirmCallback = onConfirm;
    openModal('modal-confirm-action');
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
    if (targetTabId === 'tab-dashboard') {
        loadDashboardView();
    } else if (targetTabId === 'tab-task-setup') {
        loadTaskDefsTable();
    } else if (targetTabId === 'tab-tasks') {
        loadTasksRoster();
    } else if (targetTabId === 'tab-prayer') {
        loadPrayerRoster();
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

    // Quick navigation buttons from dashboard or cards
    document.addEventListener('click', (e) => {
        const quickNav = e.target.closest('.dash-quick-nav');
        if (quickNav) {
            const target = quickNav.dataset.target;
            if (target) {
                activateTab(target);
                const hash = target.replace('tab-', '#');
                if (hash && window.location.hash !== hash) {
                    history.pushState(null, '', hash);
                }
            }
            return;
        }

        const btnBacklog = e.target.closest('.btn-resolve-backlog');
        if (btnBacklog) {
            const targetTab = btnBacklog.dataset.target;
            const targetDate = btnBacklog.dataset.date;
            if (targetTab === 'tab-prayer') {
                const dateInput = document.getElementById('prayer-date-input');
                if (dateInput && targetDate) dateInput.value = targetDate;
                activateTab('tab-prayer');
                loadPrayerRoster();
            } else if (targetTab === 'tab-tasks') {
                const dateInput = document.getElementById('tasks-date-input');
                if (dateInput && targetDate) dateInput.value = targetDate;
                activateTab('tab-tasks');
                loadTasksRoster();
            }
        }
    });

    const hash = window.location.hash;
    if (hash === '#task-setup') activateTab('tab-task-setup');
    else if (hash === '#tasks') activateTab('tab-tasks');
    else if (hash === '#prayer') activateTab('tab-prayer');
    else if (hash === '#rewards') activateTab('tab-rewards');
    else activateTab('tab-dashboard');
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

// --- Unsaved Changes Badges Management ---
const setTasksUnsavedState = (dirty) => {
    tasksHaveUnsavedChanges = dirty;
    const badge = document.getElementById('tasks-unsaved-badge');
    if (badge) badge.classList.toggle('hidden', !dirty);
};

const setPrayerUnsavedState = (dirty) => {
    prayerHasUnsavedChanges = dirty;
    const badge = document.getElementById('prayer-unsaved-badge');
    if (badge) badge.classList.toggle('hidden', !dirty);
};

// --- Initialization & Auth ---
const initApp = async () => {
    initSidebarState();
    initTabNavigation();
    startClock();

    const dateInputs = ['tasks-date-input', 'prayer-date-input'];
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
        await loadRewardsRubric();
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
    const welcomeHeadingEl = document.getElementById('dash-welcome-heading');
    const dutySummaryEl = document.getElementById('dash-duty-summary');

    if (userNameEl) userNameEl.textContent = currentStaffName;
    if (userRoleEl) userRoleEl.textContent = currentStaffRole;
    if (welcomeHeadingEl) welcomeHeadingEl.textContent = `Welcome, ${currentStaffName}`;
    if (dutySummaryEl) {
        if (isSuperAdmin || teacherAssignedClasses.length === 0) {
            dutySummaryEl.textContent = 'All Classes Available (Administrator)';
        } else {
            dutySummaryEl.textContent = `Duty Classes: Class ${teacherAssignedClasses.join(', Class ')}`;
        }
    }
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
        const dashSessionEl = document.getElementById('dash-banner-session');
        if (activeYearEl) {
            activeYearEl.textContent = currentAcademicYear ? `Session ${currentAcademicYear}` : 'No Active Session';
        }
        if (dashSessionEl) {
            dashSessionEl.textContent = currentAcademicYear ? `Session ${currentAcademicYear}` : 'Active Session';
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
        if (document.getElementById('tab-dashboard') && !document.getElementById('tab-dashboard').classList.contains('hidden')) {
            loadDashboardView();
        }
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
                    const dutySummaryEl = document.getElementById('dash-duty-summary');
                    if (dutySummaryEl) dutySummaryEl.textContent = `Duty Classes: Class ${teacherAssignedClasses.join(', Class ')}`;
                }
            } else if (staffAccess) {
                teacherAssignedClasses = getStaffAssignedClasses(null, staffAccess);
            }
            populateClassDropdowns();
            populateStudentSelect();
        }
    });

    // 6. Custom Prayers Configuration Listener
    onSnapshot(doc(db, `${BASE_PATH}/prayerSettings`, 'customPrayers'), (snap) => {
        if (snap.exists() && Array.isArray(snap.data().list)) {
            customPrayersList = snap.data().list;
        } else {
            customPrayersList = [];
        }
        renderCustomPrayersListInModal();
        if (document.getElementById('tab-prayer') && !document.getElementById('tab-prayer').classList.contains('hidden')) {
            loadPrayerRoster();
        }
    });

    // 7. Configured Routine Tasks Listener
    onSnapshot(doc(db, `${BASE_PATH}/settings`, 'taskDefinitions'), (snap) => {
        if (snap.exists() && Array.isArray(snap.data().tasks)) {
            taskDefsList = snap.data().tasks;
        } else {
            taskDefsList = getDefaultTasksList();
        }
        updateCadenceButtonLabels();
        loadTaskDefsTable();
        if (document.getElementById('tab-tasks') && !document.getElementById('tab-tasks').classList.contains('hidden')) {
            loadTasksRoster();
        }
    });

    // 8. Custom Badges Listener
    onSnapshot(collection(db, `${BASE_PATH}/studentCustomBadges`), (snap) => {
        studentCustomBadgesMap = {};
        snap.docs.forEach(d => {
            studentCustomBadgesMap[d.id] = d.data().badges || [];
        });
        if (document.getElementById('tab-rewards') && !document.getElementById('tab-rewards').classList.contains('hidden')) {
            loadRewardsLeaderboard();
        }
    });

    // 9. Rewards & Prayer Points Rubric Listener
    onSnapshot(doc(db, `${BASE_PATH}/rewardSettings`, currentAcademicYear), (snap) => {
        if (snap.exists() && snap.data().points) {
            currentRewardsRubric = { ...currentRewardsRubric, ...snap.data().points };
        }
        updatePrayerStatusLegendPoints();
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

    const dropdownIds = [
        'dashboard-class-select',
        'tasks-class-select',
        'prayer-class-select',
        'rewards-class-select'
    ];

    dropdownIds.forEach(id => {
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

    selectedDashClass = document.getElementById('dashboard-class-select')?.value || allowed[0] || '';
    selectedTasksClass = document.getElementById('tasks-class-select')?.value || allowed[0] || '';
    selectedPrayerClass = document.getElementById('prayer-class-select')?.value || allowed[0] || '';
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
// MODULE 1: OVERVIEW DASHBOARD LOGIC
// =========================================================================
const loadDashboardView = async () => {
    const allowed = getAllowedClassesForTeacher();
    const classVal = document.getElementById('dashboard-class-select')?.value;
    selectedDashClass = (classVal && allowed.some(c => isClassInDutyScope(classVal, [c]))) ? classVal : (allowed[0] || '');

    const studentsEl = document.getElementById('dash-stat-students');
    const prayerEl = document.getElementById('dash-stat-prayer');
    const prayerSubEl = document.getElementById('dash-stat-prayer-sub');
    const tasksEl = document.getElementById('dash-stat-tasks');
    const tasksSubEl = document.getElementById('dash-stat-tasks-sub');
    const pointsEl = document.getElementById('dash-stat-points');
    const badgesSubEl = document.getElementById('dash-stat-badges-sub');
    const statusPrayerBadge = document.getElementById('dash-status-prayer-badge');
    const statusTasksBadge = document.getElementById('dash-status-tasks-badge');

    const prayersDetailTbody = document.getElementById('dash-prayers-detail-tbody');
    const tasksDetailTbody = document.getElementById('dash-tasks-detail-tbody');
    const backlogContainer = document.getElementById('dash-backlog-container');
    const backlogSummaryBadge = document.getElementById('dash-backlog-summary-badge');

    if (!selectedDashClass) {
        if (studentsEl) studentsEl.textContent = '0';
        if (prayerEl) prayerEl.textContent = '0%';
        if (prayerSubEl) prayerSubEl.textContent = '0 of 0 Recorded';
        if (tasksEl) tasksEl.textContent = '0%';
        if (tasksSubEl) tasksSubEl.textContent = '0 Tasks Completed';
        if (pointsEl) pointsEl.textContent = '0';
        if (badgesSubEl) badgesSubEl.textContent = '0 Badges Active';
        if (prayersDetailTbody) prayersDetailTbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 font-bold">No class selected.</td></tr>`;
        if (tasksDetailTbody) tasksDetailTbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400 font-bold">No class selected.</td></tr>`;
        if (backlogContainer) backlogContainer.innerHTML = `<div class="p-6 text-center text-slate-400 font-bold text-xs">Please select a class to view status.</div>`;
        return;
    }

    const classStudents = allStudents.filter(s => isClassInDutyScope(s.class, [selectedDashClass]) && s.status !== 'alumni');
    const totalStudents = classStudents.length;
    if (studentsEl) studentsEl.textContent = totalStudents;

    const todayDate = getTodayDateString();

    // 1. Fetch Today's Prayer Record
    let prayerLoggedCount = 0;
    let prayerRecs = {};
    try {
        const prayerDocId = `${currentAcademicYear}__${selectedDashClass}__${todayDate}`;
        const pSnap = await getDoc(doc(db, `${BASE_PATH}/ibadah`, prayerDocId));
        if (pSnap.exists()) {
            prayerRecs = pSnap.data().records || {};
            classStudents.forEach(st => {
                if (prayerRecs[st.id] && (prayerRecs[st.id].subh || prayerRecs[st.id].zuhr || prayerRecs[st.id].asr || prayerRecs[st.id].maghrib || prayerRecs[st.id].isha)) {
                    prayerLoggedCount++;
                }
            });
        }
    } catch (_) {}

    const prayerPct = totalStudents > 0 ? Math.round((prayerLoggedCount / totalStudents) * 100) : 0;
    if (prayerEl) prayerEl.textContent = `${prayerPct}%`;
    if (prayerSubEl) prayerSubEl.textContent = `${prayerLoggedCount} of ${totalStudents} Recorded`;

    if (statusPrayerBadge) {
        if (prayerLoggedCount === totalStudents && totalStudents > 0) {
            statusPrayerBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300';
            statusPrayerBadge.textContent = 'Completed';
        } else if (prayerLoggedCount > 0) {
            statusPrayerBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300';
            statusPrayerBadge.textContent = 'Partially Logged';
        } else {
            statusPrayerBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-600';
            statusPrayerBadge.textContent = 'Pending';
        }
    }

    // Populate Itemized Prayers Table
    const activePrayers = getAllActivePrayers();
    if (prayersDetailTbody) {
        if (!totalStudents) {
            prayersDetailTbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 font-bold">No active students in Class ${escapeHtml(selectedDashClass)}.</td></tr>`;
        } else {
            prayersDetailTbody.innerHTML = activePrayers.map(p => {
                let jCount = 0;
                let aCount = 0;
                let qCount = 0;
                let recordedCount = 0;

                classStudents.forEach(st => {
                    const stRec = prayerRecs[st.id];
                    if (stRec && stRec[p.key]) {
                        recordedCount++;
                        if (stRec[p.key] === 'J') jCount++;
                        else if (stRec[p.key] === 'A') aCount++;
                        else if (stRec[p.key] === 'Q') qCount++;
                    }
                });

                const isComplete = recordedCount === totalStudents;
                const isPartial = recordedCount > 0 && recordedCount < totalStudents;
                let statusBadge = '';
                if (isComplete) {
                    statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">Complete</span>';
                } else if (isPartial) {
                    statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">${totalStudents - recordedCount} Pending</span>`;
                } else {
                    statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-500">Not Logged</span>';
                }

                return `
                    <tr class="hover:bg-slate-50/80">
                        <td class="py-2.5 px-3 font-black text-slate-800">
                            ${escapeHtml(p.name)}
                            ${p.isSunnah ? '<span class="text-[9px] text-amber-700 font-bold ml-1 uppercase">(Sunnah)</span>' : ''}
                        </td>
                        <td class="py-2.5 px-3 text-center font-bold text-slate-700">${recordedCount} / ${totalStudents}</td>
                        <td class="py-2.5 px-2 text-center font-black text-emerald-700 bg-emerald-50/40">${jCount}</td>
                        <td class="py-2.5 px-2 text-center font-black text-blue-700 bg-blue-50/40">${aCount}</td>
                        <td class="py-2.5 px-2 text-center font-black text-rose-700 bg-rose-50/40">${qCount}</td>
                        <td class="py-2.5 px-3 text-center">${statusBadge}</td>
                    </tr>`;
            }).join('');
        }
    }

    // 2. Fetch Today's Tasks Record (Daily, Weekly, Monthly)
    const cadences = ['daily', 'weekly', 'monthly'];
    const todayTaskComps = {};
    try {
        const tSnaps = await Promise.all(cadences.map(cad =>
            getDoc(doc(db, `${BASE_PATH}/taskCompletions`, `${currentAcademicYear}__${selectedDashClass}__${todayDate}__${cad}`))
        ));
        tSnaps.forEach(s => {
            if (s.exists()) {
                const c = s.data().completions || {};
                Object.keys(c).forEach(id => {
                    todayTaskComps[id] = Object.assign(todayTaskComps[id] || {}, c[id]);
                });
            }
        });
    } catch (_) {}

    let tasksCheckedCount = 0;
    let totalPossibleTasks = 0;

    if (tasksDetailTbody) {
        if (!taskDefsList.length) {
            tasksDetailTbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400 font-bold">No habits or tasks defined yet.</td></tr>`;
        } else if (!totalStudents) {
            tasksDetailTbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400 font-bold">No active students in Class ${escapeHtml(selectedDashClass)}.</td></tr>`;
        } else {
            tasksDetailTbody.innerHTML = taskDefsList.map(t => {
                let completedCount = 0;
                classStudents.forEach(st => {
                    totalPossibleTasks++;
                    if (todayTaskComps[st.id] && todayTaskComps[st.id][t.id]) {
                        completedCount++;
                        tasksCheckedCount++;
                    }
                });
                const pct = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;

                let cadenceBadge = '';
                if (t.cadence === 'daily') cadenceBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">Daily</span>';
                else if (t.cadence === 'weekly') cadenceBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">Weekly</span>';
                else cadenceBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">Monthly</span>';

                return `
                    <tr class="hover:bg-slate-50/80">
                        <td class="py-2.5 px-3">
                            <div class="font-extrabold text-slate-900">${escapeHtml(t.title)}</div>
                            <span class="text-[10px] text-amber-700 font-bold">+${t.points} pts</span>
                        </td>
                        <td class="py-2.5 px-3 text-center">${cadenceBadge}</td>
                        <td class="py-2.5 px-3 text-center font-bold text-slate-700">${completedCount} of ${totalStudents}</td>
                        <td class="py-2.5 px-3 text-center">
                            <div class="flex items-center justify-center gap-2">
                                <div class="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
                                    <div class="bg-blue-600 h-2 rounded-full transition-all" style="width: ${pct}%"></div>
                                </div>
                                <span class="text-[10px] font-black text-slate-600 min-w-[28px]">${pct}%</span>
                            </div>
                        </td>
                    </tr>`;
            }).join('');
        }
    }

    const tasksPct = totalPossibleTasks > 0 ? Math.round((tasksCheckedCount / totalPossibleTasks) * 100) : 0;
    if (tasksEl) tasksEl.textContent = `${tasksPct}%`;
    if (tasksSubEl) tasksSubEl.textContent = `${tasksCheckedCount} Tasks Completed`;

    if (statusTasksBadge) {
        if (tasksCheckedCount > 0) {
            statusTasksBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300';
            statusTasksBadge.textContent = 'Active Today';
        } else {
            statusTasksBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-600';
            statusTasksBadge.textContent = 'Pending';
        }
    }

    // 3. Overall Points & Badges Stat Cards
    let totalBadgesCount = 0;
    let aggregatePoints = 0;
    classStudents.forEach(student => {
        const attPts = (currentRewardsRubric.attendance || 5) * 12;
        const prayerPts = (currentRewardsRubric.jamaah || 15) * 5;
        const taskPts = (currentRewardsRubric.task || 10) * 3;
        const bonusList = studentBonusPointsMap[student.id] || [];
        const bonusPts = bonusList.reduce((acc, b) => acc + Number(b.points || 0), 0);
        const customBadges = studentCustomBadgesMap[student.id] || [];
        const autoBadges = [];
        const total = attPts + prayerPts + taskPts + bonusPts;
        if (total >= 200) autoBadges.push('Punctual Star');
        if (prayerPts >= 70) autoBadges.push('Prayer Champion');
        if (bonusPts > 0) autoBadges.push('Exemplary Adab');
        totalBadgesCount += autoBadges.length + customBadges.length;
        aggregatePoints += total;
    });

    if (pointsEl) pointsEl.textContent = aggregatePoints;
    if (badgesSubEl) badgesSubEl.textContent = `${totalBadgesCount} Badges Active`;

    // 4. Past 7 Days Backlog Scanner
    const pastDays = [];
    const now = new Date();
    for (let i = 1; i <= 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        pastDays.push(d.toISOString().split('T')[0]);
    }

    try {
        const backlogScanPromises = pastDays.map(async (dayStr) => {
            const prayerDocId = `${currentAcademicYear}__${selectedDashClass}__${dayStr}`;
            const tasksDocId = `${currentAcademicYear}__${selectedDashClass}__${dayStr}__daily`;

            const [pastPrayerSnap, pastTaskSnap] = await Promise.all([
                getDoc(doc(db, `${BASE_PATH}/ibadah`, prayerDocId)),
                getDoc(doc(db, `${BASE_PATH}/taskCompletions`, tasksDocId))
            ]);

            let prayerMissing = true;
            let prayerPartial = false;
            let pLoggedCount = 0;

            if (pastPrayerSnap.exists()) {
                const recs = pastPrayerSnap.data().records || {};
                classStudents.forEach(st => {
                    if (recs[st.id] && (recs[st.id].subh || recs[st.id].zuhr || recs[st.id].asr || recs[st.id].maghrib || recs[st.id].isha)) {
                        pLoggedCount++;
                    }
                });
                if (pLoggedCount > 0) {
                    prayerMissing = false;
                    if (pLoggedCount < totalStudents) {
                        prayerPartial = true;
                    }
                }
            }

            let tasksMissing = true;
            if (pastTaskSnap.exists()) {
                const comps = pastTaskSnap.data().completions || {};
                let anyChecked = false;
                classStudents.forEach(st => {
                    if (comps[st.id] && Object.values(comps[st.id]).some(Boolean)) {
                        anyChecked = true;
                    }
                });
                if (anyChecked) {
                    tasksMissing = false;
                }
            }

            const hasIssue = prayerMissing || prayerPartial || tasksMissing;
            return {
                date: dayStr,
                prayerMissing,
                prayerPartial,
                prayerLoggedCount: pLoggedCount,
                tasksMissing,
                hasIssue
            };
        });

        const backlogResults = await Promise.all(backlogScanPromises);
        const incompleteDays = backlogResults.filter(r => r.hasIssue);

        if (backlogSummaryBadge) {
            if (incompleteDays.length === 0) {
                backlogSummaryBadge.className = 'text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300';
                backlogSummaryBadge.textContent = 'All Logs Up-to-Date (Past 7 Days)';
            } else {
                backlogSummaryBadge.className = 'text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-300';
                backlogSummaryBadge.textContent = `${incompleteDays.length} Pending Day${incompleteDays.length > 1 ? 's' : ''}`;
            }
        }

        if (backlogContainer) {
            if (incompleteDays.length === 0) {
                backlogContainer.innerHTML = `
                    <div class="p-6 text-center text-emerald-700 font-bold text-xs bg-emerald-50 rounded-xl border border-emerald-200">
                        <i class="fas fa-check-circle mr-1.5 text-emerald-600"></i>
                        All prayer and daily habit logs for the past 7 days are complete!
                    </div>`;
            } else {
                backlogContainer.innerHTML = incompleteDays.map(item => {
                    const dateObj = new Date(item.date + 'T00:00:00');
                    const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

                    let prayerBadge = '';
                    let prayerAction = '';
                    if (item.prayerMissing) {
                        prayerBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">Prayer Not Logged</span>`;
                        prayerAction = `<button type="button" class="btn-resolve-backlog px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] transition cursor-pointer shadow-2xs" data-target="tab-prayer" data-date="${item.date}"><i class="fas fa-hands-praying mr-1"></i>Log Prayer</button>`;
                    } else if (item.prayerPartial) {
                        prayerBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">Prayer Partial (${totalStudents - item.prayerLoggedCount} pending)</span>`;
                        prayerAction = `<button type="button" class="btn-resolve-backlog px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] transition cursor-pointer shadow-2xs" data-target="tab-prayer" data-date="${item.date}"><i class="fas fa-hands-praying mr-1"></i>Complete Prayer</button>`;
                    } else {
                        prayerBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">Prayer Complete</span>`;
                    }

                    let taskBadge = '';
                    let taskAction = '';
                    if (item.tasksMissing) {
                        taskBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">Daily Habits Missing</span>`;
                        taskAction = `<button type="button" class="btn-resolve-backlog px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] transition cursor-pointer shadow-2xs" data-target="tab-tasks" data-date="${item.date}"><i class="fas fa-list-check mr-1"></i>Log Habits</button>`;
                    } else {
                        taskBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">Habits Complete</span>`;
                    }

                    return `
                        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-amber-50/50 transition flex-wrap gap-2">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xs shrink-0">
                                    <i class="fas fa-calendar-day"></i>
                                </div>
                                <div>
                                    <div class="flex items-center gap-1.5">
                                        <span class="font-extrabold text-xs text-slate-900">${formattedDate}</span>
                                        <span class="text-[10px] font-semibold text-slate-500">(${dayName})</span>
                                    </div>
                                    <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                                        ${prayerBadge}
                                        ${taskBadge}
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 ml-auto">
                                ${prayerAction}
                                ${taskAction}
                            </div>
                        </div>`;
                }).join('');
            }
        }
    } catch (err) {
        console.warn('Failed to scan recent backlog:', err);
    }
};

// =========================================================================
// MODULE 2: MANAGE & ADD TASKS LOGIC (WITH EDIT & DELETE + CONFIRMATION)
// =========================================================================
const getDefaultTasksList = () => [
    { id: 'task_d1', title: 'Morning Adhkar & Duas', cadence: 'daily', dayOfWeek: '', dayOfMonth: '', points: 5 },
    { id: 'task_d2', title: 'Uniform & Personal Cleanliness', cadence: 'daily', dayOfWeek: '', dayOfMonth: '', points: 5 },
    { id: 'task_d3', title: 'Class Kit & Books Prepared', cadence: 'daily', dayOfWeek: '', dayOfMonth: '', points: 5 },
    { id: 'task_w1', title: 'Surah Al-Kahf Friday Recitation', cadence: 'weekly', dayOfWeek: 'Friday', dayOfMonth: '', points: 15 },
    { id: 'task_w2', title: 'Weekly Hifz Review (Dhor)', cadence: 'weekly', dayOfWeek: '', dayOfMonth: '', points: 10 },
    { id: 'task_m1', title: 'Monthly Charity (Sadaqah Drive)', cadence: 'monthly', dayOfWeek: '', dayOfMonth: '', points: 20 },
    { id: 'task_m2', title: 'Family Seerah Reading Project', cadence: 'monthly', dayOfWeek: '', dayOfMonth: '1st of Month', points: 25 }
];

const updateCadenceButtonLabels = () => {
    const weeklyTasksWithDay = taskDefsList.filter(t => t.cadence === 'weekly' && t.dayOfWeek);
    const weeklyBtn = document.getElementById('btn-tasks-cadence-weekly');
    if (weeklyBtn) {
        if (weeklyTasksWithDay.length === 1) {
            weeklyBtn.textContent = `Weekly (${weeklyTasksWithDay[0].dayOfWeek})`;
        } else if (weeklyTasksWithDay.length > 1) {
            weeklyBtn.textContent = 'Weekly (Scheduled)';
        } else {
            weeklyBtn.textContent = 'Weekly';
        }
    }

    const monthlyTasksWithDate = taskDefsList.filter(t => t.cadence === 'monthly' && t.dayOfMonth);
    const monthlyBtn = document.getElementById('btn-tasks-cadence-monthly');
    if (monthlyBtn) {
        if (monthlyTasksWithDate.length === 1) {
            monthlyBtn.textContent = `Monthly (${monthlyTasksWithDate[0].dayOfMonth})`;
        } else if (monthlyTasksWithDate.length > 1) {
            monthlyBtn.textContent = 'Monthly (Scheduled)';
        } else {
            monthlyBtn.textContent = 'Monthly';
        }
    }
};

const loadTaskDefsTable = () => {
    const tbody = document.getElementById('task-defs-table-tbody');
    if (!tbody) return;

    let filtered = taskDefsList;
    if (taskDefFilter !== 'all') {
        filtered = taskDefsList.filter(t => t.cadence === taskDefFilter);
    }

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-bold">No tasks found for this filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((task, idx) => {
        let cadenceBadge = '';
        if (task.cadence === 'daily') {
            cadenceBadge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">Daily</span>';
        } else if (task.cadence === 'weekly') {
            cadenceBadge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">Weekly</span>';
        } else {
            cadenceBadge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">Monthly</span>';
        }

        let scheduleDetail = 'Unfixed';
        if (task.cadence === 'weekly' && task.dayOfWeek) {
            scheduleDetail = `Every ${escapeHtml(task.dayOfWeek)}`;
        } else if (task.cadence === 'monthly' && task.dayOfMonth) {
            scheduleDetail = escapeHtml(task.dayOfMonth);
        } else if (task.cadence === 'daily') {
            scheduleDetail = 'Every Day';
        }

        return `
            <tr class="hover:bg-slate-50/80">
                <td class="py-2.5 px-3 font-bold text-slate-400">${idx + 1}</td>
                <td class="py-2.5 px-4 font-black text-slate-900">${escapeHtml(task.title)}</td>
                <td class="py-2.5 px-3 text-center">${cadenceBadge}</td>
                <td class="py-2.5 px-3 text-center font-bold text-slate-600">${scheduleDetail}</td>
                <td class="py-2.5 px-3 text-center font-black text-amber-700">+${task.points} pts</td>
                <td class="py-2.5 px-3 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button type="button" class="btn-edit-task-def p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 font-bold text-xs cursor-pointer" data-task-id="${task.id}" title="Edit Task">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" class="btn-delete-task-def p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 font-bold text-xs cursor-pointer" data-task-id="${task.id}" title="Delete Task">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
};

const openEditTaskModal = (taskId) => {
    const task = taskDefsList.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-title').value = task.title || '';
    document.getElementById('edit-task-cadence').value = task.cadence || 'daily';
    document.getElementById('edit-task-points').value = task.points || 5;

    const wrapperWeek = document.getElementById('wrapper-edit-task-day-week');
    const wrapperMonth = document.getElementById('wrapper-edit-task-day-month');
    const selectWeek = document.getElementById('edit-task-day-week');
    const selectMonth = document.getElementById('edit-task-day-month');

    if (selectWeek) selectWeek.value = task.dayOfWeek || '';
    if (selectMonth) selectMonth.value = task.dayOfMonth || '';

    if (task.cadence === 'weekly') {
        wrapperWeek?.classList.remove('hidden');
        wrapperMonth?.classList.add('hidden');
    } else if (task.cadence === 'monthly') {
        wrapperWeek?.classList.add('hidden');
        wrapperMonth?.classList.remove('hidden');
    } else {
        wrapperWeek?.classList.add('hidden');
        wrapperMonth?.classList.add('hidden');
    }

    openModal('modal-edit-task-def');
};

const saveTaskDefinitionsToFirestore = async (tasks) => {
    try {
        await setDoc(doc(db, `${BASE_PATH}/settings`, 'taskDefinitions'), {
            tasks,
            updatedAt: Date.now()
        }, { merge: true });
        taskDefsList = tasks;
        updateCadenceButtonLabels();
        loadTaskDefsTable();
        showToast('Task configurations updated successfully!', 'success');
    } catch (err) {
        alert('Failed to save task definitions: ' + err.message);
    }
};

// =========================================================================
// MODULE 3: HABITS & TASKS CHECKLIST (WITH 2D FROZEN TABLE & CADENCE ALL)
// =========================================================================
const loadTasksRoster = async () => {
    const allowed = getAllowedClassesForTeacher();
    const classVal = document.getElementById('tasks-class-select')?.value;
    selectedTasksClass = (classVal && allowed.some(c => isClassInDutyScope(classVal, [c]))) ? classVal : (allowed[0] || '');
    selectedTasksDate = document.getElementById('tasks-date-input')?.value || getTodayDateString();
    const thead = document.getElementById('tasks-roster-thead');
    const tbody = document.getElementById('tasks-roster-tbody');

    setTasksUnsavedState(false);

    if (!selectedTasksClass) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 font-bold">Please select a class.</td></tr>`;
        return;
    }

    let currentCadenceTasks = [];
    if (currentTaskCadence === 'all') {
        currentCadenceTasks = taskDefsList;
    } else {
        currentCadenceTasks = taskDefsList.filter(t => t.cadence === currentTaskCadence);
    }

    try {
        if (currentTaskCadence === 'all') {
            const cadences = ['daily', 'weekly', 'monthly'];
            const snaps = await Promise.all(cadences.map(cad =>
                getDoc(doc(db, `${BASE_PATH}/taskCompletions`, `${currentAcademicYear}__${selectedTasksClass}__${selectedTasksDate}__${cad}`))
            ));
            taskCompletionsMap = {};
            snaps.forEach(snap => {
                if (snap.exists()) {
                    const comps = snap.data().completions || {};
                    Object.keys(comps).forEach(sId => {
                        if (!taskCompletionsMap[sId]) taskCompletionsMap[sId] = {};
                        Object.assign(taskCompletionsMap[sId], comps[sId]);
                    });
                }
            });
        } else {
            const docId = `${currentAcademicYear}__${selectedTasksClass}__${selectedTasksDate}__${currentTaskCadence}`;
            const snap = await getDoc(doc(db, `${BASE_PATH}/taskCompletions`, docId));
            taskCompletionsMap = snap.exists() ? (snap.data().completions || {}) : {};
        }
    } catch (_) {
        taskCompletionsMap = {};
    }

    if (thead) {
        thead.innerHTML = `
            <tr class="bg-slate-100 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-200">
                <th class="sticky-corner-idx py-2.5 px-3">#</th>
                <th class="sticky-corner-adm py-2.5 px-3">Adm No</th>
                <th class="sticky-corner-name py-2.5 px-4 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">Student Name</th>
                ${currentCadenceTasks.map(t => {
                    let schedTag = '';
                    if (t.cadence === 'weekly' && t.dayOfWeek) schedTag = `<div class="text-[9px] text-amber-700 font-normal">(${escapeHtml(t.dayOfWeek)})</div>`;
                    if (t.cadence === 'monthly' && t.dayOfMonth) schedTag = `<div class="text-[9px] text-purple-700 font-normal">(${escapeHtml(t.dayOfMonth)})</div>`;
                    let cadenceTag = currentTaskCadence === 'all' ? `<div class="text-[9px] text-slate-400 font-bold uppercase">${t.cadence}</div>` : '';
                    return `
                        <th class="py-2 px-3 text-center min-w-[130px]">
                            ${cadenceTag}
                            <div class="font-extrabold text-slate-800 text-[11px] leading-tight">${escapeHtml(t.title)} (${t.points}p)</div>
                            ${schedTag}
                            <button type="button" class="btn-bulk-task-col mt-1 px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-600 hover:text-white text-amber-900 font-black text-[10px] transition cursor-pointer" data-task-id="${t.id}" title="Toggle All for ${escapeHtml(t.title)}">
                                <i class="fas fa-check-double mr-1"></i>All
                            </button>
                        </th>`;
                }).join('')}
                <th class="py-2.5 px-3 text-center min-w-[80px]">Score</th>
            </tr>`;
    }

    if (!tbody) return;

    const classStudents = allStudents.filter(s => isClassInDutyScope(s.class, [selectedTasksClass]) && s.status !== 'alumni');
    if (!classStudents.length) {
        tbody.innerHTML = `<tr><td colspan="${currentCadenceTasks.length + 4}" class="p-8 text-center text-slate-400 font-bold">No active students in Class ${selectedTasksClass}.</td></tr>`;
        return;
    }

    tbody.innerHTML = classStudents.map((student, idx) => {
        const studentTasks = taskCompletionsMap[student.id] || {};
        let score = 0;

        return `
            <tr class="hover:bg-slate-50/80 group" data-student-id="${student.id}">
                <td class="sticky-col-idx py-2 px-3 font-bold text-slate-400 group-hover:bg-slate-50">${idx + 1}</td>
                <td class="sticky-col-adm py-2 px-3 font-mono font-bold text-slate-600 group-hover:bg-slate-50">${escapeHtml(student.adm || student.admNo || '-')}</td>
                <td class="sticky-col-name py-2 px-4 font-black text-slate-900 group-hover:bg-slate-50 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">${escapeHtml(student.name || '--')}</td>
                ${currentCadenceTasks.map(t => {
                    const done = Boolean(studentTasks[t.id]);
                    if (done) score += Number(t.points || 0);
                    return `
                        <td class="py-2 px-3 text-center" data-task-id="${t.id}">
                            <input type="checkbox" class="task-check-box w-4 h-4 text-amber-600 rounded cursor-pointer" data-student-id="${student.id}" data-task-id="${t.id}" ${done ? 'checked' : ''}>
                        </td>`;
                }).join('')}
                <td class="py-2 px-3 text-center font-black text-amber-700 student-task-score">${score} pts</td>
            </tr>`;
    }).join('');
};

const saveTasksCompletionsToFirestore = async () => {
    if (!selectedTasksClass) return alert('Please select a class first.');
    if (!isSuperAdmin && teacherAssignedClasses.length > 0 && !isClassInDutyScope(selectedTasksClass, teacherAssignedClasses)) {
        return alert('You can only save task completions for your assigned classes.');
    }

    try {
        if (currentTaskCadence === 'all') {
            const cadences = ['daily', 'weekly', 'monthly'];
            const savePromises = cadences.map(cad => {
                const cadenceTasks = taskDefsList.filter(t => t.cadence === cad);
                const cadenceComps = {};
                Object.keys(taskCompletionsMap).forEach(sId => {
                    cadenceComps[sId] = {};
                    cadenceTasks.forEach(t => {
                        if (taskCompletionsMap[sId] && taskCompletionsMap[sId][t.id] !== undefined) {
                            cadenceComps[sId][t.id] = Boolean(taskCompletionsMap[sId][t.id]);
                        }
                    });
                });
                const docId = `${currentAcademicYear}__${selectedTasksClass}__${selectedTasksDate}__${cad}`;
                return setDoc(doc(db, `${BASE_PATH}/taskCompletions`, docId), {
                    completions: cadenceComps,
                    updatedAt: Date.now()
                }, { merge: true });
            });
            await Promise.all(savePromises);
        } else {
            const docId = `${currentAcademicYear}__${selectedTasksClass}__${selectedTasksDate}__${currentTaskCadence}`;
            await setDoc(doc(db, `${BASE_PATH}/taskCompletions`, docId), {
                completions: taskCompletionsMap,
                updatedAt: Date.now()
            }, { merge: true });
        }

        setTasksUnsavedState(false);
        showToast('Habits and tasks saved successfully!', 'success');
    } catch (err) {
        alert('Failed to save task completions: ' + err.message);
    }
};

// =========================================================================
// MODULE 4: PRAYER TRACKER (WITH 2D FROZEN TABLE, CUSTOM SUNNAH & EXPLICIT SAVE)
// =========================================================================
const DEFAULT_FARD_PRAYERS = [
    { key: 'subh', name: 'Subh' },
    { key: 'zuhr', name: 'Zuhr' },
    { key: 'asr', name: 'Asr' },
    { key: 'maghrib', name: 'Maghrib' },
    { key: 'isha', name: 'Isha' }
];

const getAllActivePrayers = () => {
    return [
        ...DEFAULT_FARD_PRAYERS,
        ...customPrayersList.map(c => ({ key: c.id, name: c.name, isSunnah: true }))
    ];
};

const renderCustomPrayersListInModal = () => {
    const container = document.getElementById('custom-prayers-list');
    if (!container) return;

    if (!customPrayersList.length) {
        container.innerHTML = `<div class="p-3 text-center text-slate-400 font-bold bg-slate-50 rounded-xl">No extra Sunnah prayers added yet.</div>`;
        return;
    }

    container.innerHTML = customPrayersList.map(p => `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <span class="font-bold text-slate-800">${escapeHtml(p.name)}</span>
            <div class="flex items-center gap-1">
                <button type="button" class="btn-edit-custom-prayer p-1 text-amber-600 hover:bg-amber-50 rounded font-bold cursor-pointer" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="Edit Name">
                    <i class="fas fa-edit"></i>
                </button>
                <button type="button" class="btn-remove-custom-prayer p-1 text-rose-600 hover:bg-rose-50 rounded font-bold cursor-pointer" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="Remove Prayer">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
};

const loadPrayerRoster = async () => {
    const allowed = getAllowedClassesForTeacher();
    const classVal = document.getElementById('prayer-class-select')?.value;
    selectedPrayerClass = (classVal && allowed.some(c => isClassInDutyScope(classVal, [c]))) ? classVal : (allowed[0] || '');
    selectedPrayerDate = document.getElementById('prayer-date-input')?.value || getTodayDateString();
    const thead = document.getElementById('prayer-roster-thead');
    const tbody = document.getElementById('prayer-roster-tbody');

    setPrayerUnsavedState(false);

    if (!selectedPrayerClass) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 font-bold">Please select a class.</td></tr>`;
        return;
    }

    try {
        const docId = `${currentAcademicYear}__${selectedPrayerClass}__${selectedPrayerDate}`;
        const snap = await getDoc(doc(db, `${BASE_PATH}/ibadah`, docId));
        prayerRecordsMap = snap.exists() ? (snap.data().records || {}) : {};
    } catch (_) {
        prayerRecordsMap = {};
    }

    const activePrayers = getAllActivePrayers();

    if (thead) {
        thead.innerHTML = `
            <tr class="bg-slate-100 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-200">
                <th class="sticky-corner-idx py-2.5 px-3">#</th>
                <th class="sticky-corner-adm py-2.5 px-3">Adm No</th>
                <th class="sticky-corner-name py-2.5 px-4 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">Student Name</th>
                ${activePrayers.map(p => `
                    <th class="py-2 px-2 text-center min-w-[125px]" data-prayer-col="${p.key}">
                        <div class="font-extrabold text-slate-900 text-xs">${escapeHtml(p.name)}</div>
                        ${p.isSunnah ? '<span class="text-[9px] text-amber-700 font-bold uppercase">(Sunnah)</span>' : ''}
                        <div class="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white shadow-2xs mt-1">
                            <button type="button" class="btn-prayer-bulk-mark px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer bg-emerald-100 hover:bg-emerald-600 hover:text-white text-emerald-800 transition" data-prayer="${p.key}" data-val="J" title="Mark All ${escapeHtml(p.name)} as Jama'ah">J</button>
                            <button type="button" class="btn-prayer-bulk-mark px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer bg-blue-100 hover:bg-blue-600 hover:text-white text-blue-800 transition ml-0.5" data-prayer="${p.key}" data-val="A" title="Mark All ${escapeHtml(p.name)} as Ada'">A</button>
                            <button type="button" class="btn-prayer-bulk-mark px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer bg-rose-100 hover:bg-rose-600 hover:text-white text-rose-800 transition ml-0.5" data-prayer="${p.key}" data-val="Q" title="Mark All ${escapeHtml(p.name)} as Qaza">Q</button>
                        </div>
                    </th>
                `).join('')}
            </tr>`;
    }

    if (!tbody) return;

    const classStudents = allStudents.filter(s => isClassInDutyScope(s.class, [selectedPrayerClass]) && s.status !== 'alumni');
    if (!classStudents.length) {
        tbody.innerHTML = `<tr><td colspan="${activePrayers.length + 3}" class="p-8 text-center text-slate-400 font-bold">No active students in Class ${selectedPrayerClass}.</td></tr>`;
        return;
    }

    tbody.innerHTML = classStudents.map((student, idx) => {
        const rec = prayerRecordsMap[student.id] || {};

        return `
            <tr class="hover:bg-slate-50/80 group" data-student-id="${student.id}">
                <td class="sticky-col-idx py-2.5 px-3 font-bold text-slate-400 group-hover:bg-slate-50">${idx + 1}</td>
                <td class="sticky-col-adm py-2.5 px-3 font-mono font-bold text-slate-600 group-hover:bg-slate-50">${escapeHtml(student.adm || student.admNo || '-')}</td>
                <td class="sticky-col-name py-2.5 px-4 font-black text-slate-900 group-hover:bg-slate-50 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">${escapeHtml(student.name || '--')}</td>
                ${activePrayers.map(p => {
                    const status = rec[p.key] || 'A';
                    return `
                        <td class="py-2 px-2 text-center" data-prayer="${p.key}">
                            <div class="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 prayer-pill-group">
                                <button type="button" class="prayer-toggle-btn px-2 py-0.5 rounded text-[10px] font-black cursor-pointer ${status === 'J' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500'}" data-val="J">J</button>
                                <button type="button" class="prayer-toggle-btn px-2 py-0.5 rounded text-[10px] font-black cursor-pointer ${status === 'A' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500'}" data-val="A">A</button>
                                <button type="button" class="prayer-toggle-btn px-2 py-0.5 rounded text-[10px] font-black cursor-pointer ${status === 'Q' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-500'}" data-val="Q">Q</button>
                            </div>
                        </td>`;
                }).join('')}
            </tr>`;
    }).join('');
};

const savePrayerRecords = async () => {
    if (!selectedPrayerClass) return alert('Please select a class first.');
    if (!isSuperAdmin && teacherAssignedClasses.length > 0 && !isClassInDutyScope(selectedPrayerClass, teacherAssignedClasses)) {
        return alert('You can only save prayer records for your assigned classes.');
    }

    const rows = document.querySelectorAll('#prayer-roster-tbody tr[data-student-id]');
    const updated = {};
    const activePrayers = getAllActivePrayers();

    rows.forEach(row => {
        const studentId = row.dataset.studentId;
        const studentRec = {};
        activePrayers.forEach(p => {
            const cell = row.querySelector(`[data-prayer="${p.key}"]`);
            if (cell) {
                const isJ = Boolean(cell.querySelector('.prayer-toggle-btn.bg-emerald-600'));
                const isQ = Boolean(cell.querySelector('.prayer-toggle-btn.bg-rose-600'));
                studentRec[p.key] = isJ ? 'J' : (isQ ? 'Q' : 'A');
            }
        });
        updated[studentId] = studentRec;
    });

    prayerRecordsMap = updated;

    const docId = `${currentAcademicYear}__${selectedPrayerClass}__${selectedPrayerDate}`;
    try {
        await setDoc(doc(db, `${BASE_PATH}/ibadah`, docId), {
            records: prayerRecordsMap,
            updatedAt: Date.now()
        }, { merge: true });

        setPrayerUnsavedState(false);
        showToast('Prayer log saved successfully!', 'success');
    } catch (err) {
        alert('Failed to save prayer records: ' + err.message);
    }
};

// =========================================================================
// MODULE 5: REWARDS, POINTS, RUBRIC & BADGES LEADERBOARD LOGIC
// =========================================================================
const updatePrayerStatusLegendPoints = () => {
    const elJ = document.getElementById('legend-pts-jamaah');
    const elA = document.getElementById('legend-pts-adaa');
    const elQ = document.getElementById('legend-pts-qaza');
    const elS = document.getElementById('legend-pts-sunnah');

    const jVal = Number(currentRewardsRubric.jamaah ?? 15);
    const aVal = Number(currentRewardsRubric.adaa ?? 10);
    const qVal = Number(currentRewardsRubric.qaza ?? 0);
    const sVal = Number(currentRewardsRubric.sunnah ?? 5);

    if (elJ) elJ.textContent = `${jVal >= 0 ? '+' : ''}${jVal}`;
    if (elA) elA.textContent = `${aVal >= 0 ? '+' : ''}${aVal}`;
    if (elQ) elQ.textContent = `${qVal > 0 ? '+' : ''}${qVal}`;
    if (elS) elS.textContent = `${sVal >= 0 ? '+' : ''}${sVal}`;
};

const openPrayerPointsConfigModal = () => {
    const inJ = document.getElementById('modal-prayer-pts-jamaah');
    const inA = document.getElementById('modal-prayer-pts-adaa');
    const inQ = document.getElementById('modal-prayer-pts-qaza');
    const inS = document.getElementById('modal-prayer-pts-sunnah');

    if (inJ) inJ.value = currentRewardsRubric.jamaah ?? 15;
    if (inA) inA.value = currentRewardsRubric.adaa ?? 10;
    if (inQ) inQ.value = currentRewardsRubric.qaza ?? 0;
    if (inS) inS.value = currentRewardsRubric.sunnah ?? 5;

    openModal('modal-prayer-points-config');
};

const savePrayerPointsConfig = async () => {
    const inJ = document.getElementById('modal-prayer-pts-jamaah');
    const inA = document.getElementById('modal-prayer-pts-adaa');
    const inQ = document.getElementById('modal-prayer-pts-qaza');
    const inS = document.getElementById('modal-prayer-pts-sunnah');

    const jamaah = inJ ? Number(inJ.value) : (currentRewardsRubric.jamaah ?? 15);
    const adaa = inA ? Number(inA.value) : (currentRewardsRubric.adaa ?? 10);
    const qaza = inQ ? Number(inQ.value) : (currentRewardsRubric.qaza ?? 0);
    const sunnah = inS ? Number(inS.value) : (currentRewardsRubric.sunnah ?? 5);

    currentRewardsRubric = {
        ...currentRewardsRubric,
        jamaah,
        adaa,
        qaza,
        sunnah
    };

    try {
        await setDoc(doc(db, `${BASE_PATH}/rewardSettings`, currentAcademicYear), {
            points: currentRewardsRubric,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-prayer-points-config');
        updatePrayerStatusLegendPoints();
        showToast('Prayer points rules updated & applied to all prayers!', 'success');
        if (selectedPrayerClass) loadPrayerRoster();
    } catch (err) {
        alert('Failed to save prayer points rules: ' + err.message);
    }
};

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
    updatePrayerStatusLegendPoints();
};

const openRewardsSettingsModal = () => {
    const attInput = document.getElementById('rubric-pts-attendance');
    const jamInput = document.getElementById('rubric-pts-jamaah');
    const adaaInput = document.getElementById('rubric-pts-adaa');
    const qazaInput = document.getElementById('rubric-pts-qaza');
    const sunnahInput = document.getElementById('rubric-pts-sunnah');
    const taskInput = document.getElementById('rubric-pts-task');

    if (attInput) attInput.value = currentRewardsRubric.attendance ?? 5;
    if (jamInput) jamInput.value = currentRewardsRubric.jamaah ?? 15;
    if (adaaInput) adaaInput.value = currentRewardsRubric.adaa ?? 10;
    if (qazaInput) qazaInput.value = currentRewardsRubric.qaza ?? 0;
    if (sunnahInput) sunnahInput.value = currentRewardsRubric.sunnah ?? 5;
    if (taskInput) taskInput.value = currentRewardsRubric.task ?? 10;

    openModal('modal-rewards-settings');
};

const saveRewardsRubric = async () => {
    const attendance = Number(document.getElementById('rubric-pts-attendance')?.value || 5);
    const jamaah = Number(document.getElementById('rubric-pts-jamaah')?.value || 15);
    const adaa = Number(document.getElementById('rubric-pts-adaa')?.value || 10);
    const qaza = Number(document.getElementById('rubric-pts-qaza')?.value || 0);
    const sunnah = Number(document.getElementById('rubric-pts-sunnah')?.value || 5);
    const task = Number(document.getElementById('rubric-pts-task')?.value || 10);

    currentRewardsRubric = { attendance, jamaah, adaa, qaza, sunnah, task, bonus: 10 };

    try {
        await setDoc(doc(db, `${BASE_PATH}/rewardSettings`, currentAcademicYear), {
            points: currentRewardsRubric,
            updatedAt: Date.now()
        }, { merge: true });

        closeModal('modal-rewards-settings');
        updatePrayerStatusLegendPoints();
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
        const attPts = (currentRewardsRubric.attendance ?? 5) * 12;
        const prayerPts = (currentRewardsRubric.jamaah ?? 15) * 4 + (currentRewardsRubric.adaa ?? 10) * 1;
        const tasksPts = (currentRewardsRubric.task ?? 10) * 3;

        const bonusList = studentBonusPointsMap[student.id] || [];
        const bonusPts = bonusList.reduce((acc, b) => acc + Number(b.points || 0), 0);

        const total = attPts + prayerPts + tasksPts + bonusPts;

        const autoBadges = [];
        if (total >= 200) autoBadges.push('Punctual Star');
        if (prayerPts >= 60) autoBadges.push('Prayer Champion');
        if (bonusPts > 0) autoBadges.push('Exemplary Adab');

        const customBadges = studentCustomBadgesMap[student.id] || [];

        return {
            student,
            attPts,
            prayerPts,
            tasksPts,
            bonusPts,
            total,
            autoBadges,
            customBadges
        };
    });

    scores.sort((a, b) => b.total - a.total);

    if (scores.length) {
        const top = scores[0];
        if (topNameEl) topNameEl.textContent = top.student.name || 'Student';
        if (topPtsEl) topPtsEl.textContent = `${top.total} Total Points`;

        const avg = Math.round(scores.reduce((a, b) => a + b.total, 0) / scores.length);
        if (classAvgEl) classAvgEl.textContent = avg;

        const totalB = scores.reduce((a, b) => a + (b.autoBadges.length + b.customBadges.length), 0);
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
                <td class="py-2.5 px-3 text-center font-bold text-emerald-600">${item.prayerPts}</td>
                <td class="py-2.5 px-3 text-center font-bold text-slate-600">${item.tasksPts}</td>
                <td class="py-2.5 px-3 text-center font-bold text-purple-600">+${item.bonusPts}</td>
                <td class="py-2.5 px-3 text-center font-black text-sm text-amber-600">${item.total}</td>
                <td class="py-2.5 px-4">
                    <div class="flex items-center gap-1 flex-wrap">
                        ${item.autoBadges.map(b => `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-900 border border-amber-200">${escapeHtml(b)}</span>`).join('')}
                        ${item.customBadges.map(cb => `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-900 border border-purple-200 flex items-center gap-1"><i class="fas fa-medal text-[9px] text-purple-600"></i>${escapeHtml(cb)}</span>`).join('')}
                        <button type="button" class="btn-open-badge-modal px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer" data-student-id="${item.student.id}">
                            + Badge
                        </button>
                    </div>
                </td>
                <td class="py-2.5 px-3 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button type="button" class="btn-view-bonus-history p-1.5 rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 font-bold text-xs cursor-pointer" data-student-id="${item.student.id}" title="View & Edit Points History">
                            <i class="fas fa-history mr-1"></i>History
                        </button>
                        <button type="button" class="btn-award-single-student p-1.5 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 font-bold text-xs cursor-pointer" data-student-id="${item.student.id}" title="Award Bonus Points">
                            <i class="fas fa-medal mr-1"></i>+Award
                        </button>
                    </div>
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
        showToast(`Awarded +${points} points to ${student.name}!`, 'success');
        loadRewardsLeaderboard();
    } catch (err) {
        alert('Failed to award points: ' + err.message);
    }
};

// --- Student Bonus Points History Modal (View, Edit & Delete) ---
const openStudentBonusHistoryModal = (studentId) => {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('modal-bonus-history-student-id').value = studentId;
    const subEl = document.getElementById('modal-bonus-history-student-sub');
    if (subEl) subEl.textContent = `${student.name} (Adm: ${student.adm || student.admNo || '--'}, Class ${student.class})`;

    renderStudentBonusHistoryTable(studentId);
    openModal('modal-student-bonus-history');
};

const renderStudentBonusHistoryTable = (studentId) => {
    const tbody = document.getElementById('bonus-history-table-tbody');
    const totalEl = document.getElementById('modal-bonus-history-total');
    if (!tbody) return;

    const bonusList = studentBonusPointsMap[studentId] || [];
    const totalPts = bonusList.reduce((acc, b) => acc + Number(b.points || 0), 0);
    if (totalEl) totalEl.textContent = `${totalPts} pts`;

    if (!bonusList.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 font-bold">No bonus points awarded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = bonusList.map((entry) => `
        <tr class="hover:bg-slate-50/80">
            <td class="py-2 px-3 font-mono font-bold text-slate-600">${escapeHtml(entry.date || '--')}</td>
            <td class="py-2 px-3 font-black text-amber-700">+${entry.points} pts</td>
            <td class="py-2 px-3 font-medium text-slate-800">${escapeHtml(entry.reason || '--')}</td>
            <td class="py-2 px-3 text-slate-500 font-semibold">${escapeHtml(entry.awardedBy || 'Staff')}</td>
            <td class="py-2 px-3 text-right">
                <div class="flex items-center justify-end gap-1">
                    <button type="button" class="btn-edit-bonus-entry p-1 text-amber-600 hover:bg-amber-50 rounded font-bold cursor-pointer" data-student-id="${studentId}" data-entry-id="${entry.id}" title="Edit Award">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn-delete-bonus-entry p-1 text-rose-600 hover:bg-rose-50 rounded font-bold cursor-pointer" data-student-id="${studentId}" data-entry-id="${entry.id}" title="Delete Award">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
};

const editStudentBonusEntry = async (studentId, entryId) => {
    const bonusList = studentBonusPointsMap[studentId] || [];
    const entry = bonusList.find(b => b.id === entryId);
    if (!entry) return;

    const newPtsStr = prompt('Enter updated points amount:', String(entry.points));
    if (newPtsStr === null) return;
    const newPts = Number(newPtsStr.trim());
    if (isNaN(newPts) || newPts <= 0) return alert('Please enter a valid positive points number.');

    const newReason = prompt('Enter updated award reason / note:', entry.reason);
    if (newReason === null) return;
    if (!newReason.trim()) return alert('Reason cannot be blank.');

    entry.points = newPts;
    entry.reason = newReason.trim();

    try {
        await setDoc(doc(db, `${BASE_PATH}/studentBonusPoints`, studentId), {
            pointsList: bonusList,
            updatedAt: Date.now()
        }, { merge: true });

        studentBonusPointsMap[studentId] = bonusList;
        renderStudentBonusHistoryTable(studentId);
        showToast('Bonus award updated!', 'success');
        loadRewardsLeaderboard();
    } catch (err) {
        alert('Failed to update bonus entry: ' + err.message);
    }
};

const deleteStudentBonusEntry = (studentId, entryId) => {
    const bonusList = studentBonusPointsMap[studentId] || [];
    const entry = bonusList.find(b => b.id === entryId);
    if (!entry) return;

    showConfirmDialog({
        title: 'Revoke Bonus Points',
        message: `Are you sure you want to revoke this award of +${entry.points} points (${entry.reason})?`,
        confirmText: 'Yes, Revoke',
        confirmBtnClass: 'bg-rose-600 hover:bg-rose-700',
        onConfirm: async () => {
            const updated = bonusList.filter(b => b.id !== entryId);
            try {
                await setDoc(doc(db, `${BASE_PATH}/studentBonusPoints`, studentId), {
                    pointsList: updated,
                    updatedAt: Date.now()
                }, { merge: true });

                studentBonusPointsMap[studentId] = updated;
                renderStudentBonusHistoryTable(studentId);
                showToast('Bonus points revoked', 'info');
                loadRewardsLeaderboard();
            } catch (err) {
                alert('Failed to remove bonus entry: ' + err.message);
            }
        }
    });
};

// --- Custom Badge Modal Handlers (With Edit & Delete + Confirmation) ---
const openCustomBadgeModal = (studentId) => {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('modal-badge-student-id').value = studentId;
    const subEl = document.getElementById('modal-badge-student-sub');
    if (subEl) subEl.textContent = `${student.name} (Adm: ${student.adm || student.admNo || '--'}, Class ${student.class})`;

    const input = document.getElementById('modal-badge-input');
    if (input) input.value = '';

    renderStudentCustomBadgesInModal(studentId);
    openModal('modal-custom-badge');
};

const renderStudentCustomBadgesInModal = (studentId) => {
    const container = document.getElementById('student-custom-badges-container');
    if (!container) return;

    const badges = studentCustomBadgesMap[studentId] || [];
    if (!badges.length) {
        container.innerHTML = `<span class="text-xs text-slate-400 font-bold p-1">No custom badges assigned yet.</span>`;
        return;
    }

    container.innerHTML = badges.map(b => `
        <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1.5">
            <i class="fas fa-medal text-purple-600 text-[10px]"></i>
            <span>${escapeHtml(b)}</span>
            <button type="button" class="btn-edit-student-badge text-purple-600 hover:text-amber-700 text-xs ml-1 cursor-pointer" data-student-id="${studentId}" data-badge="${escapeHtml(b)}" title="Edit Badge">
                <i class="fas fa-pencil-alt text-[10px]"></i>
            </button>
            <button type="button" class="btn-remove-student-badge text-purple-600 hover:text-rose-600 text-xs ml-0.5 cursor-pointer" data-student-id="${studentId}" data-badge="${escapeHtml(b)}" title="Remove Badge">
                &times;
            </button>
        </span>
    `).join('');
};

const addCustomBadgeToStudent = async (studentId, badgeName) => {
    if (!studentId || !badgeName) return;
    const existing = studentCustomBadgesMap[studentId] || [];
    if (existing.includes(badgeName)) {
        return alert('This badge has already been assigned to this student.');
    }

    const updated = [...existing, badgeName];
    try {
        await setDoc(doc(db, `${BASE_PATH}/studentCustomBadges`, studentId), {
            badges: updated,
            updatedAt: Date.now()
        }, { merge: true });

        studentCustomBadgesMap[studentId] = updated;
        renderStudentCustomBadgesInModal(studentId);
        showToast(`Badge "${badgeName}" assigned!`, 'success');
        loadRewardsLeaderboard();
    } catch (err) {
        alert('Failed to save custom badge: ' + err.message);
    }
};

const editCustomBadgeForStudent = async (studentId, oldBadgeName) => {
    const existing = studentCustomBadgesMap[studentId] || [];
    const newBadgeName = prompt('Edit badge name:', oldBadgeName);
    if (newBadgeName === null) return;
    const cleanName = newBadgeName.trim();
    if (!cleanName) return alert('Badge name cannot be empty.');
    if (cleanName === oldBadgeName) return;

    const updated = existing.map(b => b === oldBadgeName ? cleanName : b);
    try {
        await setDoc(doc(db, `${BASE_PATH}/studentCustomBadges`, studentId), {
            badges: updated,
            updatedAt: Date.now()
        }, { merge: true });

        studentCustomBadgesMap[studentId] = updated;
        renderStudentCustomBadgesInModal(studentId);
        showToast(`Badge updated to "${cleanName}"!`, 'success');
        loadRewardsLeaderboard();
    } catch (err) {
        alert('Failed to edit badge: ' + err.message);
    }
};

const removeCustomBadgeFromStudent = (studentId, badgeName) => {
    const student = allStudents.find(s => s.id === studentId);
    showConfirmDialog({
        title: 'Remove Custom Badge',
        message: `Are you sure you want to remove badge "${badgeName}" from ${student?.name || 'student'}?`,
        confirmText: 'Yes, Remove',
        confirmBtnClass: 'bg-rose-600 hover:bg-rose-700',
        onConfirm: async () => {
            const existing = studentCustomBadgesMap[studentId] || [];
            const updated = existing.filter(b => b !== badgeName);
            try {
                await setDoc(doc(db, `${BASE_PATH}/studentCustomBadges`, studentId), {
                    badges: updated,
                    updatedAt: Date.now()
                }, { merge: true });

                studentCustomBadgesMap[studentId] = updated;
                renderStudentCustomBadgesInModal(studentId);
                showToast(`Badge "${badgeName}" removed!`, 'info');
                loadRewardsLeaderboard();
            } catch (err) {
                alert('Failed to remove custom badge: ' + err.message);
            }
        }
    });
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

    // Confirmation Modal Handlers
    document.getElementById('btn-confirm-action-ok')?.addEventListener('click', () => {
        closeModal('modal-confirm-action');
        if (typeof pendingConfirmCallback === 'function') {
            const cb = pendingConfirmCallback;
            pendingConfirmCallback = null;
            cb();
        }
    });
    document.getElementById('btn-confirm-action-cancel')?.addEventListener('click', () => {
        closeModal('modal-confirm-action');
        pendingConfirmCallback = null;
    });

    // 2. Dashboard Class Select Listener
    document.getElementById('dashboard-class-select')?.addEventListener('change', loadDashboardView);

    // 3. Manage Tasks Tab Listeners
    const cadenceSelect = document.getElementById('task-def-cadence');
    const wrapperWeek = document.getElementById('wrapper-task-day-week');
    const wrapperMonth = document.getElementById('wrapper-task-day-month');

    if (cadenceSelect) {
        cadenceSelect.addEventListener('change', () => {
            const val = cadenceSelect.value;
            if (val === 'weekly') {
                wrapperWeek?.classList.remove('hidden');
                wrapperMonth?.classList.add('hidden');
            } else if (val === 'monthly') {
                wrapperWeek?.classList.add('hidden');
                wrapperMonth?.classList.remove('hidden');
            } else {
                wrapperWeek?.classList.add('hidden');
                wrapperMonth?.classList.add('hidden');
            }
        });
    }

    // Edit task cadence listener
    const editCadenceSelect = document.getElementById('edit-task-cadence');
    const editWrapperWeek = document.getElementById('wrapper-edit-task-day-week');
    const editWrapperMonth = document.getElementById('wrapper-edit-task-day-month');
    if (editCadenceSelect) {
        editCadenceSelect.addEventListener('change', () => {
            const val = editCadenceSelect.value;
            if (val === 'weekly') {
                editWrapperWeek?.classList.remove('hidden');
                editWrapperMonth?.classList.add('hidden');
            } else if (val === 'monthly') {
                editWrapperWeek?.classList.add('hidden');
                editWrapperMonth?.classList.remove('hidden');
            } else {
                editWrapperWeek?.classList.add('hidden');
                editWrapperMonth?.classList.add('hidden');
            }
        });
    }

    // Add new task form submit
    document.getElementById('form-add-task-def')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('task-def-title')?.value.trim();
        const cadence = document.getElementById('task-def-cadence')?.value || 'daily';
        const dayOfWeek = cadence === 'weekly' ? (document.getElementById('task-def-day-week')?.value || '') : '';
        const dayOfMonth = cadence === 'monthly' ? (document.getElementById('task-def-day-month')?.value || '') : '';
        const points = Number(document.getElementById('task-def-points')?.value || 5);

        if (!title) return alert('Please enter a task title.');

        const newTask = {
            id: `task_${Date.now()}`,
            title,
            cadence,
            dayOfWeek,
            dayOfMonth,
            points
        };

        const updated = [...taskDefsList, newTask];
        await saveTaskDefinitionsToFirestore(updated);

        // Reset form
        document.getElementById('task-def-title').value = '';
        document.getElementById('task-def-points').value = '5';
    });

    // Save edited task form submit
    document.getElementById('form-edit-task-def')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskId = document.getElementById('edit-task-id')?.value;
        const title = document.getElementById('edit-task-title')?.value.trim();
        const cadence = document.getElementById('edit-task-cadence')?.value || 'daily';
        const dayOfWeek = cadence === 'weekly' ? (document.getElementById('edit-task-day-week')?.value || '') : '';
        const dayOfMonth = cadence === 'monthly' ? (document.getElementById('edit-task-day-month')?.value || '') : '';
        const points = Number(document.getElementById('edit-task-points')?.value || 5);

        if (!taskId || !title) return alert('Task title cannot be empty.');

        const updated = taskDefsList.map(t => {
            if (t.id === taskId) {
                return { ...t, title, cadence, dayOfWeek, dayOfMonth, points };
            }
            return t;
        });

        await saveTaskDefinitionsToFirestore(updated);
        closeModal('modal-edit-task-def');
        showToast('Task updated successfully!', 'success');
    });

    document.querySelectorAll('.task-def-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.task-def-filter-btn').forEach(b => {
                b.classList.remove('bg-amber-500', 'text-white');
                b.classList.add('text-slate-600', 'hover:bg-slate-200');
            });
            btn.classList.add('bg-amber-500', 'text-white');
            btn.classList.remove('text-slate-600', 'hover:bg-slate-200');
            taskDefFilter = btn.dataset.filter || 'all';
            loadTaskDefsTable();
        });
    });

    // Edit and Delete buttons on configured tasks table
    document.getElementById('task-defs-table-tbody')?.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('.btn-edit-task-def');
        if (btnEdit) {
            const taskId = btnEdit.dataset.taskId;
            if (taskId) openEditTaskModal(taskId);
            return;
        }

        const btnDel = e.target.closest('.btn-delete-task-def');
        if (btnDel) {
            const taskId = btnDel.dataset.taskId;
            const task = taskDefsList.find(t => t.id === taskId);
            if (!task) return;

            showConfirmDialog({
                title: 'Delete Routine Task',
                message: `Are you sure you want to delete task "${task.title}"?`,
                confirmText: 'Yes, Delete',
                confirmBtnClass: 'bg-rose-600 hover:bg-rose-700',
                onConfirm: async () => {
                    const updated = taskDefsList.filter(t => t.id !== taskId);
                    await saveTaskDefinitionsToFirestore(updated);
                }
            });
        }
    });

    // 4. Routine Tasks Checklist Listeners (Strict Explicit Save)
    document.getElementById('tasks-class-select')?.addEventListener('change', loadTasksRoster);
    document.getElementById('tasks-date-input')?.addEventListener('change', loadTasksRoster);
    document.querySelectorAll('.tasks-freq-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tasks-freq-btn').forEach(b => {
                b.classList.remove('bg-amber-500', 'text-white', 'shadow-2xs');
                b.classList.add('text-slate-600', 'hover:bg-slate-100');
            });
            btn.classList.add('bg-amber-500', 'text-white', 'shadow-2xs');
            btn.classList.remove('text-slate-600', 'hover:bg-slate-100');
            currentTaskCadence = btn.dataset.freq;
            loadTasksRoster();
        });
    });

    // Individual checkbox change (NO AUTO-SAVE, flags unsaved changes)
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

        setTasksUnsavedState(true);
    });

    // Column header bulk tick button for a specific task (NO AUTO-SAVE)
    document.getElementById('tasks-roster-thead')?.addEventListener('click', (e) => {
        const bulkBtn = e.target.closest('.btn-bulk-task-col');
        if (!bulkBtn) return;
        const taskId = bulkBtn.dataset.taskId;
        if (!taskId) return;

        const cbs = document.querySelectorAll(`.task-check-box[data-task-id="${taskId}"]`);
        const allChecked = Array.from(cbs).every(cb => cb.checked);
        const targetState = !allChecked;

        cbs.forEach(cb => {
            cb.checked = targetState;
            const sId = cb.dataset.studentId;
            if (!taskCompletionsMap[sId]) taskCompletionsMap[sId] = {};
            taskCompletionsMap[sId][taskId] = targetState;

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
        });

        setTasksUnsavedState(true);
    });

    document.getElementById('btn-tasks-clear-all')?.addEventListener('click', () => {
        document.querySelectorAll('.task-check-box').forEach(cb => {
            cb.checked = false;
        });
        taskCompletionsMap = {};
        document.querySelectorAll('.student-task-score').forEach(el => {
            el.textContent = '0 pts';
        });
        setTasksUnsavedState(true);
    });

    // Explicit Save Button for Routine Tasks
    document.getElementById('btn-save-tasks')?.addEventListener('click', saveTasksCompletionsToFirestore);

    // 5. Prayer Tracker Listeners (Strict Explicit Save)
    document.getElementById('prayer-class-select')?.addEventListener('change', loadPrayerRoster);
    document.getElementById('prayer-date-input')?.addEventListener('change', loadPrayerRoster);
    document.getElementById('btn-save-prayer')?.addEventListener('click', savePrayerRecords);

    // Individual prayer pill click (NO AUTO-SAVE, flags unsaved changes)
    document.getElementById('prayer-roster-tbody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.prayer-toggle-btn');
        if (!btn) return;
        const group = btn.closest('.prayer-pill-group');
        if (group) {
            group.querySelectorAll('.prayer-toggle-btn').forEach(b => {
                b.classList.remove('bg-emerald-600', 'bg-blue-600', 'bg-rose-600', 'text-white', 'shadow-2xs');
                b.classList.add('text-slate-500');
            });
            const val = btn.dataset.val;
            btn.classList.remove('text-slate-500');
            if (val === 'J') btn.classList.add('bg-emerald-600', 'text-white', 'shadow-2xs');
            else if (val === 'A') btn.classList.add('bg-blue-600', 'text-white', 'shadow-2xs');
            else if (val === 'Q') btn.classList.add('bg-rose-600', 'text-white', 'shadow-2xs');

            setPrayerUnsavedState(true);
        }
    });

    // Column header bulk prayer button ([J], [A], [Q]) (NO AUTO-SAVE)
    document.getElementById('prayer-roster-thead')?.addEventListener('click', (e) => {
        const bulkBtn = e.target.closest('.btn-prayer-bulk-mark');
        if (!bulkBtn) return;
        const prayerKey = bulkBtn.dataset.prayer;
        const val = bulkBtn.dataset.val; // 'J' | 'A' | 'Q'
        if (!prayerKey || !val) return;

        document.querySelectorAll(`[data-prayer="${prayerKey}"] .prayer-pill-group`).forEach(group => {
            group.querySelectorAll('.prayer-toggle-btn').forEach(b => {
                b.classList.remove('bg-emerald-600', 'bg-blue-600', 'bg-rose-600', 'text-white', 'shadow-2xs');
                b.classList.add('text-slate-500');
            });
            const targetBtn = group.querySelector(`.prayer-toggle-btn[data-val="${val}"]`);
            if (targetBtn) {
                targetBtn.classList.remove('text-slate-500');
                if (val === 'J') targetBtn.classList.add('bg-emerald-600', 'text-white', 'shadow-2xs');
                else if (val === 'A') targetBtn.classList.add('bg-blue-600', 'text-white', 'shadow-2xs');
                else if (val === 'Q') targetBtn.classList.add('bg-rose-600', 'text-white', 'shadow-2xs');
            }
        });

        setPrayerUnsavedState(true);
        showToast(`Selected ${val === 'J' ? "Jama'ah" : (val === 'A' ? "Ada'" : "Qaza")} for all students. Click "Save Prayer Log" to commit.`, 'info');
    });

    // Custom Sunnah Prayer modal
    document.getElementById('btn-open-custom-prayer')?.addEventListener('click', () => {
        renderCustomPrayersListInModal();
        openModal('modal-custom-prayer');
    });

    document.getElementById('btn-add-custom-prayer-item')?.addEventListener('click', async () => {
        const nameInput = document.getElementById('modal-prayer-name-input');
        const name = nameInput?.value.trim();
        if (!name) return alert('Please enter prayer name.');

        const id = `prayer_${Date.now()}`;
        const updated = [...customPrayersList, { id, name }];

        try {
            await setDoc(doc(db, `${BASE_PATH}/prayerSettings`, 'customPrayers'), {
                list: updated,
                updatedAt: Date.now()
            }, { merge: true });

            customPrayersList = updated;
            if (nameInput) nameInput.value = '';
            renderCustomPrayersListInModal();
            loadPrayerRoster();
            showToast(`Sunnah prayer "${name}" added!`, 'success');
        } catch (err) {
            alert('Failed to add custom prayer: ' + err.message);
        }
    });

    // Edit and Remove Custom Sunnah Prayer
    document.getElementById('custom-prayers-list')?.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('.btn-edit-custom-prayer');
        if (btnEdit) {
            const id = btnEdit.dataset.id;
            const curName = btnEdit.dataset.name;
            const newName = prompt('Edit Sunnah prayer name:', curName);
            if (newName === null) return;
            const clean = newName.trim();
            if (!clean) return alert('Prayer name cannot be blank.');

            const updated = customPrayersList.map(p => p.id === id ? { ...p, name: clean } : p);
            setDoc(doc(db, `${BASE_PATH}/prayerSettings`, 'customPrayers'), {
                list: updated,
                updatedAt: Date.now()
            }, { merge: true }).then(() => {
                customPrayersList = updated;
                renderCustomPrayersListInModal();
                loadPrayerRoster();
                showToast(`Sunnah prayer renamed to "${clean}"!`, 'success');
            });
            return;
        }

        const btnRemove = e.target.closest('.btn-remove-custom-prayer');
        if (btnRemove) {
            const id = btnRemove.dataset.id;
            const name = btnRemove.dataset.name;
            if (!id) return;

            showConfirmDialog({
                title: 'Remove Sunnah Prayer',
                message: `Are you sure you want to remove the Sunnah prayer "${name}"?`,
                confirmText: 'Yes, Remove',
                confirmBtnClass: 'bg-rose-600 hover:bg-rose-700',
                onConfirm: async () => {
                    const updated = customPrayersList.filter(p => p.id !== id);
                    try {
                        await setDoc(doc(db, `${BASE_PATH}/prayerSettings`, 'customPrayers'), {
                            list: updated,
                            updatedAt: Date.now()
                        }, { merge: true });

                        customPrayersList = updated;
                        renderCustomPrayersListInModal();
                        loadPrayerRoster();
                        showToast('Custom prayer removed', 'info');
                    } catch (err) {
                        alert('Failed to remove prayer: ' + err.message);
                    }
                }
            });
        }
    });

    // Prayer Points Rules modal
    document.getElementById('btn-open-prayer-points-config')?.addEventListener('click', openPrayerPointsConfigModal);
    document.getElementById('btn-save-prayer-points-config')?.addEventListener('click', savePrayerPointsConfig);

    // 6. Rewards & Leaderboard Listeners
    document.getElementById('rewards-class-select')?.addEventListener('change', loadRewardsLeaderboard);
    document.getElementById('btn-rewards-settings')?.addEventListener('click', openRewardsSettingsModal);
    document.getElementById('btn-save-rewards-settings')?.addEventListener('click', saveRewardsRubric);
    document.getElementById('btn-open-award-points')?.addEventListener('click', () => openModal('modal-award-points'));
    document.getElementById('btn-submit-award-points')?.addEventListener('click', awardBonusPoints);
    document.getElementById('btn-print-leaderboard')?.addEventListener('click', () => window.print());

    document.getElementById('rewards-leaderboard-tbody')?.addEventListener('click', (e) => {
        const btnHistory = e.target.closest('.btn-view-bonus-history');
        if (btnHistory) {
            const stuId = btnHistory.dataset.studentId;
            openStudentBonusHistoryModal(stuId);
            return;
        }

        const btnAward = e.target.closest('.btn-award-single-student');
        if (btnAward) {
            const stuId = btnAward.dataset.studentId;
            const select = document.getElementById('modal-award-student-select');
            if (select) select.value = stuId;
            openModal('modal-award-points');
            return;
        }

        const btnBadge = e.target.closest('.btn-open-badge-modal');
        if (btnBadge) {
            const stuId = btnBadge.dataset.studentId;
            openCustomBadgeModal(stuId);
        }
    });

    // Student bonus history modal actions (Award new, Edit entry, Delete entry)
    document.getElementById('btn-history-award-new')?.addEventListener('click', () => {
        const stuId = document.getElementById('modal-bonus-history-student-id')?.value;
        closeModal('modal-student-bonus-history');
        const select = document.getElementById('modal-award-student-select');
        if (select && stuId) select.value = stuId;
        openModal('modal-award-points');
    });

    document.getElementById('bonus-history-table-tbody')?.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('.btn-edit-bonus-entry');
        if (btnEdit) {
            const stuId = btnEdit.dataset.studentId;
            const entryId = btnEdit.dataset.entryId;
            editStudentBonusEntry(stuId, entryId);
            return;
        }

        const btnDel = e.target.closest('.btn-delete-bonus-entry');
        if (btnDel) {
            const stuId = btnDel.dataset.studentId;
            const entryId = btnDel.dataset.entryId;
            deleteStudentBonusEntry(stuId, entryId);
        }
    });

    document.querySelectorAll('.btn-preset-pts').forEach(b => {
        b.addEventListener('click', () => {
            const pts = b.dataset.pts;
            const input = document.getElementById('modal-award-points-input');
            if (input) input.value = pts;
        });
    });

    // Custom Badge Modal Listeners
    document.getElementById('btn-save-custom-badge')?.addEventListener('click', () => {
        const studentId = document.getElementById('modal-badge-student-id')?.value;
        const badgeName = document.getElementById('modal-badge-input')?.value.trim();
        if (!studentId || !badgeName) return alert('Please enter a badge name.');
        addCustomBadgeToStudent(studentId, badgeName);
        document.getElementById('modal-badge-input').value = '';
    });

    document.querySelectorAll('.btn-preset-badge').forEach(b => {
        b.addEventListener('click', () => {
            const badge = b.dataset.badge;
            const input = document.getElementById('modal-badge-input');
            if (input && badge) input.value = badge;
        });
    });

    document.getElementById('student-custom-badges-container')?.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('.btn-edit-student-badge');
        if (btnEdit) {
            const studentId = btnEdit.dataset.studentId;
            const badge = btnEdit.dataset.badge;
            if (studentId && badge) {
                editCustomBadgeForStudent(studentId, badge);
            }
            return;
        }

        const btnRemove = e.target.closest('.btn-remove-student-badge');
        if (btnRemove) {
            const studentId = btnRemove.dataset.studentId;
            const badge = btnRemove.dataset.badge;
            if (studentId && badge) {
                removeCustomBadgeFromStudent(studentId, badge);
            }
        }
    });

    // 7. Sign Out
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
