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

// --- Prayer Tracker State ---
let selectedPrayerClass = '';
let selectedPrayerDate = new Date().toISOString().split('T')[0];
let customPrayersList = []; // [ { id, name } ]
let prayerRecordsMap = {}; // studentId -> { subh: 'J'|'A'|'Q', zuhr, asr, maghrib, isha, [customId]: 'J'|'A'|'Q' }

// --- Rewards & Leaderboard State ---
let selectedRewardsClass = '';
let studentBonusPointsMap = {}; // studentId -> [ { id, points, reason, awardedBy, date } ]
let studentCustomBadgesMap = {}; // studentId -> [ 'Badge Name 1', 'Badge Name 2' ]
let currentRewardsRubric = {
    attendance: 5,
    jamaah: 15,
    adaa: 10,
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
    const topContainer = document.getElementById('dash-top-performers-container');
    const statusPrayerBadge = document.getElementById('dash-status-prayer-badge');
    const statusTasksBadge = document.getElementById('dash-status-tasks-badge');

    if (!selectedDashClass) {
        if (studentsEl) studentsEl.textContent = '0';
        if (prayerEl) prayerEl.textContent = '0%';
        if (tasksEl) tasksEl.textContent = '0%';
        if (pointsEl) pointsEl.textContent = '0';
        if (topContainer) topContainer.innerHTML = `<div class="p-4 text-center text-slate-400 font-bold">No class selected.</div>`;
        return;
    }

    const classStudents = allStudents.filter(s => isClassInDutyScope(s.class, [selectedDashClass]) && s.status !== 'alumni');
    const totalStudents = classStudents.length;
    if (studentsEl) studentsEl.textContent = totalStudents;

    const todayDate = getTodayDateString();

    // 1. Fetch Today's Prayer Record for this class
    let prayerLoggedCount = 0;
    try {
        const prayerDocId = `${currentAcademicYear}__${selectedDashClass}__${todayDate}`;
        const pSnap = await getDoc(doc(db, `${BASE_PATH}/ibadah`, prayerDocId));
        if (pSnap.exists()) {
            const recs = pSnap.data().records || {};
            classStudents.forEach(st => {
                if (recs[st.id] && (recs[st.id].subh || recs[st.id].zuhr || recs[st.id].asr || recs[st.id].maghrib || recs[st.id].isha)) {
                    prayerLoggedCount++;
                }
            });
        }
    } catch (_) {}

    const prayerPct = totalStudents > 0 ? Math.round((prayerLoggedCount / totalStudents) * 100) : 0;
    if (prayerEl) prayerEl.textContent = `${prayerPct}%`;
    if (prayerSubEl) prayerSubEl.textContent = `${prayerLoggedCount} of ${totalStudents} Recorded`;

    if (statusPrayerBadge) {
        if (prayerLoggedCount > 0) {
            statusPrayerBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300';
            statusPrayerBadge.textContent = prayerLoggedCount === totalStudents ? 'Completed' : 'Partially Logged';
        } else {
            statusPrayerBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-600';
            statusPrayerBadge.textContent = 'Pending';
        }
    }

    // 2. Fetch Today's Tasks Record
    let tasksCheckedCount = 0;
    let totalPossibleTasks = 0;
    const dailyDefs = taskDefsList.filter(t => t.cadence === 'daily');
    try {
        const taskDocId = `${currentAcademicYear}__${selectedDashClass}__${todayDate}__daily`;
        const tSnap = await getDoc(doc(db, `${BASE_PATH}/taskCompletions`, taskDocId));
        if (tSnap.exists()) {
            const comps = tSnap.data().completions || {};
            classStudents.forEach(st => {
                const stComps = comps[st.id] || {};
                dailyDefs.forEach(t => {
                    totalPossibleTasks++;
                    if (stComps[t.id]) tasksCheckedCount++;
                });
            });
        } else {
            totalPossibleTasks = totalStudents * dailyDefs.length;
        }
    } catch (_) {}

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

    // 3. Compute Top Performers & Total Badges for Dashboard
    let totalBadgesCount = 0;
    let aggregatePoints = 0;

    const studentRoster = classStudents.map(student => {
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

        const allBadges = [...autoBadges, ...customBadges];
        totalBadgesCount += allBadges.length;
        aggregatePoints += total;

        return {
            student,
            total,
            badges: allBadges
        };
    });

    studentRoster.sort((a, b) => b.total - a.total);

    if (pointsEl) pointsEl.textContent = aggregatePoints;
    if (badgesSubEl) badgesSubEl.textContent = `${totalBadgesCount} Badges Active`;

    if (topContainer) {
        const top3 = studentRoster.slice(0, 3);
        if (!top3.length) {
            topContainer.innerHTML = `<div class="p-6 text-center text-slate-400 font-bold text-xs">No active students in Class ${selectedDashClass}.</div>`;
        } else {
            topContainer.innerHTML = top3.map((item, idx) => {
                const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');
                const medalBg = idx === 0 ? 'bg-amber-100 text-amber-800 border-amber-300' : (idx === 1 ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-amber-50 text-amber-700 border-amber-200');

                return `
                    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-amber-50/40 border border-slate-200 transition">
                        <div class="flex items-center gap-3">
                            <span class="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm border ${medalBg}">${medal}</span>
                            <div>
                                <h4 class="font-extrabold text-xs text-slate-900 leading-tight">${escapeHtml(item.student.name || '--')}</h4>
                                <span class="text-[10px] text-slate-500 font-mono">Adm: ${escapeHtml(item.student.adm || item.student.admNo || '-')}</span>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="font-black text-xs text-amber-700">${item.total} pts</div>
                            <div class="text-[10px] text-slate-500 font-bold">${item.badges.length} badges</div>
                        </div>
                    </div>`;
            }).join('');
        }
    }
};

// =========================================================================
// MODULE 2: MANAGE & ADD TASKS LOGIC
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
    // Determine if any weekly task has a designated day
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

    // Determine monthly task schedule
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
                    <button type="button" class="btn-delete-task-def p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 font-bold text-xs cursor-pointer" data-task-id="${task.id}" title="Delete Task">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
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
// MODULE 3: ROUTINE TASKS CHECKLIST LOGIC
// =========================================================================
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

    const currentCadenceTasks = taskDefsList.filter(t => t.cadence === currentTaskCadence);

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
                ${currentCadenceTasks.map(t => {
                    let schedTag = '';
                    if (t.cadence === 'weekly' && t.dayOfWeek) schedTag = `<div class="text-[9px] text-amber-700 font-normal">(${t.dayOfWeek})</div>`;
                    if (t.cadence === 'monthly' && t.dayOfMonth) schedTag = `<div class="text-[9px] text-purple-700 font-normal">(${t.dayOfMonth})</div>`;
                    return `
                        <th class="py-2 px-3 text-center">
                            <div class="font-extrabold text-slate-800 text-[11px]">${escapeHtml(t.title)} (${t.points}p)</div>
                            ${schedTag}
                            <button type="button" class="btn-bulk-task-col mt-1 px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-600 hover:text-white text-amber-900 font-black text-[10px] transition cursor-pointer" data-task-id="${t.id}" title="Toggle All for ${escapeHtml(t.title)}">
                                <i class="fas fa-check-double mr-1"></i>All
                            </button>
                        </th>`;
                }).join('')}
                <th class="py-2.5 px-3 text-center">Score</th>
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
            <tr class="hover:bg-slate-50/80" data-student-id="${student.id}">
                <td class="py-2 px-3 font-bold text-slate-400">${idx + 1}</td>
                <td class="py-2 px-3 font-mono font-bold text-slate-600">${escapeHtml(student.adm || student.admNo || '-')}</td>
                <td class="py-2 px-4 font-black text-slate-900">${escapeHtml(student.name || '--')}</td>
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
// MODULE 4: PRAYER TRACKER LOGIC
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
            <button type="button" class="btn-remove-custom-prayer p-1 text-rose-600 hover:bg-rose-50 rounded font-bold cursor-pointer" data-id="${p.id}" title="Remove Prayer">
                <i class="fas fa-trash-alt"></i>
            </button>
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
                <th class="py-2.5 px-3">#</th>
                <th class="py-2.5 px-3">Adm No</th>
                <th class="py-2.5 px-4">Student Name</th>
                ${activePrayers.map(p => `
                    <th class="py-2 px-2 text-center" data-prayer-col="${p.key}">
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
            <tr class="hover:bg-slate-50/80" data-student-id="${student.id}">
                <td class="py-2.5 px-3 font-bold text-slate-400">${idx + 1}</td>
                <td class="py-2.5 px-3 font-mono font-bold text-slate-600">${escapeHtml(student.adm || student.admNo || '-')}</td>
                <td class="py-2.5 px-4 font-black text-slate-900">${escapeHtml(student.name || '--')}</td>
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

        showToast('Prayer log saved successfully!', 'success');
    } catch (err) {
        alert('Failed to save prayer records: ' + err.message);
    }
};

// =========================================================================
// MODULE 5: REWARDS, POINTS & BADGES LEADERBOARD LOGIC
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
    const taskInput = document.getElementById('rubric-pts-task');

    if (attInput) attInput.value = currentRewardsRubric.attendance || 5;
    if (jamInput) jamInput.value = currentRewardsRubric.jamaah || 15;
    if (adaaInput) adaaInput.value = currentRewardsRubric.adaa || 10;
    if (taskInput) taskInput.value = currentRewardsRubric.task || 10;

    openModal('modal-rewards-settings');
};

const saveRewardsRubric = async () => {
    const attendance = Number(document.getElementById('rubric-pts-attendance')?.value || 5);
    const jamaah = Number(document.getElementById('rubric-pts-jamaah')?.value || 15);
    const adaa = Number(document.getElementById('rubric-pts-adaa')?.value || 10);
    const task = Number(document.getElementById('rubric-pts-task')?.value || 10);

    currentRewardsRubric = { attendance, jamaah, adaa, task, bonus: 10 };

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
        const prayerPts = (currentRewardsRubric.jamaah || 15) * 5;
        const tasksPts = (currentRewardsRubric.task || 10) * 3;

        const bonusList = studentBonusPointsMap[student.id] || [];
        const bonusPts = bonusList.reduce((acc, b) => acc + Number(b.points || 0), 0);

        const total = attPts + prayerPts + tasksPts + bonusPts;

        const autoBadges = [];
        if (total >= 200) autoBadges.push('Punctual Star');
        if (prayerPts >= 70) autoBadges.push('Prayer Champion');
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
                    <button type="button" class="btn-award-single-student p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 font-bold text-xs cursor-pointer" data-student-id="${item.student.id}" title="Award Bonus Points">
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

// --- Custom Badge Modal Handlers ---
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
            ${escapeHtml(b)}
            <button type="button" class="btn-remove-student-badge text-purple-600 hover:text-rose-600 text-xs ml-0.5 cursor-pointer" data-student-id="${studentId}" data-badge="${escapeHtml(b)}">
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

const removeCustomBadgeFromStudent = async (studentId, badgeName) => {
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

    document.getElementById('task-defs-table-tbody')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-delete-task-def');
        if (!btn) return;
        const taskId = btn.dataset.taskId;
        if (!taskId) return;
        if (confirm('Are you sure you want to delete this task definition?')) {
            const updated = taskDefsList.filter(t => t.id !== taskId);
            await saveTaskDefinitionsToFirestore(updated);
        }
    });

    // 4. Routine Tasks Checklist Listeners
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

    // Individual checkbox change
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

    // Column header bulk tick button for a specific task
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

        saveTasksCompletionsToFirestore();
        showToast(`Task updated for all students!`, 'info');
    });

    document.getElementById('btn-tasks-clear-all')?.addEventListener('click', () => {
        document.querySelectorAll('.task-check-box').forEach(cb => {
            cb.checked = false;
        });
        taskCompletionsMap = {};
        saveTasksCompletionsToFirestore();
        loadTasksRoster();
    });

    // 5. Prayer Tracker Listeners
    document.getElementById('prayer-class-select')?.addEventListener('change', loadPrayerRoster);
    document.getElementById('prayer-date-input')?.addEventListener('change', loadPrayerRoster);
    document.getElementById('btn-save-prayer')?.addEventListener('click', savePrayerRecords);

    // Individual prayer pill click
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
        }
    });

    // Column header bulk prayer button ([J], [A], [Q])
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

        showToast(`Marked ${val === 'J' ? "Jama'ah" : (val === 'A' ? "Ada'" : "Qaza")} for all students!`, 'info');
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

    document.getElementById('custom-prayers-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-remove-custom-prayer');
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;

        if (confirm('Remove this custom Sunnah prayer?')) {
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

    // 6. Rewards & Leaderboard Listeners
    document.getElementById('rewards-class-select')?.addEventListener('change', loadRewardsLeaderboard);
    document.getElementById('btn-rewards-settings')?.addEventListener('click', openRewardsSettingsModal);
    document.getElementById('btn-save-rewards-settings')?.addEventListener('click', saveRewardsRubric);
    document.getElementById('btn-open-award-points')?.addEventListener('click', () => openModal('modal-award-points'));
    document.getElementById('btn-submit-award-points')?.addEventListener('click', awardBonusPoints);
    document.getElementById('btn-print-leaderboard')?.addEventListener('click', () => window.print());

    document.getElementById('rewards-leaderboard-tbody')?.addEventListener('click', (e) => {
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
        const btn = e.target.closest('.btn-remove-student-badge');
        if (!btn) return;
        const studentId = btn.dataset.studentId;
        const badge = btn.dataset.badge;
        if (studentId && badge) {
            removeCustomBadgeFromStudent(studentId, badge);
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
