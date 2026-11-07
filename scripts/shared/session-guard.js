(function () {
    // Clean URL Guard: Strip any lingering hash fragment on load/refresh so the page starts cleanly at base .html
    if (typeof window !== 'undefined' && window.location && window.location.hash) {
        try {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch (_) {}
    }

    const DEFAULT_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8;
    const DEFAULT_SESSION_IDLE_MAX_AGE_MS = 1000 * 60 * 45;
    const ROLE_SESSION_POLICY = {
        student: { maxAgeMs: 1000 * 60 * 60 * 2, idleMs: 1000 * 60 * 30 },
        staff: { maxAgeMs: 1000 * 60 * 60 * 12, idleMs: 1000 * 60 * 60 },
        admin: { maxAgeMs: 1000 * 60 * 60 * 8, idleMs: 1000 * 60 * 45 }
    };
    const STAFF_STATE_KEY = 'app_session_staff_state';
    const ADMIN_STATE_KEY = 'app_session_admin_state';
    const STUDENT_STATE_KEY = 'app_session_student_state';
    const STUDENT_ACCOUNTS_KEY = 'app_student_accounts';
    const REMEMBERED_ACCOUNTS_KEY = 'app_remembered_accounts';
    const CURRENT_ROLE_KEY = 'app_session_current_role';
    const FLASH_KEY = 'app_session_flash';

    const now = () => Date.now();

    const readJson = (key) => {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    };
    const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
    const removeKey = (key) => localStorage.removeItem(key);

    const setCurrentRole = (role = '') => {
        if (role) {
            sessionStorage.setItem(CURRENT_ROLE_KEY, role);
            localStorage.setItem(CURRENT_ROLE_KEY, role);
        } else {
            sessionStorage.removeItem(CURRENT_ROLE_KEY);
            localStorage.removeItem(CURRENT_ROLE_KEY);
        }
    };
    const getRole = () => {
        const storedRole = sessionStorage.getItem(CURRENT_ROLE_KEY) || localStorage.getItem(CURRENT_ROLE_KEY);
        if (storedRole) return storedRole;
        if (getStudentState()?.studentId) return 'student';
        if (isStateFresh(getStaffState(), 'staff')) return 'staff';
        if (isStateFresh(getAdminState(), 'admin')) return 'admin';
        return '';
    };

    const buildState = (extra = {}) => {
        const timestamp = now();
        return {
            startedAt: timestamp,
            lastActiveAt: timestamp,
            ...extra
        };
    };

    const getSessionPolicy = (role = '') => ROLE_SESSION_POLICY[role] || {
        maxAgeMs: DEFAULT_SESSION_MAX_AGE_MS,
        idleMs: DEFAULT_SESSION_IDLE_MAX_AGE_MS
    };

    const isStateFresh = (state, role = getRole()) => {
        if (!state || !state.lastActiveAt || !state.startedAt) return false;
        const policy = getSessionPolicy(role);
        const age = now() - Number(state.startedAt);
        const idle = now() - Number(state.lastActiveAt);
        const maxAgeMs = Number(policy.maxAgeMs || 0);
        const idleMs = Number(policy.idleMs || 0);
        const ageOk = maxAgeMs <= 0 || age <= maxAgeMs;
        const idleOk = idleMs <= 0 || idle <= idleMs;
        return ageOk && idleOk;
    };

    const getStaffState = () => readJson(STAFF_STATE_KEY);
    const getAdminState = () => readJson(ADMIN_STATE_KEY);
    const getStudentState = () => readJson(STUDENT_STATE_KEY);
    const getStudentAccounts = () => {
        const accounts = readJson(STUDENT_ACCOUNTS_KEY);
        return Array.isArray(accounts) ? accounts : [];
    };
    const saveStudentAccounts = (accounts = []) => writeJson(STUDENT_ACCOUNTS_KEY, accounts);

    const getRememberedAccounts = () => {
        let accounts = readJson(REMEMBERED_ACCOUNTS_KEY);
        if (!Array.isArray(accounts)) {
            const legacyStudents = getStudentAccounts();
            accounts = legacyStudents.map((st) => ({
                id: st.studentId,
                role: 'student',
                studentId: st.studentId,
                name: st.name || '',
                class: st.class || '',
                adm: st.adm || '',
                updatedAt: st.updatedAt || now()
            }));
            if (accounts.length) writeJson(REMEMBERED_ACCOUNTS_KEY, accounts);
        }
        return Array.isArray(accounts) ? accounts : [];
    };

    const saveRememberedAccounts = (accounts = []) => {
        writeJson(REMEMBERED_ACCOUNTS_KEY, accounts);
        const studentOnly = accounts.filter((a) => a.role === 'student');
        saveStudentAccounts(studentOnly.map((s) => ({
            studentId: s.studentId || s.id,
            name: s.name,
            class: s.class,
            adm: s.adm,
            updatedAt: s.updatedAt
        })));
    };

    const registerRememberedAccount = (accountData = {}) => {
        if (!accountData || !accountData.id || !accountData.role) return;
        const currentAccounts = getRememberedAccounts();
        const nextAccount = {
            ...accountData,
            updatedAt: now()
        };
        const updatedAccounts = [nextAccount, ...currentAccounts.filter((a) => a.id !== accountData.id)].slice(0, 10);
        saveRememberedAccounts(updatedAccounts);
    };

    const getStateByRole = (role) => {
        if (role === 'staff') return getStaffState();
        if (role === 'admin') return getAdminState();
        if (role === 'student') return getStudentState();
        return null;
    };

    const setFlash = (message) => {
        if (message) sessionStorage.setItem(FLASH_KEY, message);
    };

    const clearClientData = async () => {
        try {
            const preserve = {};
            const savedStudentAccounts = localStorage.getItem(STUDENT_ACCOUNTS_KEY);
            if (savedStudentAccounts) preserve[STUDENT_ACCOUNTS_KEY] = savedStudentAccounts;
            const savedRemembered = localStorage.getItem(REMEMBERED_ACCOUNTS_KEY);
            if (savedRemembered) preserve[REMEMBERED_ACCOUNTS_KEY] = savedRemembered;
            localStorage.clear();
            Object.entries(preserve).forEach(([key, value]) => localStorage.setItem(key, value));
        } catch (error) {
            console.warn('Local storage clear failed.', error);
        }

        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
            } catch (error) {
                console.warn('Cache storage clear failed.', error);
            }
        }
    };

    const clearAll = async (options = {}) => {
        [STAFF_STATE_KEY, ADMIN_STATE_KEY, STUDENT_STATE_KEY].forEach(removeKey);
        setCurrentRole('');
        if (options.purgeClientData) {
            await clearClientData();
        }
    };

    const pruneExpiredStates = () => {
        if (!isStateFresh(getStaffState(), 'staff')) removeKey(STAFF_STATE_KEY);
        if (!isStateFresh(getAdminState(), 'admin')) removeKey(ADMIN_STATE_KEY);
        const studentState = getStudentState();
        if (studentState && !studentState.studentId) removeKey(STUDENT_STATE_KEY);
    };

    const touchSession = () => {
        const role = getRole();
        const state = getStateByRole(role);
        if (!state) return;
        if (role !== 'student' && !isStateFresh(state, role)) return;
        writeJson(role === 'admin' ? ADMIN_STATE_KEY : role === 'staff' ? STAFF_STATE_KEY : STUDENT_STATE_KEY, {
            ...state,
            lastActiveAt: now()
        });
    };

    const hasStaffSession = () => isStateFresh(getStaffState(), 'staff');
    const hasAdminSession = () => isStateFresh(getAdminState(), 'admin');
    const hasStudentSession = () => Boolean(getStudentState()?.studentId);

    const redirectHome = (message = '') => {
        setFlash(message);
        window.location.href = 'index.html';
    };

    let activityBound = false;
    const bindActivityTracking = () => {
        if (activityBound) return;
        activityBound = true;

        let lastTouch = 0;
        const throttledTouch = () => {
            const currentTime = now();
            if ((currentTime - lastTouch) < 15000) return;
            lastTouch = currentTime;
            touchSession();
        };

        ['click', 'keydown', 'pointerdown', 'focus'].forEach((eventName) => {
            window.addEventListener(eventName, throttledTouch, { passive: true });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') throttledTouch();
        });
    };

    pruneExpiredStates();
    bindActivityTracking();

    window.AppSession = {
        SESSION_MAX_AGE_MS: DEFAULT_SESSION_MAX_AGE_MS,
        SESSION_IDLE_MAX_AGE_MS: DEFAULT_SESSION_IDLE_MAX_AGE_MS,
        SESSION_POLICY: ROLE_SESSION_POLICY,
        clearAll,
        async signOut(authInstance, options = {}) {
            try {
                if (authInstance && typeof authInstance.signOut === 'function') {
                    await authInstance.signOut();
                } else if (window.__firebaseAuth && typeof window.__firebaseAuth.signOut === 'function') {
                    await window.__firebaseAuth.signOut();
                }
            } catch (err) {
                console.warn('Firebase sign out failed:', err);
            }
            await clearAll({ purgeClientData: true, ...options });
            const redirectUrl = options.redirectUrl !== undefined ? options.redirectUrl : 'index.html';
            if (redirectUrl) {
                window.location.href = redirectUrl;
            }
        },
        consumeFlash() {
            const message = sessionStorage.getItem(FLASH_KEY) || '';
            if (message) sessionStorage.removeItem(FLASH_KEY);
            return message;
        },
        getStartedAt() {
            const role = getRole();
            const state = getStateByRole(role);
            return Number(state?.startedAt || 0);
        },
        getLastActiveAt() {
            const role = getRole();
            const state = getStateByRole(role);
            return Number(state?.lastActiveAt || 0);
        },
        getRole,
        getRolePolicy(role = getRole()) {
            return getSessionPolicy(role);
        },
        getStudentId() {
            const state = getStudentState();
            return state?.studentId || '';
        },
        getStaffName() {
            const state = getStaffState();
            if (state?.name) return state.name;
            const official = readJson('official_portal_session_v1');
            return official?.name || '';
        },
        getStaffEmail() {
            const state = getStaffState();
            if (state?.email) return state.email;
            const official = readJson('official_portal_session_v1');
            return official?.email || official?.username || '';
        },
        isFresh() {
            const role = getRole();
            return isStateFresh(getStateByRole(role), role);
        },
        isModuleEnabled(moduleKey) {
            try {
                const raw = localStorage.getItem('app_enabled_modules');
                if (!raw) return true;
                const parsed = JSON.parse(raw);
                return parsed?.[moduleKey] !== false;
            } catch (_e) {
                return true;
            }
        },
        hasStudentSession,
        hasStaffSession,
        hasAdminSession,
        startStudent(studentId, profile = {}) {
            writeJson(STUDENT_STATE_KEY, buildState({ studentId, role: 'student' }));
            registerRememberedAccount({
                id: studentId,
                role: 'student',
                studentId,
                name: profile.name || '',
                class: profile.class || '',
                adm: profile.adm || ''
            });
            setCurrentRole('student');
        },
        getStudentAccounts() {
            return getStudentAccounts();
        },
        switchStudent(studentId = '') {
            const account = getStudentAccounts().find((item) => item.studentId === studentId);
            if (!account) return false;
            this.startStudent(studentId, account);
            return true;
        },
        logoutStudent(studentId = '', { removeAccount = false } = {}) {
            const activeStudentId = studentId || this.getStudentId();
            if (removeAccount && activeStudentId) {
                const nextAccounts = getStudentAccounts().filter((account) => account.studentId !== activeStudentId);
                saveStudentAccounts(nextAccounts);
            }
            removeKey(STUDENT_STATE_KEY);
            if (getRole() === 'student') setCurrentRole('');
        },
        startStaff(name = '', email = '', access = null) {
            const dutyClasses = Array.isArray(access?.dutyClasses) ? access.dutyClasses.filter(Boolean) : [];
            const staffId = access?.staffId || email || name;
            const profile = {
                id: staffId,
                staffId,
                name: name || 'Staff Member',
                email: email || '',
                role: access?.role || access?.type || 'Staff Member',
                type: access?.type || 'Staff',
                phone: access?.phone || '',
                photo: access?.photo || '',
                dutyClasses
            };
            writeJson(STAFF_STATE_KEY, buildState({
                name,
                email,
                role: 'staff',
                staffId,
                dutyClasses,
                profile,
                access: access && typeof access === 'object' ? access : null
            }));
            registerRememberedAccount({
                id: `staff_${staffId}`,
                role: 'staff',
                staffId: access?.staffId || '',
                name: name || 'Staff Member',
                email: email || '',
                roleTitle: access?.role || access?.type || 'Staff Member',
                access: access && typeof access === 'object' ? access : null,
                dutyClasses
            });
            setCurrentRole('staff');
        },
        getStaffAccess() {
            const state = getStaffState();
            return (state?.access && typeof state.access === 'object') ? state.access : null;
        },
        getStaffState() {
            const state = getStaffState();
            if (!state) return null;
            if (!state.profile) {
                const dutyClasses = Array.isArray(state.dutyClasses) ? state.dutyClasses
                    : (Array.isArray(state.access?.dutyClasses) ? state.access.dutyClasses : []);
                state.profile = {
                    id: state.staffId || state.access?.staffId || '',
                    staffId: state.staffId || state.access?.staffId || '',
                    name: state.name || '',
                    email: state.email || '',
                    role: state.access?.role || state.access?.type || 'Staff',
                    type: state.access?.type || 'Staff',
                    phone: state.access?.phone || '',
                    photo: state.access?.photo || '',
                    dutyClasses
                };
            }
            return state;
        },
        getAdminState() {
            return getAdminState();
        },
        getDutyClasses() {
            const staffState = this.getStaffState();
            if (Array.isArray(staffState?.dutyClasses) && staffState.dutyClasses.length) {
                return staffState.dutyClasses.filter(Boolean);
            }
            if (Array.isArray(staffState?.access?.dutyClasses) && staffState.access.dutyClasses.length) {
                return staffState.access.dutyClasses.filter(Boolean);
            }
            const officialSession = readJson('official_portal_session_v1');
            if (Array.isArray(officialSession?.dutyClasses) && officialSession.dutyClasses.length) {
                return officialSession.dutyClasses.filter(Boolean);
            }
            return [];
        },
        getSession() {
            const role = getRole();
            if (role === 'admin' || hasAdminSession()) {
                const adminState = getAdminState() || {};
                return {
                    id: 'admin',
                    staffId: 'admin',
                    name: adminState.name || 'Administrator',
                    username: adminState.email || 'admin',
                    email: adminState.email || 'admin',
                    role: 'Super Admin',
                    type: 'Admin',
                    source: 'legacy-admin',
                    actLikeSuperAdmin: true,
                    canAccessAdmin: true
                };
            }
            if (role === 'staff' || hasStaffSession()) {
                const state = this.getStaffState() || {};
                const official = readJson('official_portal_session_v1') || {};
                const access = state.access || official.access || {};
                const dutyClasses = this.getDutyClasses();
                return {
                    id: state.staffId || access.staffId || official.id || '',
                    staffId: state.staffId || access.staffId || official.id || '',
                    name: state.name || official.name || 'Staff Member',
                    username: state.email || official.username || official.email || '',
                    email: state.email || official.email || '',
                    phone: access.phone || official.phone || '',
                    role: access.role || official.role || 'Staff',
                    type: access.type || official.type || 'Staff',
                    photo: access.photo || official.photo || '',
                    dutyClasses,
                    access,
                    profile: state.profile || {
                        id: state.staffId || access.staffId || official.id || '',
                        name: state.name || official.name || 'Staff Member',
                        email: state.email || official.email || '',
                        role: access.role || official.role || 'Staff',
                        dutyClasses
                    },
                    source: 'staff',
                    actLikeSuperAdmin: access.actLikeSuperAdmin === true || official.actLikeSuperAdmin === true
                };
            }
            return null;
        },
        getUserSession() {
            return this.getSession() || {};
        },
        getCurrentSessionProfile() {
            const session = this.getSession();
            if (!session) return {};
            return {
                id: session.id || session.staffId || '',
                staffId: session.staffId || session.id || '',
                name: session.name || '',
                username: session.username || session.email || '',
                email: session.email || '',
                role: session.role || 'Staff',
                type: session.type || 'Staff',
                phone: session.phone || '',
                photo: session.photo || '',
                dutyClasses: session.dutyClasses || [],
                access: session.access || null
            };
        },
        getStaffProfile() {
            return this.getCurrentSessionProfile();
        },
        updateStaffAccess(partialAccess = {}) {
            const state = getStaffState();
            if (!state) return;
            const currentAccess = (state.access && typeof state.access === 'object') ? state.access : {};
            const updatedAccess = { ...currentAccess, ...partialAccess };
            const dutyClasses = Array.isArray(partialAccess.dutyClasses) ? partialAccess.dutyClasses.filter(Boolean)
                : (Array.isArray(state.dutyClasses) ? state.dutyClasses : []);
            const staffId = partialAccess.staffId || state.staffId || state.access?.staffId || '';
            const name = partialAccess.name || state.name || '';
            const updatedProfile = {
                ...(state.profile || {}),
                ...(staffId ? { id: staffId, staffId } : {}),
                ...(name ? { name } : {}),
                ...(dutyClasses.length ? { dutyClasses } : {})
            };
            writeJson(STAFF_STATE_KEY, {
                ...state,
                name: name || state.name,
                staffId: staffId || state.staffId,
                dutyClasses: dutyClasses.length ? dutyClasses : state.dutyClasses,
                profile: updatedProfile,
                access: updatedAccess
            });
        },
        startAdmin(adminProfile = {}) {
            writeJson(ADMIN_STATE_KEY, buildState({ role: 'admin' }));
            registerRememberedAccount({
                id: 'admin_master',
                role: 'admin',
                name: adminProfile?.name || 'Administrator',
                roleTitle: 'Super Admin',
                email: adminProfile?.email || 'admin'
            });
            setCurrentRole('admin');
        },
        getRememberedAccounts() {
            return getRememberedAccounts();
        },
        switchAccount(accountId = '') {
            const account = getRememberedAccounts().find((a) => a.id === accountId);
            if (!account) return false;

            if (account.role === 'student') {
                this.startStudent(account.studentId || account.id, account);
                window.location.href = 'student.html';
                return true;
            }

            if (account.role === 'staff') {
                const dutyClasses = Array.isArray(account.dutyClasses) && account.dutyClasses.length
                    ? account.dutyClasses
                    : (Array.isArray(account.access?.dutyClasses) ? account.access.dutyClasses : []);
                const staffAccess = account.access || {
                    staffId: account.staffId || '',
                    name: account.name || 'Staff Member',
                    role: account.roleTitle || 'Staff',
                    dutyClasses,
                    source: 'staff',
                    worksheet: true
                };
                if (!staffAccess.dutyClasses || !staffAccess.dutyClasses.length) {
                    staffAccess.dutyClasses = dutyClasses;
                }
                this.startStaff(account.name, account.email, staffAccess);

                const officialSessionObj = {
                    id: account.staffId || '',
                    name: account.name || 'Staff Member',
                    username: account.email || 'staff',
                    email: account.email || '',
                    phone: staffAccess.phone || '',
                    role: account.roleTitle || staffAccess.role || 'Staff',
                    type: staffAccess.type || 'Staff',
                    photo: staffAccess.photo || '',
                    dutyClasses,
                    canAccessAdmin: staffAccess.admin === true || staffAccess.canAccessAdmin === true,
                    actLikeSuperAdmin: staffAccess.actLikeSuperAdmin === true,
                    canCollect: staffAccess.collection === true,
                    canAccessWorksheet: staffAccess.worksheet !== false,
                    canManageResults: staffAccess.result === true,
                    canAccessAttendance: staffAccess.attendance === true,
                    canAccessAcademicPlan: staffAccess.academicPlan === true,
                    canAccessActivity: staffAccess.studentActivity === true || staffAccess.activity === true,
                    canAccessEvaluation: staffAccess.evaluation === true,
                    source: 'staff',
                    access: staffAccess
                };
                localStorage.setItem('official_portal_session_v1', JSON.stringify(officialSessionObj));
                window.location.href = 'official.html';
                return true;
            }

            if (account.role === 'admin') {
                this.startAdmin(account);
                const officialSessionObj = {
                    id: 'admin',
                    name: account.name || 'Administrator',
                    username: account.email || 'admin',
                    email: account.email || 'admin',
                    role: 'Super Admin',
                    type: 'Admin',
                    source: 'legacy-admin',
                    canAccessAdmin: true,
                    actLikeSuperAdmin: true,
                    canCollect: true,
                    canAccessWorksheet: true,
                    canManageResults: true,
                    canAccessAttendance: true,
                    canAccessAcademicPlan: true,
                    canAccessActivity: true,
                    canAccessEvaluation: true
                };
                localStorage.setItem('official_portal_session_v1', JSON.stringify(officialSessionObj));
                window.location.href = 'official.html';
                return true;
            }

            return false;
        },
        removeRememberedAccount(accountId = '') {
            if (!accountId) return;
            const updated = getRememberedAccounts().filter((a) => a.id !== accountId);
            saveRememberedAccounts(updated);
            if (getStudentState()?.studentId === accountId) {
                removeKey(STUDENT_STATE_KEY);
            }
        },
        touchSession,
        guardStudentPage() {
            pruneExpiredStates();
            if (this.isModuleEnabled('student') === false) {
                this.logoutStudent();
                redirectHome('Student Portal is currently disabled by institution administration.');
                return;
            }
            if (!hasStudentSession()) {
                redirectHome('Please log in to continue.');
                return;
            }
            setCurrentRole('student');
            if (!this.getStudentId()) redirectHome('Please select your student profile again.');
        },
        guardStaffOrAdminPage() {
            pruneExpiredStates();
            if (hasAdminSession()) {
                setCurrentRole('admin');
                return;
            }
            if (hasStaffSession()) {
                setCurrentRole('staff');
                return;
            }
            redirectHome('Your staff/admin session expired. Please log in again.');
        },
        guardStaffPageAccess(requiredPage = 'collection') {
            pruneExpiredStates();

            // Institutional module enablement check
            const enabledModules = (function () {
                try {
                    const raw = localStorage.getItem('app_enabled_modules');
                    return raw ? JSON.parse(raw) : null;
                } catch (_e) {
                    return null;
                }
            })();

            const MODULE_NAMES = {
                collection: 'Fee Collection',
                worksheet: 'Worksheet Hub',
                student: 'Student Directory',
                result: 'Exam Results',
                attendance: 'Attendance Register',
                academicPlan: 'Academic Planning',
                studentActivity: 'Activity & Rewards',
                classroomEvaluation: 'Classroom Evaluation',
                evaluation: 'Classroom Evaluation'
            };

            if (enabledModules && enabledModules[requiredPage] === false) {
                const modName = MODULE_NAMES[requiredPage] || 'Requested';
                setFlash(`Module Disabled: The ${modName} module is currently disabled by institution administration.`);
                window.location.href = 'official.html';
                return;
            }

            if (hasAdminSession() && !hasStaffSession()) {
                setCurrentRole('admin');
                return;
            }
            if (!hasStaffSession()) {
                if (hasAdminSession()) {
                    setCurrentRole('admin');
                    return;
                }
                redirectHome('Your staff session expired. Please log in again.');
                return;
            }
            setCurrentRole('staff');
            const access = this.getStaffAccess();
            if (access?.actLikeSuperAdmin === true || access?.canAccessAdmin === true || access?.admin === true) {
                return;
            }
            if (requiredPage === 'collection' && access && access.collection !== true) {
                setFlash('Access Restricted: Your account does not have Fee Collection page access.');
                window.location.href = 'official.html';
                return;
            }
            if (requiredPage === 'worksheet' && access && access.worksheet !== true) {
                setFlash('Access Restricted: Your account does not have Class Worksheet page access.');
                window.location.href = 'official.html';
                return;
            }
            if (requiredPage === 'student' && access && access.student !== true) {
                setFlash('Access Restricted: Your account does not have Student page access.');
                window.location.href = 'official.html';
                return;
            }
            if (requiredPage === 'result' && access) {
                const hasResultAccess = access.result === true || access.canManageResults === true || access.canAccessAdmin === true || access.admin === true || access.actLikeSuperAdmin === true;
                const collectionFallback = access.collection === true && window.location.search.includes('from=collection');
                if (!hasResultAccess && !collectionFallback) {
                    setFlash('Access Restricted: Your account does not have Result System page access.');
                    window.location.href = 'official.html';
                    return;
                }
            }
            if (requiredPage === 'attendance' && access && access.attendance !== true) {
                setFlash('Access Restricted: Your account does not have Attendance Register page access.');
                window.location.href = 'official.html';
                return;
            }
            if (requiredPage === 'academicPlan' && access && access.academicPlan !== true) {
                setFlash('Access Restricted: Your account does not have Academic Planning page access.');
                window.location.href = 'official.html';
                return;
            }
            if (requiredPage === 'studentActivity' && access && access.studentActivity !== true && access.activity !== true) {
                setFlash('Access Restricted: Your account does not have Activity & Rewards page access.');
                window.location.href = 'official.html';
                return;
            }
            if ((requiredPage === 'classroomEvaluation' || requiredPage === 'evaluation') && access && access.classroomEvaluation !== true && access.evaluation !== true && access.canAccessEvaluation !== true) {
                setFlash('Access Restricted: Your account does not have Classroom Evaluation page access.');
                window.location.href = 'official.html';
                return;
            }
        },
        guardAdminPage() {
            pruneExpiredStates();
            const requestedTab = (window.location.hash || '#dashboard').replace('#', '') || 'dashboard';
            const wantsResultsTab = requestedTab === 'results';
            if (hasAdminSession()) {
                setCurrentRole('admin');
                return;
            }
            if (hasStaffSession()) {
                const access = this.getStaffAccess();
                if (access && (access.canAccessAdmin === true || access.admin === true || access.actLikeSuperAdmin === true)) {
                    setCurrentRole('staff');
                    return;
                }
            }
            if (wantsResultsTab && hasStaffSession()) {
                // Allow result-operator/staff users to reach admin.html#results.
                // admin-page.js will perform strict Firebase + permission checks.
                setCurrentRole('staff');
                return;
            }
            redirectHome('Your admin session expired. Please log in again.');
        }
    };
}());
